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

const PAGE = 50
const DAYS = [{ d: 7, l: '7 jours' }, { d: 30, l: '1 mois' }, { d: 90, l: '3 mois' }, { d: 365, l: '1 an' }]

const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000) : null)

export default function Students() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [plan, setPlan] = useState<'all' | 'free' | 'paid' | 'idle'>('all')
  const [sort, setSort] = useState<'recent' | 'active' | 'usage'>('recent')
  const [page, setPage] = useState(0)
  // Changement d'offre : élève en cours d'édition, offre et durée choisies
  const [editing, setEditing] = useState<Row | null>(null)
  const [newPlan, setNewPlan] = useState<'freemium' | 'standard' | 'premium'>('standard')
  const [newDays, setNewDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => {
    supabase.rpc('admin_students', { p_limit: 2000 }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else setRows((data ?? []) as Row[])
    })
  }
  useEffect(load, [])

  async function applyPlan(r: Row) {
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('admin_set_plan', { p_user_id: r.user_id, p_plan: newPlan, p_days: newDays })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: /admin_set_plan/.test(error.message) ? "La fonction n'existe pas encore : exécute le fichier 20261014000000_admin_set_plan.sql dans Supabase (éditeur SQL)." : error.message })
      return
    }
    const what = newPlan === 'freemium' ? 'Gratuit' : `${newPlan === 'premium' ? 'Premium' : 'Standard'} offert pour ${DAYS.find(x => x.d === newDays)?.l ?? `${newDays} jours`}`
    setMsg({ ok: true, text: `Offre de ${r.name} changée : ${what}.` })
    setEditing(null)
    load()
  }

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

  // Retour à la première page quand la recherche, le filtre ou le tri change
  useEffect(() => setPage(0), [q, plan, sort])
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const visible = shown.slice(cur * PAGE, cur * PAGE + PAGE)

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

      {msg && <Notice tone={msg.ok ? 'info' : 'bad'}>{msg.text}</Notice>}
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
            <tr><th>Élève</th><th>Pays · niveau</th><th>Offre</th><th>Inscrit</th><th>Dernière activité</th><th>Cours</th><th>Questions</th><th>QCM</th><th>Contenus</th><th /></tr>
          </thead>
          <tbody>
            {visible.map(r => {
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
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-s" onClick={() => { setEditing(r); setNewPlan(r.plan === 'premium' ? 'premium' : 'standard'); setNewDays(30); setMsg(null) }}>Changer l&apos;offre</button>
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={10} className="ad-empty">Aucun élève ne correspond.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="md-scrim" onClick={() => !busy && setEditing(null)}>
          <div className="md" role="dialog" aria-modal="true" aria-label="Changer l'offre" onClick={e => e.stopPropagation()}>
            <h3>Changer l&apos;offre</h3>
            <p className="ad-mut">{editing.name}{editing.email ? ` · ${editing.email}` : ''}</p>
            <div className="md-cur">Offre actuelle : <PlanBadge plan={editing.plan} />{editing.plan_expires && <span className="ad-mut"> jusqu&apos;au {new Date(editing.plan_expires).toLocaleDateString('fr-FR')}</span>}</div>

            <span className="md-lbl">Nouvelle offre</span>
            <div className="md-opts">
              {([['freemium', 'Gratuit'], ['standard', 'Standard'], ['premium', 'Premium']] as const).map(([k, l]) => (
                <button key={k} type="button" className={`fp${newPlan === k ? ' on' : ''}`} onClick={() => setNewPlan(k)} aria-pressed={newPlan === k}>{l}</button>
              ))}
            </div>

            {newPlan !== 'freemium' && (
              <>
                <span className="md-lbl">Durée offerte</span>
                <div className="md-opts">
                  {DAYS.map(x => <button key={x.d} type="button" className={`fp${newDays === x.d ? ' on' : ''}`} onClick={() => setNewDays(x.d)} aria-pressed={newDays === x.d}>{x.l}</button>)}
                </div>
              </>
            )}

            <p className="md-note">{newPlan === 'freemium' ? "L'abonnement en cours s'arrête tout de suite : l'élève repasse en Gratuit." : 'Offert par toi : aucun revenu n\'est comptabilisé. L\'abonnement en cours est remplacé.'}</p>
            <div className="md-act">
              <button className="btn-s" disabled={busy} onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn-p blue" disabled={busy} onClick={() => applyPlan(editing)}>{busy ? 'Enregistrement…' : 'Appliquer'}</button>
            </div>
          </div>
        </div>
      )}

      {shown.length > PAGE && (
        <div className="pg">
          <button className="btn-s" disabled={cur === 0} onClick={() => setPage(cur - 1)}>← Précédent</button>
          <span className="ad-mut">Page {cur + 1} sur {pages} · {cur * PAGE + 1}–{Math.min(shown.length, cur * PAGE + PAGE)} sur {shown.length}</span>
          <button className="btn-s" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Suivant →</button>
        </div>
      )}
    </div>
  )
}
