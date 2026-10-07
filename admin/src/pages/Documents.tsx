import { useEffect, useMemo, useState } from 'react'
import { Icons } from '../components/icons'
import { Kpi, KpiRow, Loading, Notice, PageHead } from '../components/ui'
import { dateTime, fmt, pct } from '../lib/admin'
import { supabase } from '../lib/supabase'
import ModuleStats from '../components/ModuleStats'

/* Banque de cours : tous les cours déposés par les élèves, avec le fichier d'origine, classés par année d'étude, module et date. */

type Row = {
  id: string; name: string; subject_name: string | null; pages: number; chars: number
  owner_name: string | null; owner_promotion: string | null; owner_school: string | null; owner_country: string | null
  created_at: string; has_fiche: boolean; has_flashcards: boolean; has_cases: boolean
  file_path: string | null; file_count: number | null; file_size: number | null; file_mime: string | null; file_name: string | null
}

type Group = 'none' | 'year' | 'module' | 'month'
const BUCKET = 'course-files'
const DAY = 86400000
const PAGE = 25

const mo = (n: number) => (n >= 1073741824 ? `${fmt(n / 1073741824, 1)} Go` : `${fmt(n / 1048576, n < 10485760 ? 1 : 0)} Mo`)
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
const monthKey = (iso: string) => iso.slice(0, 7)
const NONE = '—'
const norm = (s: string | null) => (s ?? '').trim().toLowerCase()

