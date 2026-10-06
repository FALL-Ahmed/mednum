// Edge Function /ask — proxy Anthropic avec quota + log usage
// Les clés API restent côté serveur (jamais dans le bundle client)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
// Qualité d'abord : le même modèle fort pour le chat, les QCM, les fiches, les flashcards et les cas cliniques.
// Le coût reste borné par les quotas journaliers de chaque plan.
const DEFAULT_MODEL     = 'claude-sonnet-5-5'
// Cas cliniques : contenu critique (un seul faux détail détruit la confiance), donc le modèle le plus fort.
const CRITICAL_MODEL    = 'claude-opus-5-5'
const modelFor = (kind: string) => (kind === 'case' ? CRITICAL_MODEL : DEFAULT_MODEL)
const MAX_TOKENS_CAP    = 8192

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405)
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: {
    userId: string
    system?: string
    messages: { role: 'user' | 'assistant'; content: unknown }[]
    maxTokens?: number
    /** Type d'appel pour les compteurs séparés : 'chat' (défaut), 'qcm', 'fiche', 'flashcards', 'case', 'summary'. */
    kind?: string
    /** Suite d'une génération (flashcards, cas cliniques) déjà comptée (2, 3, …) : ne consomme pas de quota, plafonnée par jour. */
    part?: number
  }

  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }

  const { system, messages, maxTokens = 2048 } = body
  const kind = typeof body.kind === 'string' ? body.kind.slice(0, 20) : 'chat'
  // Repli pour les anciennes versions de l'app : identifiant d'appareil envoyé dans le corps.
  let userId = body.userId
  let verified = false
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages requis' }, 400)
  }
  const invalid = validateMessages(messages)
  if (invalid) {
    return json({ error: 'messages invalides', detail: invalid }, 400)
  }

  // ── Clé Anthropic (variable d'environnement Supabase, jamais côté client) ──
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!ANTHROPIC_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY non configurée côté serveur' }, 500)
  }

  // ── Admin client (service_role) pour quota + usage ──────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // ── Identité : si la requête porte un jeton d'utilisateur valide (site web, app à jour),
  //    on l'utilise à la place de l'identifiant envoyé dans le corps (non fiable).
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (bearer) {
    const { data: authData } = await supabase.auth.getUser(bearer)
    if (authData?.user?.id) {
      userId = authData.user.id
      verified = true
      // Le plan et le quota du compte vivent sous l'identifiant d'appareil relié (voir device_links).
      const { data: link } = await supabase
        .from('device_links')
        .select('device_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (link?.device_id) userId = link.device_id
    }
  }
  if (!userId || typeof userId !== 'string' || userId.length < 8) {
    return json({ error: 'userId invalide' }, 400)
  }

  // ── Vérification quota (atomique via RPC) ────────────────────────────────────
  let allowed: boolean | null = null
  let quotaErr: { message: string } | null = null
  const isPart = (kind === 'flashcards' || kind === 'case') && verified && Number.isInteger(body.part) && (body.part as number) > 1
  if (isPart) {
    // Suite d'une génération déjà comptée : pas de nouveau quota, mais au plus 12 suites par jour.
    const day = new Date().toISOString().slice(0, 10)
    const { data: row } = await supabase
      .from('quota_counters').select('used')
      .eq('user_id', userId).eq('day', day).eq('kind', 'fpart').maybeSingle()
    const used = row?.used ?? 0
    if (used >= 12) {
      allowed = false
    } else {
      await supabase.from('quota_counters').upsert({ user_id: userId, day, kind: 'fpart', used: used + 1 })
      allowed = true
    }
  } else {
    const r = await supabase.rpc('check_and_increment_quota', { p_user_id: userId, p_kind: kind })
    allowed = r.data as boolean | null
    quotaErr = r.error
  }

  if (quotaErr) {
    console.error('[ask] quota check error:', quotaErr.message)
    return json({ error: 'Erreur vérification quota' }, 500)
  }

  if (!allowed) {
    return json(
      { error: 'quota_exceeded', message: 'Limite journalière atteinte. Réessaie demain !' },
      429
    )
  }

  // ── Appel Anthropic en mode streaming ────────────────────────────────────────
  const reqBody: Record<string, unknown> = {
    model:      modelFor(kind),
    max_tokens: Math.min(maxTokens, MAX_TOKENS_CAP),
    stream:     true,
    messages,   // déjà filtrés côté client (pas de role 'system')
  }
  if (system) reqBody.system = system

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(reqBody),
  })

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    console.error('[ask] Anthropic error:', anthropicRes.status, errText.slice(0, 200))
    return json({ error: `Anthropic ${anthropicRes.status}` }, 502)
  }

  // ── Pipe SSE Anthropic → client ──────────────────────────────────────────────
  // On collecte input_tokens (message_start) et output_tokens (message_delta)
  // puis on insère dans api_usage après la fin du stream.

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let inputTokens  = 0
  let outputTokens = 0

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  ;(async () => {
    try {
      const reader = anthropicRes.body!.getReader()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue

          try {
            const evt = JSON.parse(raw)

            // Récupère input_tokens dans message_start
            if (evt.type === 'message_start' && evt.message?.usage) {
              inputTokens = evt.message.usage.input_tokens ?? 0
            }

            // Forward uniquement les deltas texte vers le client
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              const chunk = encoder.encode(
                `data: ${JSON.stringify({ t: evt.delta.text })}\n\n`
              )
              await writer.write(chunk)
            }

            // Récupère output_tokens dans message_delta final
            if (evt.type === 'message_delta' && evt.usage) {
              outputTokens = evt.usage.output_tokens ?? 0
            }
          } catch { /* ligne SSE mal formée, on ignore */ }
        }
      }

      // Signal de fin avec méta usage
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ done: true, u: { i: inputTokens, o: outputTokens } })}\n\n`
        )
      )
    } catch (err) {
      console.error('[ask] stream pipe error:', err)
    } finally {
      // Journal d'usage : aussi quand l'élève interrompt la réponse (les tokens déjà générés sont facturés)
      try {
        const { error: logErr } = await supabase.from('api_usage').insert({
          user_id:       userId,
          input_tokens:  inputTokens,
          output_tokens: outputTokens,
          model:         modelFor(kind),
          kind,
        })
        if (logErr) console.error('[ask] api_usage insert error:', logErr.message)
      } catch (e) {
        console.error('[ask] api_usage log failed:', e)
      }
      await writer.close().catch(() => {})
    }
  })()

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
})

// ── Validation des messages (texte et images) ────────────────────────────────
// Un message est soit un texte, soit une liste de blocs { type: 'text' } ou { type: 'image' (base64) }.
// On borne le nombre d'images et leur poids pour éviter les abus.

const MAX_TEXT_CHARS  = 60_000
const MAX_IMAGES      = 3
const MAX_IMAGE_CHARS = 4_000_000   // ~3 Mo d'image en base64
const MAX_TOTAL_CHARS = 8_000_000
const IMAGE_TYPES     = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function validateMessages(messages: { role: string; content: unknown }[]): string | null {
  let images = 0
  let total = 0
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') return 'rôle invalide'
    if (typeof m.content === 'string') {
      if (m.content.length > MAX_TEXT_CHARS) return 'message trop long'
      total += m.content.length
      continue
    }
    if (!Array.isArray(m.content) || m.content.length === 0 || m.content.length > 8) return 'contenu invalide'
    for (const b of m.content as Record<string, unknown>[]) {
      if (b?.type === 'text') {
        if (typeof b.text !== 'string' || b.text.length > MAX_TEXT_CHARS) return 'texte invalide'
        total += b.text.length
      } else if (b?.type === 'image') {
        const src = b.source as Record<string, unknown> | undefined
        if (m.role !== 'user') return 'image non autorisée'
        if (!src || src.type !== 'base64' || typeof src.data !== 'string' || typeof src.media_type !== 'string') {
          return 'image invalide'
        }
        if (!IMAGE_TYPES.includes(src.media_type)) return 'format d’image non pris en charge'
        if (src.data.length > MAX_IMAGE_CHARS) return 'image trop lourde'
        images++
        total += src.data.length
      } else {
        return 'bloc inconnu'
      }
    }
  }
  if (images > MAX_IMAGES) return 'trop d’images'
  if (total > MAX_TOTAL_CHARS) return 'requête trop volumineuse'
  return null
}

// ── Helper ────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
