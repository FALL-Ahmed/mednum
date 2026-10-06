// Edge Function /kitpay-webhook — reçoit la confirmation de paiement de KitPay et active l'abonnement.
//
// À déployer SANS vérification de jeton (KitPay n'a pas de compte Axone) :
//   supabase functions deploy kitpay-webhook --no-verify-jwt
// La sécurité vient de la signature HMAC du webhook, vérifiée ici avant toute action.
//
// Dans le tableau de bord KitPay : adresse du webhook = https://<projet>.supabase.co/functions/v1/kitpay-webhook,
// événements : payment.succeeded, payment.expired, payment.cancelled. Le secret affiché va dans KITPAY_WEBHOOK_SECRET.
//
// Secrets : KITPAY_WEBHOOK_SECRET, KITPAY_BASE_URL, KITPAY_API_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyKitPaySignature } from '../_shared/kitpay.ts'

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Method Not Allowed' }, 405)

  const secret = Deno.env.get('KITPAY_WEBHOOK_SECRET')
  const base = Deno.env.get('KITPAY_BASE_URL')?.replace(/\/+$/, '')
  const apiKey = Deno.env.get('KITPAY_API_KEY')
  if (!secret || !base || !apiKey) return reply({ error: 'not_configured' }, 503)

  // ── 1. Authenticité : signature HMAC sur le corps brut ─────────────────────────
  const raw = await req.text()
  const header = req.headers.get('x-kitpay-signature') ?? ''
  if (!(await verifyKitPaySignature(raw, header, secret))) return reply({ error: 'invalid_signature' }, 401)

  let event: { type?: string; data?: { object?: { ref?: string } } }
  try {
    event = JSON.parse(raw)
  } catch {
    return reply({ error: 'invalid_json' }, 400)
  }
  const ref = event.data?.object?.ref
  if (!ref) return reply({ ignored: true })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // ── 2. Paiement réussi : on revérifie auprès de KitPay avant d'activer ─────────
  if (event.type === 'payment.succeeded') {
    const res = await fetch(`${base}/api/v1/intents/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      console.error('[kitpay-webhook] vérification impossible', res.status)
      return reply({ error: 'verification_failed' }, 502) // KitPay réessaiera plus tard
    }
    const intent = await res.json() as { status?: string; amount?: number }
    if (intent.status !== 'paid') return reply({ ignored: true, reason: 'not_paid' })

    // Le montant payé doit être celui qu'on attendait
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('amount')
      .eq('reference_code', ref).eq('provider', 'kitpay')
      .maybeSingle()
    if (!sub) return reply({ ignored: true, reason: 'unknown_reference' })
    if (Number(intent.amount) !== Number(sub.amount)) {
      console.error('[kitpay-webhook] montant inattendu', ref, intent.amount, sub.amount)
      return reply({ ignored: true, reason: 'amount_mismatch' })
    }

    const { data: activated, error } = await supabase.rpc('activate_subscription_by_ref', { p_ref: ref })
    if (error) {
      console.error('[kitpay-webhook] activation:', error.message)
      return reply({ error: 'activation_failed' }, 500) // KitPay réessaiera
    }
    return reply({ activated: activated === true })
  }

  // ── 3. Paiement expiré ou annulé : la demande en attente est fermée ────────────
  if (event.type === 'payment.expired' || event.type === 'payment.cancelled') {
    await supabase
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('reference_code', ref).eq('provider', 'kitpay').eq('status', 'pending')
    return reply({ closed: true })
  }

  return reply({ ignored: true })
})
