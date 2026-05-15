import { useState, useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../lib/supabase'
import type { Course, Class, Subject } from '../lib/supabase'
import { splitIntoRichChunks, formatForEmbedding } from '../lib/chunking'
import type { RichChunk, ChunkType } from '../lib/chunking'
import { generateEmbeddings } from '../lib/embeddings'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'

async function renderPageToBase64(pdf: any, pageNum: number): Promise<string> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1.8 }) // haute résolution pour meilleure OCR
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

async function extractBatchWithGemini(
  pdf: any,
  startPage: number,
  endPage: number
): Promise<{ pageNum: number; text: string }[]> {
  const parts: any[] = []

  for (let i = startPage; i <= endPage; i++) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: await renderPageToBase64(pdf, i) } })
  }

  const count = endPage - startPage + 1
  parts.push({ text:
    `Tu es un OCR expert pour les manuels scolaires en français (collège mauritanien, toutes matières).
Extrais le contenu de ces ${count} pages (${startPage} à ${endPage}).
Pour chaque page commence OBLIGATOIREMENT par [PAGE:N] sur une ligne seule (N = numéro de page).
Règles IMPORTANTES :
- Titres de chapitres (Chapitre, Unité, Partie, Leçon, Thème…) : place-les TOUJOURS sur une ligne séparée. Si la police est décorative ou stylisée et que les lettres semblent doublées ou espacées (ex: "C Ch ha ap pi it tr re"), normalise en "Chapitre N".
- Corrige les fautes de frappe évidentes dans les titres (ex: "CHPITRE" → "Chapitre").
- Sous-titres pédagogiques : garde-les tels quels sur leur ligne ("Je retiens", "Je découvre", "Activité", "Consigne", "Bilan", "Règle", "Définition", "Exercice", "Remarque").
- Schémas/figures/photos : [IMAGE: description en 1-2 phrases]
- Tableaux : retranscris ligne par ligne
- Ignore les en-têtes/pieds répétitifs (numéro de page seul, "IPN", nom du manuel répété)
- Retourne UNIQUEMENT le texte extrait, sans introduction ni commentaire`
  })

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${startPage}-${endPage}: ${res.status} ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  // Parser [PAGE:N] sections
  const results: { pageNum: number; text: string }[] = []
  const segments = raw.split(/\[PAGE:(\d+)\]/g)
  for (let i = 1; i < segments.length; i += 2) {
    const pageNum = parseInt(segments[i])
    const text = segments[i + 1]?.trim() || ''
    if (pageNum >= startPage && pageNum <= endPage && text)
      results.push({ pageNum, text })
  }
  // Fallback si le modèle n'a pas mis les balises : attribuer dans l'ordre
  if (results.length === 0 && raw.trim()) {
    for (let i = startPage; i <= endPage; i++)
      results.push({ pageNum: i, text: raw.trim() })
  }
  return results
}

async function extractTextFallback(pdf: any, numPages: number): Promise<string[]> {
  const pageTexts: string[] = []
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const items = content.items as any[]
    if (!items.length) continue
    const lines: string[][] = []
    let currentLine: string[] = []
    let lastY: number | null = null
    for (const item of items) {
      const y = Math.round(item.transform[5])
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        if (currentLine.length) lines.push(currentLine)
        currentLine = []
      }
      if (item.str.trim()) currentLine.push(item.str)
      lastY = y
    }
    if (currentLine.length) lines.push(currentLine)
    const pageText = lines.map(l => l.join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
    if (pageText) pageTexts.push(`[PAGE:${i}]\n${pageText}`)
  }
  return pageTexts
}

