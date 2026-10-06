import { useEffect, useMemo, useState } from 'react'
import { Icons } from '../components/icons'
import { Kpi, KpiRow, Loading, Notice, PageHead } from '../components/ui'
import { dateTime, fmt, pct } from '../lib/admin'
import { supabase } from '../lib/supabase'

type Row = {
  id: string; name: string; pages: number; chars: number; owner_name: string | null; created_at: string
  has_fiche: boolean; has_flashcards: boolean; has_cases: boolean
}

const Tick = ({ on }: { on: boolean }) => (on ? <span className="badge bg-gr">Oui</span> : <span className="ad-mut">—</span>)

export default function Documents() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.rpc('admin_documents', { p_limit: 1000 }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else setRows((data ?? []) as Row[])
    })
  }, [])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? []).filter(r => !s || `${r.name} ${r.owner_name ?? ''}`.toLowerCase().includes(s))
  }, [rows, q])

  if (err) return <div><PageHead title="Cours des élèves" /><Notice tone="bad">Impossible de lire les cours : {err}</Notice></div>
  if (!rows) return <div><PageHead title="Cours des élèves" /><Loading /></div>

  const pages = rows.reduce((a, r) => a + Number(r.pages), 0)
  return (
    <div>
      <PageHead title="Cours des élèves" sub="Les documents que les élèves ont ajoutés, et ce qui en a été généré" />
      <KpiRow>
        <Kpi label="Cours ajoutés" value={fmt(rows.length)} sub={`${fmt(pages)} pages au total`} />
        <Kpi label="Avec une fiche" value={pct(rows.filter(r => r.has_fiche).length, rows.length)} sub={`${fmt(rows.filter(r => r.has_fiche).length)} cours`} />
        <Kpi label="Avec des flashcards" value={pct(rows.filter(r => r.has_flashcards).length, rows.length)} sub={`${fmt(rows.filter(r => r.has_flashcards).length)} cours`} />
        <Kpi label="Avec des cas cliniques" value={pct(rows.filter(r => r.has_cases).length, rows.length)} sub={`${fmt(rows.filter(r => r.has_cases).length)} cours`} />
      </KpiRow>

      <div className="tbl-bar">
        <div className="sbar">
          <span className="sbar-ic"><Icons.Search /></span>
          <input className="sinp" value={q} onChange={e => setQ(e.target.value)} placeholder="Nom du cours ou de l'élève…" />
        </div>
        <span className="ad-mut" style={{ marginLeft: 'auto' }}>{shown.length} cours</span>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="dt">
          <thead><tr><th>Cours</th><th>Élève</th><th>Pages</th><th>Ajouté le</th><th>Fiche</th><th>Flashcards</th><th>Cas cliniques</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong><div className="ad-mut">{fmt(Math.round(Number(r.chars) / 1000))} k caractères</div></td>
                <td>{r.owner_name ?? '—'}</td>
                <td>{fmt(Number(r.pages))}</td>
                <td>{dateTime(r.created_at)}</td>
                <td><Tick on={r.has_fiche} /></td>
                <td><Tick on={r.has_flashcards} /></td>
                <td><Tick on={r.has_cases} /></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={7} className="ad-empty">Aucun cours.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
