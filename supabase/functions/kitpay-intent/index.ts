// Edge Function /kitpay-intent — crée un paiement KitPay pour un abonnement (Mauritanie).
//
// Entrées (JSON, connexion obligatoire) :
//   { action: "probe" }                                   -> { enabled: boolean }  (KitPay est-il configuré ?)
//   { plan: "standard"|"premium", duration: "monthly"|"yearly", method: "bankily"|"masrivi"|"sedad"|"click", phone? }
//                                                         -> { ref, hosted_url }   (page de paiement à ouvrir)
//
// Le montant est TOUJOURS recalculé ici à partir de la table des plans (jamais lu dans la requête).
// Le serveur enregistre la demande « pending » ; l'activation se fait quand KitPay confirme (kitpay-webhook).
//
// Secrets : KITPAY_BASE_URL (ex. https://kitpay.mon-domaine.com), KITPAY_API_KEY (kp_test_… ou kp_live_…),
//           SITE_URL (adresse publique du site, pour le retour après paiement).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { KITPAY_METHODS } from '../_shared/kitpay.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  const base = Deno.env.get('KITPAY_BASE_URL')?.replace(/\/+$/, '')
  const apiKey = Deno.env.get('KITPAY_API_KEY')
  const enabled = !!(base && apiKey)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // ── Identité ───────────────────────────────────────────────────────────────────
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!bearer) return json({ error: 'unauthorized' }, 401)
  const { data: authData } = await supabase.auth.getUser(bearer)
  const uid = authData?.user?.id
  if (!uid) return json({ error: 'unauthorized' }, 401)

  let body: { action?: string; plan?: string; duration?: string; method?: string; phone?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }

  if (body.action === 'probe') return json({ enabled })
  if (!enabled) return json({ error: 'not_configured' }, 503)

  // ── Validation de la demande ───────────────────────────────────────────────────
  const { plan, duration, method } = body
  if (plan !== 'standard' && plan !== 'premium') return json({ error: 'invalid_plan' }, 400)
  if (duration !== 'monthly' && duration !== 'yearly') return json({ error: 'invalid_duration' }, 400)
  const kitMethod = method ? KITPAY_METHODS[method] : undefined
  if (!kitMethod) return json({ error: 'invalid_method' }, 400)
  const phone = typeof body.phone === 'string' ? body.phone.replace(/[^\d+ ]/g, '').slice(0, 20) : ''

  // ── Montant : lu dans la table des plans ───────────────────────────────────────
  const { data: planRow } = await supabase
    .from('plans')
    .select('label, price_monthly, price_yearly')
    .eq('plan', plan)
    .maybeSingle()
  if (!planRow) return json({ error: 'invalid_plan' }, 400)
  // plan_price() applique la promotion en cours : ce que l'étudiant voit est ce qu'il paie.
  const { data: price } = await supabase.rpc('plan_price', { p_plan: plan, p_duration: duration, p_currency: 'MRU' })
  const amount = Math.round(Number(price?.final ?? 0))
  if (!(amount > 0)) return json({ error: 'invalid_plan' }, 400)

  // ── Clé sous laquelle vit l'abonnement (appareil relié au compte, sinon uid) ───
  const { data: link } = await supabase.from('device_links').select('device_id').eq('user_id', uid).maybeSingle()
  const userKey = link?.device_id ?? uid

  // Garde-fou : pas plus de 5 paiements en attente par heure et par étudiant
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userKey).eq('provider', 'kitpay').eq('status', 'pending').gte('created_at', since)
  if ((count ?? 0) >= 5) return json({ error: 'too_many_pending' }, 429)

  // ── Adresse de retour : site officiel, ou localhost pour les essais ────────────
  const origin = req.headers.get('origin') ?? ''
  const site = Deno.env.get('SITE_URL')?.replace(/\/+$/, '') ?? ''
  const siteBase = origin === site || /^http:\/\/localhost:\d+$/.test(origin) ? origin : site
  if (!siteBase) return json({ error: 'site_url_missing' }, 500)

  // ── Création du paiement chez KitPay ───────────────────────────────────────────
  const { data: student } = await supabase.from('students').select('name').eq('user_id', uid).maybeSingle()
  const res = await fetch(`${base}/api/v1/intents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount,
      method: kitMethod,
      ...(phone ? { customer_phone: phone } : {}),
      description: `Axone ${planRow.label} (${duration === 'yearly' ? 'annuel' : 'mensuel'})`,
      success_url: `${siteBase}/app/abonnement?retour=succes`,
      cancel_url: `${siteBase}/app/abonnement?retour=annule`,
      metadata: { plan, duration },
      expires_in: 1800,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[kitpay-intent] KitPay', res.status, JSON.stringify(err).slice(0, 200))
    return json({ error: 'kitpay_failed', detail: err?.error ?? res.status }, 502)
  }
  const intent = await res.json() as { ref: string; hosted_url: string }
  if (!intent?.ref || !intent?.hosted_url) return json({ error: 'kitpay_invalid_response' }, 502)

  // ── Demande en attente, activée par le webhook quand KitPay confirme ──────────
  const { error: insErr } = await supabase.from('subscriptions').insert({
    user_id: userKey,
    plan,
    status: 'pending',
    method,
    duration,
    amount,
    reference_code: intent.ref,
    student_name: student?.name ?? null,
    provider: 'kitpay',
  })
  if (insErr) {
    console.error('[kitpay-intent] insert:', insErr.message)
    return json({ error: 'db_error' }, 500)
  }

  return json({ ref: intent.ref, hosted_url: intent.hosted_url })
})
