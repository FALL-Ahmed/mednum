import { useEffect, useMemo, useState } from 'react'
import { fmt } from '../lib/admin'
import { supabase } from '../lib/supabase'
import { Kpi, KpiRow, Loading, Notice } from './ui'

/* Tableau par module : où les élèves déposent leurs cours, donc où soigner la qualité en priorité. */

type Stat = { promotion: string; module: string; courses: number; pages: number; students: number; with_file: number; last_at: string | null }
type Sort = 'courses' | 'pages' | 'students' | 'module'
const DAY = 86400000

export default function ModuleStats({ onOpen }: { onOpen: (promotion: string, module: string) => void }) {
  const [rows, setRows] = useState<Stat[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [days, setDays] = useState(0)
  const [year, setYear] = useState('')
  const [sort, setSort] = useState<Sort>('courses')

  useEffect(() => {
    setRows(null)
    const since = days ? new Date(Date.now() - days * DAY).toISOString() : null
    supabase.rpc('admin_module_stats', { p_since: since }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else setRows(((data ?? []) as Stat[]).map(r => ({ ...r, courses: Number(r.courses), pages: Number(r.pages), students: Number(r.students), with_file: Number(r.with_file) })))
    })
  }, [days])

  const years = useMemo(() => [...new Set((rows ?? []).map(r => r.promotion))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })), [rows])

  const shown = useMemo(() => {
    const list = (rows ?? []).filter(r => !year || r.promotion === year)
    return [...list].sort((a, b) => (sort === 'module' ? a.module.localeCompare(b.module, 'fr') : b[sort] - a[sort]))
  }, [rows, year, sort])

  if (err) return <Notice tone="bad">{/admin_module_stats/.test(err) ? "Le tableau par module n'existe pas encore : exécute le fichier supabase/ops/a_executer_maintenant.sql dans Supabase (SQL Editor)." : `Impossible de lire les modules : ${err}`}</Notice>
  if (!rows) return <Loading />

  const max = Math.max(1, ...shown.map(r => r.courses))
  const total = shown.reduce((a, r) => a + r.courses, 0)
  const top = shown[0]
  const distinctModules = new Set(shown.map(r => r.module.toLowerCase())).size

  const th = (k: Sort, label: string) => (
    <th><button className={`ms-sort${sort === k ? ' on' : ''}`} onClick={() => setSort(k)}>{label}{sort === k ? ' ↓' : ''}</button></th>
  )

  return (
    <div>
      <KpiRow>
        <Kpi label="Modules" value={fmt(distinctModules)} sub={`${fmt(total)} cours`} />
        <Kpi label="Module le plus déposé" value={top ? top.module : '—'} sub={top ? `${top.promotion} · ${fmt(top.courses)} cours` : undefined} />
        <Kpi label="Élèves actifs" value={fmt(shown.reduce((a, r) => a + r.students, 0))} sub="somme par année et module" />
      </KpiRow>

      <div className="bk-bar">
        <select className="ad-select" value={year} onChange={e => setYear(e.target.value)} aria-label="Année d'étude">
          <option value="">Toutes les années</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {([[0, 'Tout'], [30, '30 jours'], [90, '90 jours']] as const).map(([d, l]) => (
          <button key={d} className={`fp${days === d ? ' on' : ''}`} onClick={() => setDays(d)}>{l}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card"><p className="ad-empty">Aucun cours sur cette période.</p></div>
      ) : (
        <>
          <div className="card ms-tbl" style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Année</th>{th('module', 'Module')}{th('courses', 'Cours')}{th('pages', 'Pages')}{th('students', 'Élèves')}</tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={`${r.promotion}|${r.module}`} className="ms-row" onClick={() => onOpen(r.promotion, r.module)}>
                    <td>{r.promotion}</td>
                    <td><strong>{r.module}</strong></td>
                    <td style={{ minWidth: 160 }}>
                      <div className="ms-bar"><span style={{ width: `${(r.courses / max) * 100}%` }} /></div>
                      {fmt(r.courses)}
                    </td>
                    <td>{fmt(r.pages)}</td>
                    <td>{fmt(r.students)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ms-cards">
            {shown.map(r => (
              <button key={`${r.promotion}|${r.module}`} className="card ms-card" onClick={() => onOpen(r.promotion, r.module)}>
                <span className="ms-card-top"><strong>{r.module}</strong><span className="badge bg-gy">{r.promotion}</span></span>
                <span className="ms-bar"><span style={{ width: `${(r.courses / max) * 100}%` }} /></span>
                <span className="ad-mut">{fmt(r.courses)} cours · {fmt(r.pages)} pages · {fmt(r.students)} élèves</span>
              </button>
            ))}
          </div>
          <p className="ad-mut" style={{ margin: '10px 2px' }}>Touche une ligne pour voir les cours. Les noms de module sont regroupés sans tenir compte des majuscules.</p>
        </>
      )}
    </div>
  )
}
