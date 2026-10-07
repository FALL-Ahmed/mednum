// Edge Function /paydunya-intent — crée un paiement PayDunya (Sénégal : mobile money et carte bancaire).
//
// Entrées (JSON, connexion obligatoire) :
//   { action: "probe" }                                   -> { enabled: boolean }
//   { plan: "standard"|"premium", duration: "monthly"|"yearly" }
//                                                         -> { ref, hosted_url }   (page de paiement à ouvrir)
//
// Le montant (FCFA) est TOUJOURS lu dans la table plan_prices, jamais dans la requête.
// La demande « pending » est activée par paydunya-webhook quand PayDunya confirme.
//
// Secrets : PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN,
//           PAYDUNYA_MODE ("live" en production, sinon bac à sable), SITE_URL (adresse publique du site).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  const master = Deno.env.get('PAYDUNYA_MASTER_KEY')
  const priv = Deno.env.get('PAYDUNYA_PRIVATE_KEY')
  const token = Deno.env.get('PAYDUNYA_TOKEN')
  const enabled = !!(master && priv && token)
  const apiBase = Deno.env.get('PAYDUNYA_MODE') === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1'

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

  let body: { action?: string; plan?: string; duration?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }

  if (body.action === 'probe') return json({ enabled })
  if (!enabled) return json({ error: 'not_configured' }, 503)

  const { plan, duration } = body
  if (plan !== 'standard' && plan !== 'premium') return json({ error: 'invalid_plan' }, 400)
  if (duration !== 'monthly' && duration !== 'yearly') return json({ error: 'invalid_duration' }, 400)

  // ── Montant en FCFA ────────────────────────────────────────────────────────────
  // plan_price() applique la promotion en cours (si l'admin en a lancé une) : ce que l'étudiant voit est ce qu'il paie.
  const { data: price, error: priceErr } = await supabase.rpc('plan_price', { p_plan: plan, p_duration: duration, p_currency: 'XOF' })
  if (priceErr || !price) return json({ error: 'invalid_plan' }, 400)
  const amount = Math.round(Number(price.final))
  if (!(amount > 0)) return json({ error: 'invalid_plan' }, 400)
  const { data: planRow } = await supabase.from('plans').select('label').eq('plan', plan).maybeSingle()
  const label = planRow?.label ?? plan

  // ── Clé sous laquelle vit l'abonnement (appareil relié au compte, sinon uid) ───
  const { data: link } = await supabase.from('device_links').select('device_id').eq('user_id', uid).maybeSingle()
  const userKey = link?.device_id ?? uid

  // Garde-fou : pas plus de 5 paiements en attente par heure et par étudiant
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userKey).eq('provider', 'paydunya').eq('status', 'pending').gte('created_at', since)
  if ((count ?? 0) >= 5) return json({ error: 'too_many_pending' }, 429)

  // ── Adresse de retour : site officiel, ou localhost pour les essais ────────────
  const origin = req.headers.get('origin') ?? ''
  const site = Deno.env.get('SITE_URL')?.replace(/\/+$/, '') ?? ''
  const siteBase = origin === site || /^http:\/\/localhost:\d+$/.test(origin) ? origin : site
  if (!siteBase) return json({ error: 'site_url_missing' }, 500)

  const { data: student } = await supabase.from('students').select('name').eq('user_id', uid).maybeSingle()
  const callback = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paydunya-webhook`

  // ── Création de la facture chez PayDunya ───────────────────────────────────────
  const res = await fetch(`${apiBase}/checkout-invoice/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PAYDUNYA-MASTER-KEY': master!,
      'PAYDUNYA-PRIVATE-KEY': priv!,
      'PAYDUNYA-TOKEN': token!,
    },
    body: JSON.stringify({
      invoice: {
        total_amount: amount,
        description: `Axone ${label} (${duration === 'yearly' ? 'annuel' : 'mensuel'})`,
        customer: {
          name: student?.name ?? 'Étudiant Axone',
          ...(authData?.user?.email ? { email: authData.user.email } : {}),
        },
      },
      store: { name: 'Axone' },
      custom_data: { plan, duration },
      actions: {
        return_url: `${siteBase}/app/abonnement?retour=succes`,
        cancel_url: `${siteBase}/app/abonnement?retour=annule`,
        callback_url: callback,
      },
    }),
  })
  const out = await res.json().catch(() => ({})) as { response_code?: string; response_text?: string; token?: string }
  if (!res.ok || out.response_code !== '00' || !out.token || !out.response_text?.startsWith('http')) {
    console.error('[paydunya-intent] PayDunya', res.status, JSON.stringify(out).slice(0, 200))
    return json({ error: 'paydunya_failed' }, 502)
  }

  // ── Demande en attente, activée par le webhook quand PayDunya confirme ─────────
  const { error: insErr } = await supabase.from('subscriptions').insert({
    user_id: userKey,
    plan,
    status: 'pending',
    method: 'paydunya',
    duration,
    amount,
    list_price: Number(price.base),
    discount_percent: Number(price.discount_percent) || 0,
    promo_id: price.promo_id ?? null,
    currency: 'XOF',
    reference_code: out.token,
    student_name: student?.name ?? null,
    provider: 'paydunya',
  })
  if (insErr) {
    console.error('[paydunya-intent] insert:', insErr.message)
    return json({ error: 'db_error' }, 500)
  }

  return json({ ref: out.token, hosted_url: out.response_text })
})
