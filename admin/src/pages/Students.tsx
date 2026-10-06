import { useEffect, useMemo, useState } from 'react'
import { Icons } from '../components/icons'
import { Kpi, KpiRow, Loading, Notice, PageHead, PlanBadge } from '../components/ui'
import { dateTime, fmt } from '../lib/admin'
import { supabase } from '../lib/supabase'

type Row = {
  user_id: string; name: string; email: string | null; country: string | null; promotion: string | null; school: string | null
  created_at: string; plan: string; plan_expires: string | null; documents: number
  last_active: string | null; questions_total: number; qcm_total: number; content_total: number
}

const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000) : null)

export default function Students() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [plan, setPlan] = useState<'all' | 'free' | 'paid' | 'idle'>('all')
  const [sort, setSort] = useState<'recent' | 'active' | 'usage'>('recent')

  useEffect(() => {
    supabase.rpc('admin_students', { p_limit: 1000 }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else setRows((data ?? []) as Row[])
    })
  }, [])

  const shown = useMemo(() => {
    let r = rows ?? []
    const s = q.trim().toLowerCase()
    if (s) r = r.filter(x => `${x.name} ${x.email ?? ''} ${x.country ?? ''} ${x.promotion ?? ''} ${x.school ?? ''}`.toLowerCase().includes(s))
    if (plan === 'free') r = r.filter(x => x.plan === 'freemium' || x.plan === 'trial')
    if (plan === 'paid') r = r.filter(x => x.plan === 'standard' || x.plan === 'premium')
    if (plan === 'idle') r = r.filter(x => (daysAgo(x.last_active) ?? 999) >= 7)
    return [...r].sort((a, b) =>
      sort === 'recent'
        ? +new Date(b.created_at) - +new Date(a.created_at)
        : sort === 'active'
          ? (b.last_active ?? '').localeCompare(a.last_active ?? '')
          : Number(b.questions_total) + Number(b.qcm_total) + Number(b.content_total) - (Number(a.questions_total) + Number(a.qcm_total) + Number(a.content_total)),
    )
  }, [rows, q, plan, sort])

  if (err) return <div><PageHead title="Élèves" /><Notice tone="bad">Impossible de lire les élèves : {err}. Vérifie que la migration « admin_analytics » est appliquée et que ton compte est dans admin_users.</Notice></div>
  if (!rows) return <div><PageHead title="Élèves" /><Loading /></div>

  const paid = rows.filter(x => x.plan === 'standard' || x.plan === 'premium').length
  const idle = rows.filter(x => (daysAgo(x.last_active) ?? 999) >= 7).length

  return (
    <div>
      <PageHead title="Élèves" sub="Tous les comptes inscrits, leur offre et ce qu'ils utilisent" />
      <KpiRow>
        <Kpi label="Élèves" value={fmt(rows.length)} />
        <Kpi label="Offre gratuite" value={fmt(rows.length - paid)} />
        <Kpi label="Abonnés payants" value={fmt(paid)} tone={paid > 0 ? 'good' : undefined} />
        <Kpi label="Inactifs depuis 7 jours" value={fmt(idle)} sub="ou jamais actifs" tone={idle > 0 ? 'warn' : undefined} />
      </KpiRow>

      <div className="tbl-bar">
        <div className="sbar">
          <span className="sbar-ic"><Icons.Search /></span>
          <input className="sinp" value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, email, pays, niveau…" />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['all', 'Tous'], ['free', 'Gratuits'], ['paid', 'Abonnés'], ['idle', 'Inactifs']] as const).map(([k, l]) => (
            <button key={k} className={`fp${plan === k ? ' on' : ''}`} onClick={() => setPlan(k)}>{l}</button>
          ))}
        </div>
        <select className="ad-select" value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Trier">
          <option value="recent">Plus récents</option>
          <option value="active">Dernière activité</option>
          <option value="usage">Plus gros usage</option>
        </select>
        <span className="ad-mut" style={{ marginLeft: 'auto' }}>{shown.length} résultat{shown.length > 1 ? 's' : ''}</span>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="dt">
          <thead>
            <tr><th>Élève</th><th>Pays · niveau</th><th>Offre</th><th>Inscrit</th><th>Dernière activité</th><th>Cours</th><th>Questions</th><th>QCM</th><th>Contenus</th></tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const ago = daysAgo(r.last_active)
              return (
                <tr key={r.user_id}>
                  <td><strong>{r.name}</strong><div className="ad-mut">{r.email ?? 'compte sans email'}</div></td>
                  <td>{r.country ?? '—'}<div className="ad-mut">{[r.promotion, r.school].filter(Boolean).join(' · ') || '—'}</div></td>
                  <td><PlanBadge plan={r.plan} />{r.plan_expires && <div className="ad-mut">jusqu'au {new Date(r.plan_expires).toLocaleDateString('fr-FR')}</div>}</td>
                  <td>{dateTime(r.created_at)}</td>
                  <td>{ago === null ? <span className="ad-mut">jamais</span> : ago === 0 ? "aujourd'hui" : `il y a ${ago} j`}</td>
                  <td>{fmt(Number(r.documents))}</td>
                  <td>{fmt(Number(r.questions_total))}</td>
                  <td>{fmt(Number(r.qcm_total))}</td>
                  <td>{fmt(Number(r.content_total))}</td>
                </tr>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={9} className="ad-empty">Aucun élève ne correspond.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
