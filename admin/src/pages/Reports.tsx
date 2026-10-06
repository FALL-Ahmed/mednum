import { useCallback, useEffect, useState } from 'react'
import { Kpi, KpiRow, Loading, Notice, PageHead } from '../components/ui'
import { dateTime, fmt } from '../lib/admin'
import { supabase } from '../lib/supabase'

const KIND: Record<string, string> = { case: 'Cas clinique', fiche: 'Fiche', flashcard: 'Flashcard', qcm: 'QCM' }
const STATUS: Record<string, string> = { new: 'Nouveau', reviewed: 'Vu', fixed: 'Corrigé', dismissed: 'Ignoré' }

type Row = { id: string; kind: string; item_ref: string; message: string; status: string; created_at: string; snapshot: any }

function Snapshot({ kind, s }: { kind: string; s: any }) {
  const L = (t: string) => <div className="ad-snap-l">{t}</div>
  if (kind === 'case')
    return (
      <div className="ad-snap">
        <strong>{s?.title}</strong>
        <div>{s?.context}</div>
        {(s?.stages ?? []).map((st: any, i: number) => (
          <div key={i}>{L(`Étape ${i + 1} · ${st.label}`)}{st.reveal}<div className="ad-mut">{st.prompt}</div></div>
        ))}
        {L('Diagnostic')}{s?.diagnosis}
        {s?.differentials && <>{L('Diagnostics différentiels')}{s.differentials}</>}
        {L('Raisonnement')}{s?.reasoning}
        {L('Conduite à tenir')}{s?.management}
        {Array.isArray(s?.source_quotes) && s.source_quotes.length > 0 && <>{L('Extraits du cours cités')}{s.source_quotes.map((q: string, i: number) => <div key={i}>« {q} »</div>)}</>}
      </div>
    )
  if (kind === 'qcm')
    return (
      <div className="ad-snap">
        <strong>{s?.question}</strong>
        {['A', 'B', 'C', 'D', 'E'].map(k => (
          <div key={k} style={{ marginTop: 6 }}>
            <strong>{k}.</strong> {s?.propositions?.[k]} {s?.bonnesReponses?.includes(k) ? '✓' : ''}
            <div className="ad-mut">{s?.explication?.[k]}</div>
          </div>
        ))}
      </div>
    )
  if (kind === 'flashcard') return <div className="ad-snap">{L('Recto')}{s?.front}{L('Verso')}{s?.back}{s?.chapter && <>{L('Chapitre')}{s.chapter}</>}</div>
  return <div className="ad-snap" style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{String(s?.fiche ?? '').slice(0, 6000)}</div>
}

export default function Reports() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'new' | 'done' | 'all'>('new')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(() => {
    supabase.from('content_reports').select('*').order('created_at', { ascending: false }).limit(500)
      .then(({ data, error }) => (error ? setErr(error.message) : setRows((data ?? []) as Row[])))
  }, [])
  useEffect(load, [load])

  async function setStatus(id: string, status: string) {
    setRows(rs => (rs ?? []).map(r => (r.id === id ? { ...r, status } : r)))
    const { error } = await supabase.from('content_reports').update({ status }).eq('id', id)
    if (error) { setErr(error.message); load() }
  }

  if (err && !rows) return <div><PageHead title="Signalements" /><Notice tone="bad">Impossible de lire les signalements : {err}. Vérifie que la table content_reports existe (migration 20260930080000) et que ton compte est dans admin_users.</Notice></div>
  if (!rows) return <div><PageHead title="Signalements" /><Loading /></div>

  const nNew = rows.filter(r => r.status === 'new').length
  const shown = rows.filter(r => (filter === 'all' ? true : filter === 'new' ? r.status === 'new' : r.status !== 'new'))
  return (
    <div>
      <PageHead title="Signalements" sub="Erreurs signalées par les élèves sur les fiches, QCM, flashcards et cas cliniques" />
      {err && <Notice tone="bad">{err}</Notice>}
      <KpiRow cols={3}>
        <Kpi label="À traiter" value={fmt(nNew)} tone={nNew > 0 ? 'warn' : undefined} />
        <Kpi label="Corrigés" value={fmt(rows.filter(r => r.status === 'fixed').length)} tone="good" />
        <Kpi label="Total reçus" value={fmt(rows.length)} />
      </KpiRow>
      <div className="tbl-bar">
        <div style={{ display: 'flex', gap: 6 }}>
          {([['new', `À traiter (${nNew})`], ['done', 'Traités'], ['all', 'Tous']] as const).map(([k, l]) => (
            <button key={k} className={`fp${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="card ad-empty-card">Aucun signalement dans cette liste.</div>
      ) : (
        <div className="card">
          {shown.map((r, i) => (
            <div key={r.id} className="ad-rep" style={{ borderBottom: i < shown.length - 1 ? '1px solid var(--bdr2)' : 'none' }}>
              <div className="ad-rep-h">
                <span className="badge bg-rd">{KIND[r.kind] ?? r.kind}</span>
                {r.item_ref && <span className="ad-mut">{r.item_ref}</span>}
                <span className="ad-mut">{dateTime(r.created_at)}</span>
                <strong style={{ marginLeft: 'auto', fontSize: 12 }}>{STATUS[r.status] ?? r.status}</strong>
              </div>
              <p className="ad-rep-m">{r.message}</p>
              <div className="ad-rep-a">
                <button className="btn-s" onClick={() => setOpen(o => (o === r.id ? null : r.id))}>{open === r.id ? 'Masquer le contenu' : 'Voir le contenu signalé'}</button>
                {r.status !== 'reviewed' && <button className="btn-s" onClick={() => setStatus(r.id, 'reviewed')}>Marquer vu</button>}
                {r.status !== 'fixed' && <button className="btn-p" onClick={() => setStatus(r.id, 'fixed')}>Corrigé</button>}
                {r.status !== 'dismissed' && <button className="btn-s" onClick={() => setStatus(r.id, 'dismissed')}>Ignorer</button>}
                {r.status !== 'new' && <button className="btn-s" onClick={() => setStatus(r.id, 'new')}>Rouvrir</button>}
              </div>
              {open === r.id && <Snapshot kind={r.kind} s={r.snapshot} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
