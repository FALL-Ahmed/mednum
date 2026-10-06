// Edge Function /extract-pdf — OCR d'un lot de pages d'un gros PDF
//
// Contexte : Claude refuse tout PDF de plus de 100 pages, et un seul appel Gemini
// sur un très gros PDF (scan médical 200+ pages) tronque le résultat au lieu
// d'échouer proprement. Cette fonction contourne les deux problèmes en traitant
// UN lot de pages par appel (pdf-lib pour découper, Gemini pour l'OCR) : le
// client boucle en incrémentant `startPage`, ce qui permet d'afficher une vraie
// progression pendant le traitement d'un gros document.
//
// Le PDF source vit dans le bucket Storage "course-pdfs" (uploadé par le client
// au préalable) ; il est supprimé automatiquement après le dernier lot.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const BATCH_SIZE = 30 // pages par appel — large marge sous la limite Claude (100), granularité correcte pour la barre de progression

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405)
  }

  let body: { userId: string; storagePath: string; startPage?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }

  const { userId, storagePath } = body
  const startPage = Math.max(0, body.startPage ?? 0)

  if (!userId || typeof userId !== 'string') {
    return json({ error: 'userId requis' }, 400)
  }
  if (!storagePath || typeof storagePath !== 'string') {
    return json({ error: 'storagePath requis' }, 400)
  }
  if (!GEMINI_KEY) {
    return json({ error: 'GEMINI_API_KEY non configurée côté serveur' }, 500)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // ── Téléchargement du PDF depuis Storage ────────────────────────────────────
  // (re-téléchargé à chaque lot — les Edge Functions ne partagent pas d'état
  // entre invocations ; simple et correct, quitte à re-payer le download.)
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from('course-pdfs')
    .download(storagePath)

  if (dlErr || !fileBlob) {
    console.error('[extract-pdf] download error:', dlErr?.message)
    return json({ error: `Téléchargement Storage échoué : ${dlErr?.message ?? 'fichier introuvable'}` }, 500)
  }

  const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer())

  let pdfDoc
  try {
    pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  } catch (e) {
    console.error('[extract-pdf] pdf-lib load error:', (e as Error).message)
    return json({ error: `PDF illisible : ${(e as Error).message}` }, 400)
  }

  const totalPages = pdfDoc.getPageCount()
  if (startPage >= totalPages) {
    return json({ error: `startPage (${startPage}) au-delà du nombre de pages (${totalPages})` }, 400)
  }

  const endPage = Math.min(startPage + BATCH_SIZE, totalPages)
  const isLastBatch = endPage >= totalPages
  const pageIndices = Array.from({ length: endPage - startPage }, (_, i) => startPage + i)

  let text = ''
  try {
    const batchDoc = await PDFDocument.create()
    const copiedPages = await batchDoc.copyPages(pdfDoc, pageIndices)
    copiedPages.forEach((p) => batchDoc.addPage(p))
    const batchBytes = await batchDoc.save()
    const batchBase64 = base64Encode(batchBytes)
    const r = await extractBatchWithGemini(batchBase64)
    text = r.text
    // Suivi du coût (panneau d'administration) : tokens facturés par Gemini pour ce lot de pages
    try {
      await supabase.from('api_usage').insert({
        user_id: userId, input_tokens: r.promptTokens, output_tokens: r.outputTokens, model: 'gemini-2.5-flash', kind: 'ocr',
      })
    } catch { /* le suivi ne doit jamais bloquer la lecture du PDF */ }
    console.log(`[extract-pdf] lot ${startPage + 1}-${endPage}/${totalPages} : ${text.length} chars`)
  } catch (e) {
    console.error(`[extract-pdf] lot ${startPage + 1}-${endPage} erreur :`, (e as Error).message)
    // On renvoie quand même une réponse "vide mais valide" pour ce lot plutôt que
    // de faire échouer tout le document — le client concatène ce qui a marché.
    text = ''
  }

  // ── Dernier lot : nettoyage du PDF temporaire ───────────────────────────────
  if (isLastBatch) {
    await supabase.storage.from('course-pdfs').remove([storagePath]).catch(() => {})
  }

  return json({
    text: text ? `\n\n[Pages ${startPage + 1}-${endPage}]\n${text}` : '',
    startPage,
    endPage,
    totalPages,
    isLastBatch,
    batchFailed: !text,
  })
})

// ── Extraction OCR d'un lot de pages via Gemini ───────────────────────────────

async function extractBatchWithGemini(base64: string): Promise<{ text: string; promptTokens: number; outputTokens: number }> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          {
            text:
              'Extrais intégralement le texte de ces pages de cours médical : ' +
              'titres, définitions, listes, tableaux. Conserve la structure. ' +
              'Retourne UNIQUEMENT le texte, sans commentaire.',
          },
        ],
      }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0 },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 150)}`)
  }

  const data = await res.json()
  const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  if (text.length < 20) throw new Error('Texte extrait insuffisant pour ce lot')
  const um = data.usageMetadata
  return { text, promptTokens: um?.promptTokenCount ?? 0, outputTokens: (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0) }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function base64Encode(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
