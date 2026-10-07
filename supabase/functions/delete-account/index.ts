// Edge Function /delete-account — supprime le compte de l'étudiant connecté et ses données.
//
// Ce qui est effacé : profil, cours (et fichiers), historiques de discussion et pièces jointes, QCM, flashcards,
// sessions à deux, compteurs d'usage, puis le compte de connexion lui-même (les tables liées au compte se vident en cascade).
// Ce qui est gardé, SANS nom ni reçu : le montant, la date et l'offre des paiements, pour la comptabilité.
//
// Entrée (JSON, connexion obligatoire) : { confirm: true }   ->   { ok: true }
// Un compte administrateur ne peut pas être supprimé ici (protection contre une erreur).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = await admin.auth.getUser(token)
  const uid = u?.user?.id
  if (!uid) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== true) return json({ error: 'confirmation_required' }, 400)

  const { data: isAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', uid).maybeSingle()
  if (isAdmin) return json({ error: 'admin_account' }, 403)

  // Identifiant sous lequel les quotas et abonnements sont rangés (appareil relié, sinon le compte)
  const { data: link } = await admin.from('device_links').select('device_id').eq('user_id', uid).maybeSingle()
  const keys = [uid, ...(link?.device_id ? [link.device_id as string] : [])]

  const warnings: string[] = []
  const step = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const { error } = await fn()
      if (error) warnings.push(`${label}: ${error.message}`)
    } catch (e) {
      warnings.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 1. Fichiers de l'étudiant (cours, pièces jointes…) : tout ce qui est rangé sous un dossier à son identifiant
  try {
    const { data: buckets } = await admin.storage.listBuckets()
    for (const b of buckets ?? []) {
      const paths: string[] = []
      const walk = async (prefix: string, depth: number) => {
        const { data: items } = await admin.storage.from(b.name).list(prefix, { limit: 1000 })
        for (const it of items ?? []) {
          const p = `${prefix}/${it.name}`
          if (it.id === null || it.id === undefined) { if (depth < 4) await walk(p, depth + 1) } else paths.push(p)
        }
      }
      await walk(uid, 0)
      for (let i = 0; i < paths.length; i += 100) await admin.storage.from(b.name).remove(paths.slice(i, i + 100))
    }
  } catch (e) {
    warnings.push(`storage: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2. Reçus de paiement : on supprime l'image, puis on anonymise la ligne (montant, date et offre sont conservés)
  try {
    const { data: subs } = await admin.from('subscriptions').select('id,receipt_url').in('user_id', keys)
    const files = (subs ?? [])
      .map(s => (s.receipt_url as string | null)?.split('/payment-screenshots/')[1])
      .filter((x): x is string => !!x)
    if (files.length) await admin.storage.from('payment-screenshots').remove(files)
  } catch (e) {
    warnings.push(`receipts: ${e instanceof Error ? e.message : String(e)}`)
  }
  await step('subscriptions', () => admin.from('subscriptions').update({ student_name: null, receipt_url: null, subjects: null }).in('user_id', keys))

  // 3. Tables rangées par identifiant texte (non supprimées en cascade)
  await step('students', () => admin.from('students').delete().eq('user_id', uid))
  await step('quota_counters', () => admin.from('quota_counters').delete().in('user_id', keys))
  await step('user_quotas', () => admin.from('user_quotas').delete().in('user_id', keys))
  await step('api_usage', () => admin.from('api_usage').delete().in('user_id', keys))

  // 4. Le compte de connexion : les tables liées (cours, discussions, QCM, flashcards, sessions à deux…) se vident en cascade
  const { error: delErr } = await admin.auth.admin.deleteUser(uid)
  if (delErr) return json({ error: 'delete_failed', detail: delErr.message, warnings }, 500)

  return json({ ok: true, warnings })
})
