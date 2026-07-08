// Edge Function /ask — proxy Anthropic avec quota + log usage
// Les clés API restent côté serveur (jamais dans le bundle client)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL     = 'claude-haiku-4-5-20251001'
const MAX_TOKENS_CAP    = 4096

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
    messages: { role: 'user' | 'assistant'; content: string }[]
    maxTokens?: number
  }

  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }

  const { userId, system, messages, maxTokens = 2048 } = body

  if (!userId || typeof userId !== 'string' || userId.length < 8) {
    return json({ error: 'userId invalide' }, 400)
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages requis' }, 400)
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

  // ── Vérification quota (atomique via RPC) ────────────────────────────────────
  const { data: allowed, error: quotaErr } = await supabase.rpc(
    'check_and_increment_quota',
    { p_user_id: userId }
  )

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
    model:      DEFAULT_MODEL,
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

      // ── Log usage après fin du stream ──────────────────────────────────────
      const { error: logErr } = await supabase.from('api_usage').insert({
        user_id:       userId,
        input_tokens:  inputTokens,
        output_tokens: outputTokens,
        model:         DEFAULT_MODEL,
      })
      if (logErr) console.error('[ask] api_usage insert error:', logErr.message)

      // Signal de fin avec méta usage
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ done: true, u: { i: inputTokens, o: outputTokens } })}\n\n`
        )
      )
    } catch (err) {
      console.error('[ask] stream pipe error:', err)
    } finally {
      await writer.close()
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

// ── Helper ────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
