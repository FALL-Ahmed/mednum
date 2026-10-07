// Edge Function /ocr : lit des pages de cours (photos ou pages d'un PDF scanné) et renvoie le texte.
//
// Le site réduit chaque page en image JPEG, l'envoie ici par petits lots, et assemble le texte.
// La clé Gemini reste côté serveur. Réservé aux utilisateurs connectés, avec un plafond de pages par jour et par plan.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const MAX_IMAGES_PER_CALL = 6
const MAX_BASE64_CHARS = 2_500_000 // environ 1,8 Mo par image
const PAGE_SEPARATOR = '===PAGE==='
// Pages lues par jour, selon le plan (à ajuster selon le coût réel, visible dans l'onglet Finance de l'admin).
const DAILY_PAGES: Record<string, number> = { freemium: 20, trial: 20, standard: 200, premium: 400 }
const DEFAULT_DAILY_PAGES = 20

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
  if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY non configurée côté serveur' }, 500)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Identité : jeton d'utilisateur obligatoire
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!bearer) return json({ error: 'not_authenticated' }, 401)
  const { data: authData } = await supabase.auth.getUser(bearer)
  const uid = authData?.user?.id
  if (!uid) return json({ error: 'not_authenticated' }, 401)

  let body: { images?: { mime: string; data: string }[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }
  const images = body.images
  if (!Array.isArray(images) || images.length === 0 || images.length > MAX_IMAGES_PER_CALL) {
    return json({ error: 'invalid_images' }, 400)
  }
  for (const im of images) {
    if (!im || !['image/jpeg', 'image/png', 'image/webp'].includes(im.mime) || typeof im.data !== 'string' || im.data.length < 100 || im.data.length > MAX_BASE64_CHARS) {
      return json({ error: 'invalid_images' }, 400)
    }
  }

  // Plafond de pages par jour (clé de quota : appareil relié s'il existe, sinon identifiant du compte)
  const { data: link } = await supabase.from('device_links').select('device_id').eq('user_id', uid).maybeSingle()
  const key: string = link?.device_id ?? uid
  const { data: planData } = await supabase.rpc('effective_plan', { p_key: key })
  const plan = typeof planData === 'string' ? planData : 'freemium'
  const cap = DAILY_PAGES[plan] ?? DEFAULT_DAILY_PAGES
  const day = new Date().toISOString().slice(0, 10)
  const { data: row } = await supabase
    .from('quota_counters')
    .select('used')
    .eq('user_id', key)
    .eq('day', day)
    .eq('kind', 'ocr')
    .maybeSingle()
  const used = row?.used ?? 0
  if (used + images.length > cap) {
    return json({ error: 'ocr_limit', cap, used }, 429)
  }

  let result: { texts: string[]; promptTokens: number; outputTokens: number }
  try {
    result = await readPages(images)
  } catch (e) {
    console.error('[ocr]', (e as Error).message)
    return json({ error: 'ocr_failed' }, 502)
  }

  // Compte les pages lues, puis suit le coût (panneau d'administration)
  await supabase.from('quota_counters').upsert({ user_id: key, day, kind: 'ocr', used: used + images.length })
  try {
    await supabase.from('api_usage').insert({
      user_id: key,
      input_tokens: result.promptTokens,
      output_tokens: result.outputTokens,
      model: GEMINI_MODEL,
      kind: 'ocr',
    })
  } catch {
    /* le suivi ne doit jamais bloquer la lecture */
  }

  return json({ texts: result.texts, used: used + images.length, cap })
})

async function readPages(images: { mime: string; data: string }[]) {
  const n = images.length
  const prompt =
    `Voici ${n} page${n > 1 ? 's' : ''} d'un cours de médecine ou de pharmacie (photo ou scan), dans l'ordre. ` +
    `Recopie fidèlement TOUT le texte de chaque page : titres, définitions, listes, tableaux (une ligne de texte par ligne de tableau), formules, valeurs et unités. ` +
    `Conserve la structure (titres, puces, numérotation). N'ajoute rien, ne reformule pas, n'invente aucune valeur. ` +
    `Si un mot est illisible, écris [illisible]. Si une page n'a aucun texte, écris [page sans texte]. ` +
    `Sépare les pages par une ligne contenant exactement ${PAGE_SEPARATOR}. Réponds uniquement avec le texte, sans commentaire.`
  const parts: unknown[] = images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } }))
  parts.push({ text: prompt })

  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0 },
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const text: string = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim()
      if (text.length < 5) throw new Error('empty')
      const um = data.usageMetadata
      const pieces = text.split(PAGE_SEPARATOR).map((t: string) => t.trim())
      // Si le modèle n'a pas respecté les séparateurs, tout le texte est rendu d'un bloc sur la première page.
      const texts = pieces.length === n ? pieces : [text.replaceAll(PAGE_SEPARATOR, '\n\n'), ...Array(n - 1).fill('')]
      return {
        texts,
        promptTokens: um?.promptTokenCount ?? 0,
        outputTokens: (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0),
      }
    }
    lastError = `Gemini ${res.status}`
    if (res.status !== 429 && res.status < 500) break
    await new Promise((r) => setTimeout(r, 1200))
  }
  throw new Error(lastError || 'ocr')
}
