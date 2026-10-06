// Edge Function /transcribe — transcription vocale, clés gardées côté serveur.
//
// Entrée : requête multipart avec `file` (audio, idéalement WAV 16 kHz mono) et `language` facultatif :
//          'auto' (défaut : français, arabe ou mélange des deux), 'fr' ou 'ar'.
// Sortie : { text: "...", engine: "gemini" | "whisper" }
//
// Moteur principal : Gemini 2.5 Flash (très robuste au bruit, aux voix faibles et au mélange français/arabe,
//   testé nettement meilleur que Whisper sur du son dégradé). Moteur de secours : Whisper large-v3 (Groq).
// Secrets : supabase secrets set GEMINI_API_KEY=...   (principal)
//           supabase secrets set GROQ_API_KEY=...     (secours, facultatif)
// Protection : connexion obligatoire (jeton d'utilisateur), fichier borné, plafond journalier par étudiant.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GROQ_URL     = 'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL   = 'whisper-large-v3'
const MAX_BYTES    = 6 * 1024 * 1024   // ~ 3 minutes de WAV 16 kHz mono
const DAILY_CAP    = 60                // transcriptions par étudiant et par jour
const TIMEOUT_MS   = 45_000

const INSTRUCTIONS: Record<string, string> = {
  auto: "La personne peut parler français, arabe (y compris dialecte) ou mélanger les deux.",
  fr:   "La personne parle français.",
  ar:   "La personne parle arabe (éventuellement en dialecte), avec parfois des termes médicaux en français.",
}

function promptFor(language: string): string {
  return (
    "Tu transcris un enregistrement vocal d'un étudiant en médecine ou en pharmacie (Mauritanie, Sénégal, Maroc). " +
    `${INSTRUCTIONS[language] ?? INSTRUCTIONS.auto} ` +
    "Transcris exactement ce qui est dit, dans la langue parlée (arabe en écriture arabe, français en français), " +
    "sans traduire, sans résumer, sans répondre à la question posée. " +
    "Orthographie correctement les termes médicaux (insuffisance cardiaque, rhabdomyolyse, bêtabloquants, IEC, " +
    "diurétiques de l'anse, pharmacologie, sémiologie…). Ajoute la ponctuation naturelle. " +
    "Ne devine pas : si l'audio est vide, inaudible ou sans parole, réponds exactement [inaudible]. " +
    "Réponds uniquement avec la transcription."
  )
}

// Vocabulaire guide pour le moteur de secours (Whisper) — limite de Groq : ~224 jetons.
const WHISPER_PROMPT: Record<string, string> = {
  fr: "Cours de médecine et de pharmacie. Vocabulaire : insuffisance cardiaque, œdème aigu du poumon, rhabdomyolyse, " +
      "myasthénie, bêtabloquants, IEC, sartans, diurétiques de l'anse, antibiotiques, pharmacologie, sémiologie, ECG, QCM.",
  ar: "دروس الطب والصيدلة: قصور القلب، الوذمة الرئوية، الوهن العضلي، مضادات حيوية، علم الأدوية، تخطيط القلب.",
}

// Phrases typiques que les moteurs produisent quand ils n'entendent que du silence ou du bruit.
const GHOSTS = [
  /\[inaudible\]/i, /sous-?titr/i, /merci d['’]avoir regard/i, /amara\.org/i,
  /n['’]oubliez pas de vous abonner/i, /thanks for watching/i, /subtitles by/i, /الترجمة|اشترك في القناة/,
]

function cleanText(raw: string): string {
  const t = raw.trim().replace(/^["«]\s*|\s*["»]$/g, '')
  if (t.length < 2) return ''
  if (t.length < 100 && GHOSTS.some((r) => r.test(t))) return ''
  return t
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await run(ctl.signal)
  } finally {
    clearTimeout(t)
  }
}

type Usage = { model: string; input: number; output: number }

async function viaGemini(key: string, file: File, language: string): Promise<{ text: string; usage: Usage }> {
  const data = toBase64(new Uint8Array(await file.arrayBuffer()))
  const mime = file.type && file.type.startsWith('audio/') ? file.type.split(';')[0] : 'audio/wav'
  const res = await withTimeout((signal) =>
    fetch(GEMINI_URL, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptFor(language) }, { inline_data: { mime_type: mime, data } }] }],
        // Pas de « réflexion » : plus rapide (~2 s) et inutile pour transcrire.
        generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })
  )
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const out = await res.json()
  const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  const um = out?.usageMetadata
  return {
    text: cleanText(text),
    usage: { model: 'gemini-2.5-flash-audio', input: um?.promptTokenCount ?? 0, output: (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0) },
  }
}

