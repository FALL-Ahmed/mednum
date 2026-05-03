import { useState, useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../lib/supabase'
import type { Course, Class, Subject } from '../lib/supabase'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

async function extractTextFromPDF(file: File): Promise<{ text: string; pages: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  const pageTexts: string[] = []
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (pageText) pageTexts.push(pageText)
  }
  return { text: pageTexts.join('\n\n'), pages: numPages }
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
                    </div>
                  </div>
                </div>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(course)}
                  disabled={deleting === course.id}
                  title="Supprimer"
                >
                  {deleting === course.id ? '⏳' : '🗑️'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
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
      const result = await extractTextFromPDF(file)
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

    setProgress('Enregistrement dans la base…')
    const { error: dbErr } = await supabase.from('courses').insert({
      class_id: classId,
      subject_id: subjectId,
      name: name.trim(),
      pdf_path: path,
      pages: extractedPages,
      content: extractedText,
    })

    if (dbErr) {
      setError(dbErr.message)
      setUploading(false)
      setProgress('')
      return
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