async function extractTextFromPDF(
  file: File,
  onProgress?: (msg: string) => void
): Promise<{ text: string; pages: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  const pageTexts: string[] = []

  if (!GEMINI_KEY) {
    onProgress?.('Extraction texte (mode basique — ajoute VITE_GEMINI_API_KEY pour la vision)…')
    const texts = await extractTextFallback(pdf, numPages)
    return { text: texts.join('\n\n'), pages: numPages }
  }

  // Vision Gemini : lots de 5 pages (15 RPM free tier → 4.2s entre lots)
  const BATCH = 5
  for (let start = 1; start <= numPages; start += BATCH) {
    const end = Math.min(start + BATCH - 1, numPages)
    onProgress?.(`🔍 Vision Gemini — pages ${start}–${end} / ${numPages}…`)
    try {
      const results = await extractBatchWithGemini(pdf, start, end)
      for (const { pageNum, text } of results) {
        if (text.trim()) pageTexts.push(`[PAGE:${pageNum}]\n${text}`)
      }
    } catch (e: any) {
      console.warn(`Batch ${start}-${end} Gemini failed, fallback pdfjs:`, e?.message)
      for (let i = start; i <= end; i++) {
        try {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const text = (content.items as any[]).map((it: any) => it.str).filter(Boolean).join(' ')
          if (text.trim()) pageTexts.push(`[PAGE:${i}]\n${text}`)
        } catch {}
      }
    }
    if (end < numPages) {
      onProgress?.(`⏳ ${end}/${numPages} pages extraites, pause…`)
      await new Promise(r => setTimeout(r, 4200))
    }
  }

  return { text: pageTexts.join('\n\n'), pages: numPages }
}

// ── Détection de structure chapitres/sections ──────────────────────────────

export type CourseChunk = { title: string; content: string; index: number; images?: string[]; startPage?: number; endPage?: number }

// Ligne de sommaire : toute ligne courte (< 90 chars) qui finit par espace + chiffres (numéro de page)
function isTocLine(line: string): boolean {
  const t = line.trim()
  if (t.length > 90) return false
  return /\s\d{1,3}\s*$/.test(t) || /\.{3,}\s*\d{1,3}\s*$/.test(t)
}

