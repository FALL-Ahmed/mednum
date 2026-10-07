// Edge Function /duo-ask : Dr. Ahmed dans une session de révision à deux.
//   • action "ask"           : une question posée dans la salle à deux ; Dr. Ahmed répond devant les deux étudiants.
//   • action "case_feedback" : après un cas clinique fait à deux, Dr. Ahmed compare les deux raisonnements.
// Les questions comptent dans le quota de l'HÔTE (abonné Premium), pas dans celui de l'invité gratuit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5-5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const STOP = new Set(['dans', 'avec', 'pour', 'que', 'qui', 'quoi', 'quel', 'quelle', 'quels', 'quelles', 'les', 'des', 'une', 'est', 'sont', 'entre', 'comme', 'plus', 'moins', 'cette', 'cela', 'faire', 'fait', 'peut', 'aux', 'par', 'sur', 'difference', 'explique', 'expliquer', 'donne', 'moi', 'pourquoi', 'comment'])
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w))

type Chunk = { title: string; content: string }

/** Les passages du cours les plus proches de la question (mots communs, titre pondéré). */
function pickChunks(chunks: Chunk[], query: string, k = 3): Chunk[] {
  const q = tokens(query)
  if (q.length === 0) return []
  return chunks
    .map((c) => {
      const title = norm(c.title ?? '')
      const body = norm(c.content ?? '')
      let score = 0
      for (const w of q) {
        if (title.includes(w)) score += 3
        score += Math.min(body.split(w).length - 1, 5)
      }
      return { c, score: score / Math.log(2 + body.length / 1000) }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c)
}

const ROOM_SYSTEM = (docName: string, names: string[]) => `Tu es Dr. Ahmed, un senior en santé et tuteur de révision pour des étudiants en médecine et en pharmacie (Mauritanie, Sénégal, Maroc).

Tu es dans une salle d'étude à deux${docName ? ` autour du cours « ${docName} »` : ''}. Les étudiants sont : ${names.join(' et ')}. Les messages sont préfixés par le prénom de leur auteur. Réponds à la personne qui vient de poser la question, en t'adressant à elle par son prénom ; l'autre lit aussi ta réponse.

RÈGLES D'OR :
1. Des extraits du cours sont fournis. Lis-les avant de répondre ; si l'information y est, utilise-la.
2. Réponds d'abord avec le cours. Si la question va plus loin, développe avec tes connaissances médicales solides, en séparant clairement « Dans ton cours : … » puis « Pour aller plus loin : … ». Dans la partie « Pour aller plus loin », n'avance que des connaissances bien établies, n'invente jamais un chiffre, une posologie ou un seuil, et rappelle de vérifier avec les enseignants ou le manuel ce qui doit être exact au chiffre près.
3. Si les deux étudiants se contredisent ou comparent leurs réponses, arbitre avec le cours et explique pourquoi.
4. Direct, précis, bienveillant. Explique le « pourquoi ». Messages courts (bonjour, merci) : réponse brève.
5. Jamais de conseil médical pour un vrai patient : tu aides à réviser.

FORMAT : commence directement par la réponse, environ 300 mots au plus pour les questions de fond. Symboles Unicode pour les formules (² ³ ≤ ≥ α β °), jamais de LaTeX. Markdown simple permis. Réponds dans la langue de la question (français ou arabe). Termine par « À retenir : … » (une phrase) quand la réponse est substantielle.`

const CASE_SYSTEM = `Tu es Dr. Ahmed, un senior en santé et tuteur de révision. Deux étudiants viennent de faire ensemble un cas clinique FICTIF, chacun de son côté, étape par étape. Tu compares leurs raisonnements avec le raisonnement de référence du cas.

Pour chaque étudiant (en t'adressant à lui par son prénom) : ce qui est juste, ce qui manque ou est faux, à chaque étape importante, puis le diagnostic final. Termine par ce que l'un peut apprendre de l'autre et une phrase « À retenir ». Reste factuel : base-toi uniquement sur le cas fourni, sans inventer de valeur. Pas de note chiffrée. Ton bienveillant, environ 350 mots au plus. Réponds en français. C'est un exercice de révision, jamais un conseil pour un vrai patient.`

async function callClaude(system: string, user: string, maxTokens: number) {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('no_key')
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}`)
  const data = await res.json()
  const text = (data.content ?? []).map((b: { text?: string }) => b.text ?? '').join('').trim()
  if (!text) throw new Error('empty')
  return { text, input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!bearer) return json({ error: 'not_authenticated' }, 401)
  const { data: authData } = await supabase.auth.getUser(bearer)
  const uid = authData?.user?.id
  if (!uid) return json({ error: 'not_authenticated' }, 401)

  let body: { code?: string; action?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }
  const code = String(body.code ?? '').toUpperCase().trim()
  const action = body.action
  if (!code || (action !== 'ask' && action !== 'case_feedback')) return json({ error: 'invalid_request' }, 400)

  const { data: session } = await supabase.from('duo_sessions').select('*').eq('code', code).maybeSingle()
  if (!session) return json({ error: 'duo_not_found' }, 404)
  const { data: members } = await supabase.from('duo_members').select('user_id,name').eq('session_id', session.id)
  if (!members?.some((m: { user_id: string }) => m.user_id === uid)) return json({ error: 'duo_not_member' }, 403)
  if (new Date(session.expires_at) < new Date()) return json({ error: 'duo_expired' }, 410)

  const nameOf = (id: string) => (members.find((m: { user_id: string; name: string }) => m.user_id === id)?.name || '').trim() || 'Étudiant'
  const myName = nameOf(uid)

  // Quota : celui de l'hôte (plan Premium)
  const { data: link } = await supabase.from('device_links').select('device_id').eq('user_id', session.host_id).maybeSingle()
  const hostKey: string = link?.device_id ?? session.host_id
  const quota = async () => {
    const r = await supabase.rpc('check_and_increment_quota', { p_user_id: hostKey, p_kind: 'chat' })
    return r.error ? null : (r.data as boolean)
  }
  const log = async (input: number, output: number) => {
    try {
      await supabase.from('api_usage').insert({ user_id: hostKey, input_tokens: input, output_tokens: output, model: MODEL, kind: 'chat' })
    } catch { /* le suivi ne doit pas bloquer */ }
  }

  if (action === 'ask') {
    if (session.kind !== 'room') return json({ error: 'invalid_kind' }, 400)
    const text = String(body.text ?? '').trim().slice(0, 800)
    if (!text) return json({ error: 'invalid_request' }, 400)

    const allowed = await quota()
    if (allowed === null) return json({ error: 'quota_error' }, 500)
    if (!allowed) return json({ error: 'quota_exceeded' }, 429)

    await supabase.from('duo_messages').insert({ session_id: session.id, user_id: uid, body: text, is_ai: false })

    const { data: recent } = await supabase
      .from('duo_messages').select('user_id,body,is_ai').eq('session_id', session.id).order('id', { ascending: false }).limit(12)
    const history = (recent ?? []).reverse().slice(0, -1)
      .map((m: { user_id: string | null; body: string; is_ai: boolean }) => `${m.is_ai ? 'Dr. Ahmed' : nameOf(m.user_id ?? '')} : ${m.body}`).join('\n')

    const chunks: Chunk[] = Array.isArray(session.payload?.chunks) ? session.payload.chunks : []
    const picked = pickChunks(chunks, text + ' ' + history.slice(-400))
    const context = picked.length
      ? picked.map((c) => `[${c.title}]\n${String(c.content).slice(0, 4000)}`).join('\n\n')
      : 'Aucun extrait pertinent trouvé dans le cours pour cette question.'

    const userMsg = `EXTRAITS DU COURS :\n${context}\n\n${history ? `CONVERSATION RÉCENTE :\n${history}\n\n` : ''}NOUVELLE QUESTION de ${myName} : ${text}`
    try {
      const r = await callClaude(ROOM_SYSTEM(String(session.payload?.name ?? ''), members.map((m: { name: string }) => m.name || 'Étudiant')), userMsg, 1400)
      await supabase.from('duo_messages').insert({ session_id: session.id, user_id: null, body: r.text, is_ai: true })
      await log(r.input, r.output)
    } catch (e) {
      console.error('[duo-ask]', (e as Error).message)
      return json({ error: 'ai_failed' }, 502)
    }
    return json({ ok: true })
  }

  // case_feedback
  if (session.kind !== 'case') return json({ error: 'invalid_kind' }, 400)
  const { data: answers } = await supabase.from('duo_answers').select('user_id,idx,sel').eq('session_id', session.id)
  const done = (id: string) => (answers ?? []).filter((a: { user_id: string }) => a.user_id === id).length
  if (members.length < 2 || members.some((m: { user_id: string }) => done(m.user_id) < 5)) return json({ error: 'not_finished' }, 409)
  const { data: existing } = await supabase.from('duo_messages').select('id').eq('session_id', session.id).eq('tag', 'feedback').limit(1)
  if (existing && existing.length > 0) return json({ ok: true, already: true })

  const allowed = await quota()
  if (allowed === null) return json({ error: 'quota_error' }, 500)
  if (!allowed) return json({ error: 'quota_exceeded' }, 429)

  const c = session.payload as { title?: string; context?: string; stages: { label: string; reveal: string; prompt: string }[]; diagnosis?: string; differentials?: string; reasoning?: string; management?: string }
  const ref = [
    `CAS : ${c.title ?? ''}`,
    `CONTEXTE : ${c.context ?? ''}`,
    ...c.stages.map((s, i) => `ÉTAPE ${i + 1} (${s.label}) : ${s.reveal}\nQuestion posée : ${s.prompt}`),
    `DIAGNOSTIC DE RÉFÉRENCE : ${c.diagnosis ?? ''}`,
    c.differentials ? `DIAGNOSTICS DIFFÉRENTIELS : ${c.differentials}` : '',
    `RAISONNEMENT DE RÉFÉRENCE : ${c.reasoning ?? ''}`,
    `CONDUITE À TENIR : ${c.management ?? ''}`,
  ].filter(Boolean).join('\n')
  const labels = ['Étape 1', 'Étape 2', 'Étape 3', 'Étape 4', 'Diagnostic final']
  const perStudent = members.map((m: { user_id: string; name: string }) =>
    `RÉPONSES DE ${(m.name || 'Étudiant').toUpperCase()} :\n` +
    labels.map((l, i) => `- ${l} : ${String((answers ?? []).find((a: { user_id: string; idx: number }) => a.user_id === m.user_id && a.idx === i)?.sel ?? '(pas de réponse)')}`).join('\n'),
  ).join('\n\n')

  try {
    const r = await callClaude(CASE_SYSTEM, `${ref}\n\n${perStudent}`, 1600)
    await supabase.from('duo_messages').insert({ session_id: session.id, user_id: null, body: r.text, is_ai: true, tag: 'feedback' })
    await log(r.input, r.output)
  } catch (e) {
    console.error('[duo-ask]', (e as Error).message)
    return json({ error: 'ai_failed' }, 502)
  }
  return json({ ok: true })
})
