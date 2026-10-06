import { useCallback, useEffect, useState } from 'react'
import { Kpi, KpiRow, Loading, Notice, PageHead, Panel, PlanBadge } from '../components/ui'
import { dateTime, fmt } from '../lib/admin'
import { supabase } from '../lib/supabase'

type Row = {
  id: string; plan: string; status: string; method: string | null; provider: string; amount: number | null; currency: string
  duration: string | null; reference_code: string | null; receipt_url: string | null
  created_at: string; activated_at: string | null; expires_at: string | null; student_name: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'À valider', cls: 'bg-yl' },
  active: { label: 'Actif', cls: 'bg-gr' },
  rejected: { label: 'Refusé', cls: 'bg-rd' },
  cancelled: { label: 'Annulé', cls: 'bg-gy' },
}

export default function Payments() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null) // deuxième clic pour confirmer
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all')

  const load = useCallback(() => {
    supabase.rpc('admin_payments', { p_limit: 1000 }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else setRows((data ?? []) as Row[])
    })
  }, [])
  useEffect(load, [load])

  async function act(id: string, kind: 'activate' | 'reject') {
    const key = `${kind}:${id}`
    if (armed !== key) {
      setArmed(key)
      window.setTimeout(() => setArmed(a => (a === key ? null : a)), 4000)
      return
    }
    setArmed(null)
    setBusy(id)
    const { error } = await supabase.rpc(kind === 'activate' ? 'activate_subscription' : 'reject_subscription', { p_id: id })
    setBusy(null)
    if (error) setErr(error.message)
    else {
      setErr(null)
      load()
    }
  }

  if (!rows) return <div><PageHead title="Abonnements" />{err ? <Notice tone="bad">Impossible de lire les paiements : {err}</Notice> : <Loading />}</div>

  const pending = rows.filter(r => r.status === 'pending')
  const active = rows.filter(r => r.status === 'active' && (!r.expires_at || new Date(r.expires_at) > new Date()))
  const expiring = active.filter(r => r.expires_at && +new Date(r.expires_at) - Date.now() < 7 * 86400000)
  const shown = rows.filter(r => r.status !== 'pending').filter(r => (filter === 'all' ? true : filter === 'active' ? active.includes(r) : !active.includes(r)))

  return (
    <div>
      <PageHead title="Abonnements et paiements" sub="Valide les paiements par reçu et suis les abonnements en cours" />
      {err && <Notice tone="bad">{err}</Notice>}
      <KpiRow>
        <Kpi label="À valider" value={fmt(pending.length)} tone={pending.length > 0 ? 'warn' : undefined} sub="reçus ou paiements en attente" />
        <Kpi label="Abonnements actifs" value={fmt(active.length)} tone={active.length > 0 ? 'good' : undefined} />
        <Kpi label="Expirent sous 7 jours" value={fmt(expiring.length)} tone={expiring.length > 0 ? 'warn' : undefined} />
        <Kpi label="Total enregistrés" value={fmt(rows.length)} />
      </KpiRow>

      <Panel title="Paiements à valider" sub="Vérifie le reçu et le montant, puis valide : le plan de l'élève s'active tout de suite.">
        {pending.length === 0 ? (
          <p className="ad-empty">Aucun paiement en attente.</p>
        ) : (
          <div className="ad-pay">
            {pending.map(r => (
              <div key={r.id} className="ad-pay-row">
                <div className="ad-pay-main">
                  <div><strong>{r.student_name ?? 'Élève inconnu'}</strong> <PlanBadge plan={r.plan} /> <span className="ad-mut">{r.duration === 'yearly' ? 'annuel' : 'mensuel'}</span></div>
                  <div className="ad-mut">
                    {fmt(Number(r.amount ?? 0))} {r.currency} · {r.method ?? '—'}{r.provider !== 'manual' ? ` (${r.provider}, confirmation automatique en attente)` : ''} · réf. {r.reference_code ?? '—'} · {dateTime(r.created_at)}
                  </div>
                  {r.receipt_url && <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="ad-link">Voir le reçu ↗</a>}
                </div>
                <div className="ad-pay-act">
                  <button className="btn-p" disabled={busy === r.id} onClick={() => act(r.id, 'activate')}>
                    {armed === `activate:${r.id}` ? 'Confirmer la validation' : 'Valider'}
                  </button>
                  <button className="btn-s" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}>
                    {armed === `reject:${r.id}` ? 'Confirmer le refus' : 'Refuser'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="tbl-bar">
        <div style={{ display: 'flex', gap: 6 }}>
          {([['all', 'Tous'], ['active', 'En cours'], ['closed', 'Terminés ou refusés']] as const).map(([k, l]) => (
            <button key={k} className={`fp${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <span className="ad-mut" style={{ marginLeft: 'auto' }}>{shown.length} ligne{shown.length > 1 ? 's' : ''}</span>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="dt">
          <thead><tr><th>Élève</th><th>Offre</th><th>Montant</th><th>Moyen</th><th>Statut</th><th>Activé le</th><th>Expire le</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td><strong>{r.student_name ?? '—'}</strong><div className="ad-mut">réf. {r.reference_code ?? '—'}</div></td>
                <td><PlanBadge plan={r.plan} /></td>
                <td>{fmt(Number(r.amount ?? 0))} {r.currency}</td>
                <td>{r.method ?? '—'}<div className="ad-mut">{r.provider}</div></td>
                <td><span className={`badge ${STATUS[r.status]?.cls ?? 'bg-gy'}`}>{STATUS[r.status]?.label ?? r.status}</span></td>
                <td>{dateTime(r.activated_at)}</td>
                <td>{dateTime(r.expires_at)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={7} className="ad-empty">Rien à afficher.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