export default function Documents() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [module, setModule] = useState('')
  const [school, setSchool] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [group, setGroup] = useState<Group>('year')
  const [files, setFiles] = useState<{ title: string; links: { label: string; url: string }[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(0)
  const [view, setView] = useState<'bank' | 'modules'>('bank')

  useEffect(() => {
    supabase.rpc('admin_course_bank', { p_limit: 5000 }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else setRows((data ?? []) as Row[])
    })
  }, [])

  const options = useMemo(() => {
    const uniq = (f: (r: Row) => string | null) => [...new Set((rows ?? []).map(f).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
    return { years: uniq(r => r.owner_promotion), modules: [...(rows ?? []).reduce((m, r) => (r.subject_name && norm(r.subject_name) && !m.has(norm(r.subject_name)) ? m.set(norm(r.subject_name), r.subject_name.trim()) : m), new Map<string, string>())].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true })), schools: uniq(r => r.owner_school) }
  }, [rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const t0 = from ? +new Date(from) : -Infinity
    const t1 = to ? +new Date(to) + DAY : Infinity
    return (rows ?? []).filter(r => {
      if (year && r.owner_promotion !== year) return false
      if (module && norm(r.subject_name) !== module) return false
      if (school && r.owner_school !== school) return false
      const t = +new Date(r.created_at)
      if (t < t0 || t >= t1) return false
      return !s || `${r.name} ${r.owner_name ?? ''} ${r.subject_name ?? ''}`.toLowerCase().includes(s)
    })
  }, [rows, q, year, module, school, from, to])

  // Retour à la première page dès que le filtre ou le classement change
  useEffect(() => { setPage(0) }, [q, year, module, school, from, to, group])

  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const pageRows = useMemo(() => shown.slice(cur * PAGE, cur * PAGE + PAGE), [shown, cur])

  const keyOf = (r: Row) => (group === 'year' ? r.owner_promotion ?? NONE : group === 'module' ? r.subject_name ?? NONE : monthKey(r.created_at))
  // Totaux de chaque groupe sur TOUS les cours filtrés (pas seulement la page affichée)
  const totals = useMemo(() => {
    const t = new Map<string, { n: number; pages: number; size: number }>()
    if (group === 'none') return t
    for (const r of shown) {
      const k = keyOf(r)
      const c = t.get(k) ?? { n: 0, pages: 0, size: 0 }
      t.set(k, { n: c.n + 1, pages: c.pages + Number(r.pages), size: c.size + Number(r.file_size ?? 0) })
    }
    return t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, group])

  const groups = useMemo(() => {
    if (group === 'none') return [{ key: '', label: '', items: pageRows }]
    const m = new Map<string, Row[]>()
    for (const r of pageRows) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r])
    const entries = [...m.entries()].sort(([a], [b]) => (group === 'month' ? b.localeCompare(a) : a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b, 'fr', { numeric: true })))
    return entries.map(([key, items]) => ({ key, label: group === 'month' ? monthLabel(items[0].created_at) : key, items }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows, group])

  async function openFile(r: Row) {
    if (!r.file_path) return
    setBusy(r.id)
    try {
      if ((r.file_count ?? 1) > 1) {
        // Plusieurs photos : une page par fichier
        const { data } = await supabase.storage.from(BUCKET).list(r.file_path, { limit: 200, sortBy: { column: 'name', order: 'asc' } })
        const names = (data ?? []).map(x => x.name)
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(names.map(n => `${r.file_path}/${n}`), 900)
        setFiles({ title: r.name, links: (signed ?? []).map((s, i) => ({ label: `Page ${i + 1}`, url: s.signedUrl })).filter(l => l.url) })
      } else {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.file_path, 900)
        if (error || !data) setErr(error?.message ?? 'Fichier introuvable')
        else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setBusy(null)
    }
  }

  if (err && !rows) return <div><PageHead title="Cours des élèves" /><Notice tone="bad">{/admin_course_bank|file_path/.test(err) ? "La banque de cours n'existe pas encore : exécute le fichier supabase/ops/a_executer_maintenant.sql dans Supabase (SQL Editor)." : `Impossible de lire les cours : ${err}`}</Notice></div>
  if (!rows) return <div><PageHead title="Cours des élèves" /><Loading /></div>

  const stored = rows.filter(r => r.file_path)
  const bytes = stored.reduce((a, r) => a + Number(r.file_size ?? 0), 0)
  const preset = (days: number) => {
    const d = new Date(Date.now() - days * DAY)
    setFrom(d.toISOString().slice(0, 10))
    setTo('')
  }
  const filtered = !!(q || year || module || school || from || to)

  const tabs = (
    <div className="bk-bar">
      <button className={`fp${view === 'bank' ? ' on' : ''}`} onClick={() => setView('bank')}>Les cours</button>
      <button className={`fp${view === 'modules' ? ' on' : ''}`} onClick={() => setView('modules')}>Par module</button>
    </div>
  )

  if (view === 'modules') {
    return (
      <div>
        <PageHead title="Cours des élèves" sub="Où les élèves déposent leurs cours : les modules les plus demandés sont ceux où soigner la qualité en priorité." />
        {tabs}
        <ModuleStats
          onOpen={(promotion, label) => {
            setYear(promotion === NONE ? '' : promotion)
            setModule(label === 'Sans module' ? '' : norm(label))
            setGroup('month')
            setView('bank')
          }}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Cours des élèves" sub="La banque de cours : chaque cours déposé est conservé, en privé, classé par année d'étude, par module et par date." />
      {tabs}
      {err && <Notice tone="bad">{err}</Notice>}
      <KpiRow>
        <Kpi label="Cours dans la banque" value={fmt(rows.length)} sub={`${fmt(rows.reduce((a, r) => a + Number(r.pages), 0))} pages`} />
        <Kpi label="Avec le fichier conservé" value={pct(stored.length, rows.length)} sub={`${fmt(stored.length)} cours (les plus anciens n'en ont pas)`} tone={stored.length > 0 ? 'good' : undefined} />
        <Kpi label="Espace utilisé" value={mo(bytes)} sub="sur 100 Go inclus avec le plan Pro" />
        <Kpi label="Modules" value={fmt(options.modules.length)} sub={`${fmt(options.years.length)} années d'étude`} />
      </KpiRow>

      <div className="card bk-filters">
        <div className="sbar" style={{ maxWidth: 'none' }}>
          <span className="sbar-ic"><Icons.Search /></span>
          <input className="sinp" value={q} onChange={e => setQ(e.target.value)} placeholder="Cours, élève ou module…" />
        </div>
        <div className="bk-grid">
          <label className="bk-f"><span>Année d'étude</span>
            <select className="ad-select" value={year} onChange={e => setYear(e.target.value)}>
              <option value="">Toutes</option>
              {options.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="bk-f"><span>Module</span>
            <select className="ad-select" value={module} onChange={e => setModule(e.target.value)}>
              <option value="">Tous</option>
              {options.modules.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          {options.schools.length > 0 && (
            <label className="bk-f"><span>Université</span>
              <select className="ad-select" value={school} onChange={e => setSchool(e.target.value)}>
                <option value="">Toutes</option>
                {options.schools.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <label className="bk-f"><span>Du</span><input className="ad-input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="bk-f"><span>Au</span><input className="ad-input" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
        <div className="bk-bar">
          {[7, 30, 90].map(d => <button key={d} className="fp" onClick={() => preset(d)}>{d} jours</button>)}
          {filtered && <button className="btn-g" onClick={() => { setQ(''); setYear(''); setModule(''); setSchool(''); setFrom(''); setTo('') }}>Effacer les filtres</button>}
        </div>
        <div className="bk-bar">
          <span className="ad-mut">Grouper par</span>
          {([['year', 'Année'], ['module', 'Module'], ['month', 'Mois'], ['none', 'Rien']] as const).map(([k, l]) => (
            <button key={k} className={`fp${group === k ? ' on' : ''}`} onClick={() => setGroup(k)}>{l}</button>
          ))}
        </div>
      </div>

      {(module || year || school) && (
        <div style={{ margin: '8px 2px 14px' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, margin: 0 }}>{options.modules.find(m => m.key === module)?.label || 'Tous les modules'}</h2>
          <p className="ad-mut" style={{ margin: '4px 0 0' }}>{[year, school].filter(Boolean).join(' · ') || 'Toutes les années'}</p>
        </div>
      )}
      <p className="ad-mut" style={{ margin: '4px 2px 12px' }}>{shown.length} cours</p>

      {groups.length === 0 || shown.length === 0 ? (
        <div className="card"><p className="ad-empty">Aucun cours ne correspond.</p></div>
      ) : (
        groups.map(g => {
          const collapsed = open[g.key] === false
          return (
            <section key={g.key || 'all'} className="bk-group">
              {group !== 'none' && (
                <button className="bk-head" onClick={() => setOpen(o => ({ ...o, [g.key]: collapsed }))} aria-expanded={!collapsed}>
                  <span aria-hidden className={`bk-chev${collapsed ? '' : ' on'}`}>▸</span>
                  <strong>{g.label}</strong>
                  <span className="badge bg-gy">{totals.get(g.key)?.n ?? g.items.length} cours</span>
                  <span className="ad-mut">{fmt(totals.get(g.key)?.pages ?? 0)} pages · {mo(totals.get(g.key)?.size ?? 0)}{totals.get(g.key) && totals.get(g.key)!.n > g.items.length ? ` · ${g.items.length} affichés` : ''}</span>
                </button>
              )}
              {!collapsed && (
                <div className="card bk-tbl" style={{ overflowX: 'auto' }}>
                  <table className="dt">
                    <thead><tr><th>Cours</th><th>Module</th><th>Élève</th><th>Année</th><th>Pages</th><th>Ajouté le</th><th>Fichier</th></tr></thead>
                    <tbody>
                      {g.items.map(r => (
                        <tr key={r.id}>
                          <td><strong>{r.name}</strong><div className="ad-mut">{r.has_fiche ? 'fiche · ' : ''}{r.has_flashcards ? 'flashcards · ' : ''}{r.has_cases ? 'cas cliniques' : ''}</div></td>
                          <td>{r.subject_name ?? <span className="ad-mut">—</span>}</td>
                          <td>{r.owner_name ?? '—'}<div className="ad-mut">{r.owner_school ?? ''}</div></td>
                          <td>{r.owner_promotion ?? <span className="ad-mut">—</span>}</td>
                          <td>{fmt(Number(r.pages))}</td>
                          <td>{dateTime(r.created_at)}</td>
                          <td>
                            {r.file_path ? (
                              <button className="btn-s" disabled={busy === r.id} onClick={() => openFile(r)}>
                                {busy === r.id ? '…' : `Ouvrir${(r.file_count ?? 1) > 1 ? ` (${r.file_count})` : ''}`}
                              </button>
                            ) : <span className="ad-mut">non conservé</span>}
                            {r.file_size ? <div className="ad-mut">{mo(Number(r.file_size))}</div> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!collapsed && (
                <div className="bk-cards">
                  {g.items.map(r => (
                    <article key={r.id} className="card bk-card">
                      <h4>{r.name}</h4>
                      <div className="bk-tags">
                        {r.subject_name && <span className="badge bg-bl">{r.subject_name}</span>}
                        {r.owner_promotion && <span className="badge bg-gy">{r.owner_promotion}</span>}
                      </div>
                      <p className="ad-mut">{r.owner_name ?? '—'}{r.owner_school ? ` · ${r.owner_school}` : ''}</p>
                      <p className="ad-mut">{fmt(Number(r.pages))} pages · {dateTime(r.created_at)}</p>
                      {r.file_path ? (
                        <button className="btn-s" disabled={busy === r.id} onClick={() => openFile(r)}>
                          {busy === r.id ? '…' : `Ouvrir le fichier${(r.file_count ?? 1) > 1 ? ` (${r.file_count} pages)` : ''}${r.file_size ? ` · ${mo(Number(r.file_size))}` : ''}`}
                        </button>
                      ) : <p className="ad-mut">Fichier non conservé</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}

      {shown.length > PAGE && (
        <div className="pg">
          <button className="btn-s" disabled={cur === 0} onClick={() => { setPage(cur - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>← Précédent</button>
          <span className="ad-mut">Page {cur + 1} sur {pages} · {cur * PAGE + 1}–{Math.min(shown.length, cur * PAGE + PAGE)} sur {shown.length}</span>
          <button className="btn-s" disabled={cur >= pages - 1} onClick={() => { setPage(cur + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Suivant →</button>
        </div>
      )}

      {files && (
        <div className="md-scrim" onClick={() => setFiles(null)}>
          <div className="md" role="dialog" aria-modal="true" aria-label="Pages du cours" onClick={e => e.stopPropagation()}>
            <h3>{files.title}</h3>
            <p className="ad-mut">Liens valables 15 minutes.</p>
            <div className="md-opts" style={{ marginTop: 14, maxHeight: 320, overflowY: 'auto' }}>
              {files.links.map(l => <a key={l.url} className="btn-s" href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}
            </div>
            <div className="md-act"><button className="btn-s" onClick={() => setFiles(null)}>Fermer</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