async function viaWhisper(key: string, file: File, language: string): Promise<{ text: string; usage: Usage }> {
  const form = new FormData()
  form.append('file', file, file.name || 'audio.wav')
  form.append('model', GROQ_MODEL)
  if (language === 'fr' || language === 'ar') {
    form.append('language', language)
    form.append('prompt', WHISPER_PROMPT[language])
  }
  form.append('temperature', '0')
  form.append('response_format', 'text')
  const res = await withTimeout((signal) =>
    fetch(GROQ_URL, { method: 'POST', signal, headers: { Authorization: `Bearer ${key}` }, body: form })
  )
  if (!res.ok) throw new Error(`whisper ${res.status}: ${(await res.text()).slice(0, 160)}`)
  // Whisper est facturé à la durée d'audio : on journalise les secondes dans « input » (WAV 16 kHz mono = 32 000 octets/s).
  return {
    text: cleanText(await res.text()),
    usage: { model: 'groq-whisper-large-v3', input: Math.max(10, Math.round(file.size / 32000)), output: 0 },
  }
}

async function logUsage(supabase: ReturnType<typeof createClient>, uid: string, u: Usage) {
  try {
    await supabase.from('api_usage').insert({ user_id: uid, input_tokens: u.input, output_tokens: u.output, model: u.model, kind: 'voice' })
  } catch { /* le suivi ne doit jamais bloquer la transcription */ }
}

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

  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
  const GROQ_KEY   = Deno.env.get('GROQ_API_KEY')
  if (!GEMINI_KEY && !GROQ_KEY) return json({ error: 'not_configured' }, 503)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // ── Identité : jeton d'un utilisateur connecté obligatoire ────────────────────
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!bearer) return json({ error: 'unauthorized' }, 401)
  const { data: authData } = await supabase.auth.getUser(bearer)
  const uid = authData?.user?.id
  if (!uid) return json({ error: 'unauthorized' }, 401)

  // ── Fichier audio ─────────────────────────────────────────────────────────────
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'requête invalide' }, 400)
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return json({ error: 'fichier audio requis' }, 400)
  if (file.size > MAX_BYTES) return json({ error: 'audio trop long' }, 413)
  const asked = String(form.get('language') ?? 'auto')
  const language = ['auto', 'fr', 'ar'].includes(asked) ? asked : 'auto'

  // ── Plafond journalier (table quota_counters, créée par la migration des plans) ──
  const day = new Date().toISOString().slice(0, 10)
  await supabase
    .from('quota_counters')
    .upsert({ user_id: uid, day, kind: 'voice', used: 0 }, { onConflict: 'user_id,day,kind', ignoreDuplicates: true })
  const { data: row } = await supabase
    .from('quota_counters')
    .select('used')
    .eq('user_id', uid).eq('day', day).eq('kind', 'voice')
    .maybeSingle()
  const used = row?.used ?? 0
  if (used >= DAILY_CAP) return json({ error: 'quota_exceeded' }, 429)
  await supabase
    .from('quota_counters')
    .update({ used: used + 1 })
    .eq('user_id', uid).eq('day', day).eq('kind', 'voice')

  // ── Transcription : Gemini d'abord, Whisper en secours ────────────────────────
  if (GEMINI_KEY) {
    try {
      const r = await viaGemini(GEMINI_KEY, file, language)
      await logUsage(supabase, uid, r.usage)
      return json({ text: r.text, engine: 'gemini' })
    } catch (e) {
      console.error('[transcribe] Gemini:', String(e).slice(0, 200))
    }
  }
  if (GROQ_KEY) {
    try {
      const r = await viaWhisper(GROQ_KEY, file, language)
      await logUsage(supabase, uid, r.usage)
      return json({ text: r.text, engine: 'whisper' })
    } catch (e) {
      console.error('[transcribe] Whisper:', String(e).slice(0, 200))
    }
  }
  return json({ error: 'transcription_failed' }, 502)
})