// Seuls les Unité/Chapitre/Partie font une coupure. Tout le reste (Je retiens, BILAN, ALL_CAPS…) reste dans le contenu.
function stripGeminiNoise(line: string): string {
  return line.trim()
    .replace(/^\d{1,3}\s+/, '')      // "9 Unité I" → "Unité I"
    .replace(/^IPN\s*/i, '')          // watermark IPN parfois répété
    .replace(/^\*{1,3}/, '')          // markdown bold **Unité
    .replace(/^#+\s*/, '')            // markdown heading ## Unité
    .trim()
}

function isMajorHeader(line: string): boolean {
  const t = stripGeminiNoise(line)
  if (!t || t.length > 160 || isTocLine(t)) return false
  // Mots-clés avec variantes accentuées/non-accentuées
  return /^(unit[eé]s?|ch[a]?pitres?|chpitre|parties?|le[cç]ons?|th[eè]mes?|s[eé]quences?|modules?|sections?|blocs?)\s*[\d:IVXivx]/i.test(t)
}

function extractChapterTitle(text: string): string | null {
  const KEYWORDS = /^(unit[eé]|ch[a]?pitres?|chpitre|parties?|le[cç]ons?|th[eè]mes?|s[eé]quences?|modules?)\s*[\dIVXivx]/i
  if (!KEYWORDS.test(text)) return null
  // Title ends before the first numbered sub-section or pedagogical signal
  let end = Math.min(text.length, 180)
  const stop = text.search(/\s+\d+[\.\-]\s+[A-ZÀ-Ü]|\s+Je\s+[a-z]|\s+Activit[eé]|\s+Consigne|\s+Exercice/i)
  if (stop > 10 && stop < 200) end = stop
  return text.slice(0, end).trim()
}

function isMostlyTOC(text: string): boolean {
  // TOC pages have many "text   pageNumber" patterns
  return ((text.match(/\s{2,}\d{1,3}(?:\s|$)/g)) || []).length >= 3
}

function splitIntoChapters(text: string): CourseChunk[] {
  // ── Approche 1 : page par page via marqueurs [PAGE:N] ──────────────────────
  // Gemini sort souvent tout le contenu d'une page en un seul paragraphe,
  // donc on découpe par page et on détecte le titre en début de page.
  const segments = text.split(/\[PAGE:(\d+)\]/)
  const pages: { num: number; raw: string }[] = []
  for (let i = 1; i < segments.length; i += 2) {
    const num = parseInt(segments[i])
    const raw = (segments[i + 1] || '').trim()
    if (raw) pages.push({ num, raw })
  }

  if (pages.length >= 3) {
    const chunks: CourseChunk[] = []
    let currentTitle = 'Introduction'
    let currentContent: string[] = []
    let startPage = pages[0].num

    const flushP = (endPage: number) => {
      const content = currentContent.join('\n\n').trim()
      if (content.length > 30)
        chunks.push({ title: currentTitle, content, index: chunks.length, startPage, endPage })
      currentContent = []
    }

    for (const { num: pageNum, raw } of pages) {
      const clean = raw.replace(/^\d{1,3}\s+/, '').replace(/^IPN\s*/i, '').trim()
      const title = extractChapterTitle(clean)
      if (title) {
        flushP(pageNum - 1)
        currentTitle = title
        startPage = pageNum
        const rest = clean.slice(title.length).trim()
        if (rest.length > 10) currentContent.push(rest)
      } else if (!isMostlyTOC(clean)) {
        currentContent.push(clean)
      }
    }
    flushP(pages[pages.length - 1].num)

    if (chunks.length >= 2) return chunks.map((c, i) => ({ ...c, index: i }))
  }

  // ── Approche 2 : ligne par ligne (PDF avec retours à la ligne) ──────────────
  const lines = text.split('\n')
  const chunks: CourseChunk[] = []
  let currentTitle = 'Introduction'
  let currentLines: string[] = []
  let currentPage = 1
  let chunkStartPage = 1
  let lastContentPage = 1

  const flushL = (endPage = lastContentPage) => {
    const content = currentLines.join('\n').trim()
    if (content.length > 30)
      chunks.push({ title: currentTitle, content, index: chunks.length, startPage: chunkStartPage, endPage })
    currentLines = []
  }

  for (const line of lines) {
    const pageMatch = line.match(/^\[PAGE:(\d+)\]$/)
    if (pageMatch) { currentPage = parseInt(pageMatch[1]); continue }
    if (isMajorHeader(line)) {
      flushL(currentPage - 1 > chunkStartPage ? currentPage - 1 : currentPage)
      currentTitle = stripGeminiNoise(line)
      chunkStartPage = currentPage
      lastContentPage = currentPage
    } else if (!isTocLine(line)) {
      lastContentPage = currentPage
      currentLines.push(line)
    }
  }
  flushL()

  if (chunks.length >= 2) return chunks

  // ── Approche 3 : fallback paragraphes ──────────────────────────────────────
  const paragraphs = text.replace(/\[PAGE:\d+\]/g, '').split(/\n\s*\n/).filter(p => p.trim().length > 80)
  const grouped: CourseChunk[] = []
  for (let i = 0; i < paragraphs.length; i += 3) {
    grouped.push({
      title: `Partie ${grouped.length + 1}`,
      content: paragraphs.slice(i, i + 3).join('\n\n'),
      index: grouped.length,
    })
  }

  return grouped.length > 0 ? grouped : [{ title: 'Contenu du cours', content: text, index: 0 }]
}

type Tab = 'courses' | 'upload' | 'classes' | 'subjects'

export default function DashboardPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('courses')
  const [courses, setCourses] = useState<Course[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = () => setRefreshKey(k => k + 1)

  useEffect(() => {
    Promise.all([
      supabase.from('courses').select('*, classes(name), subjects(name)').order('created_at', { ascending: false }),
      supabase.from('classes').select('*').order('name'),
      supabase.from('subjects').select('*').order('name'),
    ]).then(([c, cl, s]) => {
      if (c.data) setCourses(c.data as Course[])
      if (cl.data) setClasses(cl.data as Class[])
      if (s.data) setSubjects(s.data as Subject[])
    })
  }, [refreshKey])

  return (
    <div className="layout">
      <header className="header">
        <div className="header-brand">
          <span className="header-emoji">🎓</span>
          <span className="header-title">ProfNum Admin</span>
        </div>
        <div className="header-right">
          <span className="header-email">{session.user.email}</span>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>
      </header>

      <nav className="tabs">
        {([
          ['courses', '📚', `Cours (${courses.length})`],
          ['upload', '➕', 'Ajouter'],
          ['classes', '🏫', 'Classes'],
          ['subjects', '📖', 'Matières'],
        ] as [Tab, string, string][]).map(([t, icon, label]) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {icon} {label}
          </button>
        ))}
      </nav>

      <div className="content">
        {tab === 'courses' && (
          <CoursesTab courses={courses} onDelete={refresh} />
        )}
        {tab === 'upload' && (
          <UploadTab
            classes={classes}
            subjects={subjects}
            onSuccess={() => { refresh(); setTab('courses') }}
          />
        )}
        {tab === 'classes' && <ClassesTab classes={classes} onRefresh={refresh} />}
        {tab === 'subjects' && <SubjectsTab subjects={subjects} onRefresh={refresh} />}
      </div>
    </div>
  )
}

