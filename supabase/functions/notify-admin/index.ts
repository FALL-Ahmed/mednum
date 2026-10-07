// Edge Function /notify-admin — envoie une notification push aux appareils de l'administrateur.
//
// Deux usages :
//   1. Database Webhook (Supabase > Database > Webhooks) sur la table `subscriptions`, événement INSERT :
//      une notification part pour chaque nouvelle demande d'abonnement par reçu (statut « pending »).
//   2. Test depuis l'admin : { test: true } avec la connexion de l'administrateur.
//
// Secrets : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex. mailto:toi@exemple.com),
//          NOTIFY_SECRET (code partagé avec le déclencheur SQL, voir supabase/ops/notifications_declencheur.sql).
// Déploiement : supabase functions deploy notify-admin --no-verify-jwt  (l'autorisation est vérifiée ici).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return json({ error: 'vapid_not_configured' }, 500)
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@axone.app', pub, priv)

  const admin = createClient(url, serviceKey)
  const body = await req.json().catch(() => ({}))

  let payload: { title: string; body: string; url: string; tag: string }

  if (body?.test) {
    // Test : réservé à un administrateur connecté
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(token)
    const uid = u?.user?.id
    if (!uid) return json({ error: 'unauthorized' }, 401)
    const { data: isAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', uid).maybeSingle()
    if (!isAdmin) return json({ error: 'forbidden' }, 403)
    payload = { title: 'Axone : test réussi', body: 'Les notifications fonctionnent sur cet appareil.', url: '/', tag: 'axone-test' }
  } else {
    // Déclencheur de base de données (code secret) ou webhook Supabase (clé de service) : jamais ouvert au public
    const secret = Deno.env.get('NOTIFY_SECRET')
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const okSecret = !!secret && req.headers.get('x-notify-secret') === secret
    if (!okSecret && bearer !== serviceKey) return json({ error: 'unauthorized' }, 401)

    // On ne notifie que les nouvelles demandes par reçu en attente de validation
    const rec = body?.record
    if (body?.type !== 'INSERT' || !rec || rec.status !== 'pending' || (rec.provider && rec.provider !== 'manual')) {
      return json({ ignored: true })
    }
    const plan = rec.plan === 'premium' ? 'Premium' : 'Standard'
    const dur = rec.duration === 'yearly' ? 'annuel' : 'mensuel'
    const amount = rec.amount != null ? ` · ${Number(rec.amount).toLocaleString('fr-FR')} ${rec.currency ?? 'MRU'}` : ''
    payload = {
      title: 'Abonnement à valider',
      body: `${rec.student_name || 'Un élève'} · ${plan} ${dur}${amount}`,
      url: '/#payments',
      tag: `sub-${rec.id}`,
    }
  }

  const { data: subs } = await admin.from('admin_push_subscriptions').select('endpoint,p256dh,auth')
  let sent = 0
  const dead: string[] = []
  await Promise.all(
    (subs ?? []).map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload))
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.push(s.endpoint) // appareil désabonné : on le retire
      }
    }),
  )
  if (dead.length) await admin.from('admin_push_subscriptions').delete().in('endpoint', dead)
  return json({ sent, removed: dead.length })
})
