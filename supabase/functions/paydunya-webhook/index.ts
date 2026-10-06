// Edge Function /paydunya-webhook — reçoit la notification de paiement (IPN) de PayDunya et active l'abonnement.
//
// À déployer SANS vérification de jeton (PayDunya n'a pas de compte Axone) :
//   supabase functions deploy paydunya-webhook --no-verify-jwt
//
// Sécurité : on ne fait PAS confiance au contenu de la notification. On n'en retient que le jeton de la facture,
// puis on interroge PayDunya directement (avec nos clés secrètes) pour connaître le vrai statut et le vrai montant.
// Une fausse notification ne peut donc rien activer.
//
// Secrets : PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN, PAYDUNYA_MODE.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Cherche le jeton de facture dans la notification (formulaire `data[invoice][token]` ou JSON). */
function findToken(raw: string, contentType: string): string | null {
  if (contentType.includes('json')) {
    try {
      const j = JSON.parse(raw)
      const d = j?.data ?? j
      return d?.invoice?.token ?? d?.token ?? null
    } catch {
      return null
    }
  }
  const params = new URLSearchParams(raw)
  for (const [k, v] of params) {
    if ((k === 'data[invoice][token]' || k === 'data[token]' || k === 'token') && v) return v
  }
  const blob = params.get('data')
  if (blob) {
    try {
      const j = JSON.parse(blob)
      return j?.invoice?.token ?? j?.token ?? null
    } catch { /* pas du JSON */ }
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Method Not Allowed' }, 405)

  const master = Deno.env.get('PAYDUNYA_MASTER_KEY')
  const priv = Deno.env.get('PAYDUNYA_PRIVATE_KEY')
  const tok = Deno.env.get('PAYDUNYA_TOKEN')
  if (!master || !priv || !tok) return reply({ error: 'not_configured' }, 503)
  const apiBase = Deno.env.get('PAYDUNYA_MODE') === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1'

  const raw = await req.text()
  const invoiceToken = findToken(raw, req.headers.get('content-type') ?? '')
  if (!invoiceToken || invoiceToken.length > 100) return reply({ ignored: true })

  // ── Vérité : on demande à PayDunya ─────────────────────────────────────────────
  const res = await fetch(`${apiBase}/checkout-invoice/confirm/${encodeURIComponent(invoiceToken)}`, {
    headers: {
      'PAYDUNYA-MASTER-KEY': master,
      'PAYDUNYA-PRIVATE-KEY': priv,
      'PAYDUNYA-TOKEN': tok,
    },
  })
  if (!res.ok) {
    console.error('[paydunya-webhook] vérification impossible', res.status)
    return reply({ error: 'verification_failed' }, 502) // PayDunya réessaiera
  }
  const out = await res.json() as { status?: string; invoice?: { total_amount?: number | string } }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  if (out.status === 'completed') {
    // Le montant payé doit être celui qu'on attendait
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('amount')
      .eq('reference_code', invoiceToken).eq('provider', 'paydunya')
      .maybeSingle()
    if (!sub) return reply({ ignored: true, reason: 'unknown_reference' })
    if (Number(out.invoice?.total_amount) !== Number(sub.amount)) {
      console.error('[paydunya-webhook] montant inattendu', invoiceToken, out.invoice?.total_amount, sub.amount)
      return reply({ ignored: true, reason: 'amount_mismatch' })
    }

    const { data: activated, error } = await supabase.rpc('activate_subscription_by_ref', { p_ref: invoiceToken })
    if (error) {
      console.error('[paydunya-webhook] activation:', error.message)
      return reply({ error: 'activation_failed' }, 500)
    }
    return reply({ activated: activated === true })
  }

  if (out.status === 'cancelled' || out.status === 'failed') {
    await supabase
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('reference_code', invoiceToken).eq('provider', 'paydunya').eq('status', 'pending')
    return reply({ closed: true })
  }

  return reply({ ignored: true, status: out.status ?? null })
})