// ── Courses Tab ───────────────────────────────────────────────────────────────

function CoursesTab({ courses, onDelete }: { courses: Course[]; onDelete: () => void }) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)

  const handleDelete = async (course: Course) => {
    if (!confirm(`Supprimer "${course.name}" ? Cette action est irréversible.`)) return
    setDeleting(course.id)
    await supabase.storage.from('courses').remove([course.pdf_path])
    await supabase.from('courses').delete().eq('id', course.id)
    setDeleting(null)
    onDelete()
  }

  if (courses.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-emoji">📭</span>
        <p>Aucun cours. Clique sur "Ajouter" pour uploader le premier !</p>
      </div>
    )
  }

  const grouped: Record<string, Course[]> = {}
  courses.forEach(c => {
    const key = c.classes?.name || 'Sans classe'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(c)
  })

  return (
    <>
      {editingCourse && (
        <ChapterEditorModal
          course={editingCourse}
          onClose={() => setEditingCourse(null)}
          onSaved={() => { setEditingCourse(null); onDelete() }}
        />
      )}
      <div>
        {Object.entries(grouped).sort().map(([className, items]) => (
          <div key={className} className="group">
            <h3 className="group-title">🏫 {className}</h3>
            <div className="course-list">
              {items.map(course => (
                <div key={course.id} className="course-card">
                  <div className="course-card-left">
                    <span className="course-icon">📄</span>
                    <div>
                      <div className="course-name">{course.name}</div>
                      <div className="course-meta">
                        {course.subjects?.name} · {new Date(course.created_at).toLocaleDateString('fr-FR')}
                        {course.chunks && (() => {
                          try { return ` · ${JSON.parse(course.chunks).length} chapitres` } catch { return '' }
                        })()}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-edit"
                      onClick={() => setEditingCourse(course)}
                      title="Éditer les chapitres"
                    >
                      ✏️ Chapitres
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(course)}
                      disabled={deleting === course.id}
                      title="Supprimer"
                    >
                      {deleting === course.id ? '⏳' : '🗑️'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Chapter List Modal ────────────────────────────────────────────────────────

function ChapterEditorModal({
  course,
  onClose,
  onSaved,
}: {
  course: Course
  onClose: () => void
  onSaved: () => void
}) {
  const [chunks, setChunks] = useState<CourseChunk[]>(() => {
    try { return course.chunks ? JSON.parse(course.chunks) : [] } catch { return [] }
  })
  const [saving, setSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  const deleteChunk = (idx: number) =>
    setChunks(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, index: i })))

  const addChunk = () => {
    const newChunk: CourseChunk = { title: 'Nouveau chapitre', content: '', index: chunks.length }
    setChunks(prev => [...prev, newChunk])
    setEditingIdx(chunks.length)
  }

  const handleSaveChunk = (idx: number, title: string, content: string, images: string[]) => {
    setChunks(prev => prev.map((c, i) => i === idx ? { ...c, title, content, images } : c))
    setEditingIdx(null)
  }

  const handleSaveAll = async () => {
    setSaving(true)
    const reindexed = chunks.map((c, i) => ({ ...c, index: i }))

    const { error } = await supabase
      .from('courses')
      .update({ chunks: JSON.stringify(reindexed) })
      .eq('id', course.id)
    if (error) { setSaving(false); alert('Erreur : ' + error.message); return }

    try {
      const richChunks: RichChunk[] = reindexed.map(c => ({
        title:     c.title,
        content:   c.content,
        chunkType: 'content' as ChunkType,
        index:     c.index,
        startPage: c.startPage,
        endPage:   c.endPage,
        wordCount: c.content.trim().split(/\s+/).length,
        images:    c.images,
      }))
      const texts = richChunks.map(ch => formatForEmbedding(ch, course.name))
      const embeddings = await generateEmbeddings(texts)
      await supabase.from('course_chunks').delete().eq('course_id', course.id)
      const { error: ie } = await supabase.from('course_chunks').insert(
        richChunks.map((ch, i) => ({
          course_id:   course.id,
          chunk_index: i,
          title:       ch.title,
          content:     ch.content,
          embedding:   embeddings[i],
          chunk_type:  ch.chunkType,
          start_page:  ch.startPage ?? null,
          end_page:    ch.endPage ?? null,
          images:      ch.images ?? [],
          word_count:  ch.wordCount,
        }))
      )
      if (ie) throw new Error(ie.message)
    } catch (e: any) {
      console.error('Embeddings:', e)
      alert('Cours sauvegardé, embeddings non générés : ' + e.message)
    }

    setSaving(false)
    onSaved()
  }

  if (editingIdx !== null && chunks[editingIdx]) {
    return (
      <ChunkDetailModal
        chunk={chunks[editingIdx]}
        courseId={course.id}
        index={editingIdx}
        total={chunks.length}
        onBack={() => setEditingIdx(null)}
        onSave={(title, content, images) => handleSaveChunk(editingIdx, title, content, images)}
      />
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div>
            <div className="modal-title">📚 Chapitres</div>
            <div className="modal-subtitle">{course.name} · {chunks.length} chapitre{chunks.length !== 1 ? 's' : ''}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="chunks-list">
          {chunks.length === 0 && (
            <p className="empty-msg" style={{ padding: '32px 0', textAlign: 'center' }}>
              Aucun chapitre détecté. Clique "+ Ajouter" pour en créer un.
            </p>
          )}
          {chunks.map((chunk, idx) => (
            <div key={idx} className="chunk-row" onClick={() => setEditingIdx(idx)}>
              <span className="chunk-num">{idx + 1}</span>
              <span className="chunk-row-title">{chunk.title}</span>
              <span className="chunk-row-chars">{chunk.content.length} car.</span>
              <button
                className="chunk-row-edit"
                onClick={e => { e.stopPropagation(); setEditingIdx(idx) }}
              >Éditer →</button>
              <button
                className="chunk-delete"
                onClick={e => { e.stopPropagation(); deleteChunk(idx) }}
                title="Supprimer"
              >✕</button>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn-add" onClick={addChunk}>+ Ajouter un chapitre</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-cancel" onClick={onClose}>Fermer</button>
            <button className="btn-save" onClick={handleSaveAll} disabled={saving}>
              {saving ? '⏳…' : '💾 Sauvegarder tout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Chunk Detail Modal ────────────────────────────────────────────────────────

function ChunkDetailModal({
  chunk,
  courseId,
  index,
  total,
  onBack,
  onSave,
}: {
  chunk: CourseChunk
  courseId: string
  index: number
  total: number
  onBack: () => void
  onSave: (title: string, content: string, images: string[]) => void
}) {
  const [title, setTitle] = useState(chunk.title)
  const [content, setContent] = useState(chunk.content)
  const [images, setImages] = useState<string[]>(chunk.images || [])
  const [uploading, setUploading] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    const newImages: string[] = []
    for (const file of files) {
      const path = `course-images/${courseId}/${index}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('courses').upload(path, file, { upsert: true })
      if (!error) {
        const { data } = supabase.storage.from('courses').getPublicUrl(path)
        if (data.publicUrl) newImages.push(data.publicUrl)
      }
    }
    setImages(prev => [...prev, ...newImages])
    setUploading(false)
    if (imgRef.current) imgRef.current.value = ''
  }

  const removeImage = (url: string) => setImages(prev => prev.filter(img => img !== url))

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <div>
            <div className="modal-title">✏️ Chapitre {index + 1} / {total}</div>
            <div className="modal-subtitle">Texte + images du chapitre</div>
          </div>
          <button className="modal-close" onClick={onBack}>←</button>
        </div>

        <div className="chunk-detail-body">
          <label className="chunk-detail-label">Titre du chapitre</label>
          <input
            type="text"
            autoComplete="off"
            data-lpignore="true"
            data-form-type="other"
            className="chunk-detail-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex : Unité I — Introduction aux SVT"
          />

          <label className="chunk-detail-label" style={{ marginTop: 16 }}>
            Contenu ({content.length} caractères)
          </label>
          <textarea
            className="chunk-detail-content"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Colle ici le texte du chapitre extrait du manuel…"
          />

          <label className="chunk-detail-label" style={{ marginTop: 16 }}>
            Images du chapitre ({images.length})
          </label>
          <div className="chunk-images-grid">
            {images.map((img, i) => (
              <div key={i} className="chunk-img-wrap">
                <img src={img} alt={`img-${i}`} className="chunk-img-thumb" />
                <button className="chunk-img-remove" onClick={() => removeImage(img)}>✕</button>
              </div>
            ))}
            <button
              className="chunk-img-add"
              onClick={() => imgRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? '⏳' : '+ Image'}
            </button>
            <input
              ref={imgRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageUpload}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onBack}>← Retour</button>
          <button className="btn-save" onClick={() => onSave(title, content, images)}>
            ✓ Valider ce chapitre
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Upload Tab ────────────────────────────────────────────────────────────────

function UploadTab({
  classes,
  subjects,
  onSuccess,
}: {
  classes: Class[]
  subjects: Subject[]
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !classId || !subjectId || !name.trim()) {
      setError('Remplis tous les champs.')
      return
    }
    setUploading(true)
    setError('')
    setProgress('Lecture du PDF en cours…')

    let extractedText = ''
    let extractedPages = 0
    try {
      const result = await extractTextFromPDF(file, setProgress)
      extractedText = result.text
      extractedPages = result.pages
      if (extractedText.trim().length < 30) {
        setError('Le PDF semble être scanné ou vide. Le texte n\'a pas pu être extrait. Utilise un PDF avec du texte natif.')
        setUploading(false)
        setProgress('')
        return
      }
    } catch (e: any) {
      setError(`Erreur lors de la lecture du PDF : ${e?.message}`)
      setUploading(false)
      setProgress('')
      return
    }

    setProgress('Upload du PDF en cours…')

    const ext = file.name.split('.').pop() || 'pdf'
    const path = `${classId}/${subjectId}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('courses')
      .upload(path, file, { upsert: false })

    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      setProgress('')
      return
    }

    setProgress('Analyse de la structure du cours…')
    // Chapter-level chunks → stored in courses.chunks for mobile UI display
    const displayChunks = splitIntoChapters(extractedText)
    // Fine-grained sub-chunks → stored in course_chunks for vector search
    const richChunks = splitIntoRichChunks(extractedText)

    setProgress('Enregistrement dans la base…')
    const { data: newCourse, error: dbErr } = await supabase.from('courses').insert({
      class_id:   classId,
      subject_id: subjectId,
      name:       name.trim(),
      pdf_path:   path,
      pages:      extractedPages,
      content:    extractedText,
      chunks:     JSON.stringify(displayChunks),
    }).select().single()

    if (dbErr) {
      setError(dbErr.message)
      setUploading(false)
      setProgress('')
      return
    }

    setProgress('Génération des embeddings…')
    try {
      const texts = richChunks.map(c => formatForEmbedding(c, name.trim()))
      const embeddings = await generateEmbeddings(texts)
      const { error: ie } = await supabase.from('course_chunks').insert(
        richChunks.map((c, i) => ({
          course_id:   newCourse.id,
          chunk_index: i,
          title:       c.title,
          content:     c.content,
          embedding:   embeddings[i],
          chunk_type:  c.chunkType,
          start_page:  c.startPage ?? null,
          end_page:    c.endPage ?? null,
          images:      c.images ?? [],
          word_count:  c.wordCount,
        }))
      )
      if (ie) throw new Error(ie.message)
    } catch (e: any) {
      console.error('Embeddings:', e)
      alert('Cours sauvegardé, embeddings non générés : ' + e.message)
    }

    setUploading(false)
    setProgress('')
    setName('')
    setClassId('')
    setSubjectId('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    onSuccess()
  }

  return (
    <div className="form-container">
      <h2 className="form-title">Ajouter un cours</h2>
      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label>Nom du cours</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ex : SVT – Chapitre 1 : La cellule"
            required
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Classe</label>
            <select value={classId} onChange={e => setClassId(e.target.value)} required>
              <option value="">Choisir…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Matière</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} required>
              <option value="">Choisir…</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Fichier PDF</label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            onChange={e => setFile(e.target.files?.[0] || null)}
            required
          />
        </div>
        {error && <p className="error-msg">⚠️ {error}</p>}
        {progress && <p className="progress-msg">⏳ {progress}</p>}
        <button type="submit" className="btn-primary" disabled={uploading}>
          {uploading ? 'Upload en cours…' : '⬆️ Uploader le cours'}
        </button>
      </form>
    </div>
  )
}

// ── Classes Tab ───────────────────────────────────────────────────────────────

function ClassesTab({ classes, onRefresh }: { classes: Class[]; onRefresh: () => void }) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    await supabase.from('classes').insert({ name: newName.trim() })
    setNewName('')
    setAdding(false)
    onRefresh()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ? Tous ses cours seront supprimés.`)) return
    await supabase.from('classes').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div className="form-container">
      <h2 className="form-title">Gérer les classes</h2>
      <form onSubmit={handleAdd} className="inline-form">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="ex : 6ème A"
          required
        />
        <button type="submit" className="btn-primary" disabled={adding}>
          {adding ? '…' : 'Ajouter'}
        </button>
      </form>
      <div className="tag-list">
        {classes.length === 0 && <p className="empty-msg">Aucune classe. Ajoute-en une !</p>}
        {classes.map(c => (
          <div key={c.id} className="tag-item">
            <span>🏫 {c.name}</span>
            <button className="tag-delete" onClick={() => handleDelete(c.id, c.name)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Subjects Tab ──────────────────────────────────────────────────────────────

function SubjectsTab({ subjects, onRefresh }: { subjects: Subject[]; onRefresh: () => void }) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    await supabase.from('subjects').insert({ name: newName.trim() })
    setNewName('')
    setAdding(false)
    onRefresh()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return
    await supabase.from('subjects').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div className="form-container">
      <h2 className="form-title">Gérer les matières</h2>
      <form onSubmit={handleAdd} className="inline-form">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="ex : SVT, Maths, Français…"
          required
        />
        <button type="submit" className="btn-primary" disabled={adding}>
          {adding ? '…' : 'Ajouter'}
        </button>
      </form>
      <div className="tag-list">
        {subjects.length === 0 && <p className="empty-msg">Aucune matière. Ajoute-en une !</p>}
        {subjects.map(s => (
          <div key={s.id} className="tag-item">
            <span>📖 {s.name}</span>
            <button className="tag-delete" onClick={() => handleDelete(s.id, s.name)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
