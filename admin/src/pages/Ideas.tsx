import { useCallback, useEffect, useMemo, useState } from 'react'
import { Kpi, KpiRow, Loading, Notice, PageHead } from '../components/ui'
import { dateTime, fmt } from '../lib/admin'
import { supabase } from '../lib/supabase'

type Row = { id: string; created_at: string; user_id: string; email: string | null; message: string; status: string }

const STATUS: Record<string, string> = { new: 'Nouveau', planned: 'Prévu', done: 'Fait', dismissed: 'Archivé' }
const STATUS_CLS: Record<string, string> = { new: 'bg-yl', planned: 'bg-bl', done: 'bg-gr', dismissed: 'bg-gy' }

type Filter = 'new' | 'all'

/** Messages privés envoyés par les étudiants : on voit qui l'a écrit, son e-mail, et on répond par e-mail. */
export default function Ideas() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('new')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('suggestions').select('id,created_at,user_id,email,message,status').order('created_at', { ascending: false }).limit(300)
    if (error) { setErr(error.message); return }
    const list = (data ?? []) as Row[]
    setErr(null)
    setRows(list)
    const ids = [...new Set(list.map(r => r.user_id))]
    if (ids.length) {
      const { data: st } = await supabase.from('students').select('user_id,name').in('user_id', ids)
      setNames(Object.fromEntries((st ?? []).map(s => [s.user_id as string, s.name as string])))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (rows ?? []).filter(r => (filter === 'new' ? r.status === 'new' : true)), [rows, filter])

  async function setStatus(r: Row, status: string) {
    setBusy(r.id)
    const { error } = await supabase.from('suggestions').update({ status, updated_at: new Date().toISOString() }).eq('id', r.id)
    setBusy(null)
    if (error) setErr(error.message)
    else load()
  }

  async function remove(r: Row) {
    if (!window.confirm('Supprimer ce message définitivement ?')) return
    await supabase.from('suggestions').delete().eq('id', r.id)
    load()
  }

  if (err && !rows) return <div><PageHead title="Messages" /><Notice tone="bad">{/suggestions|email/.test(err) ? "La messagerie n'existe pas encore : exécute le fichier supabase/ops/a_executer_maintenant.sql dans Supabase (SQL Editor)." : err}</Notice></div>
  if (!rows) return <div><PageHead title="Messages" /><Loading /></div>

  const nNew = rows.filter(r => r.status === 'new').length
  const reply = (r: Row) => {
    const first = (names[r.user_id] ?? '').split(' ')[0]
    const subject = encodeURIComponent('Ton message à Axone')
    const body = encodeURIComponent(`Bonjour${first ? ' ' + first : ''},\n\nMerci pour ton message :\n« ${r.message.slice(0, 300)}${r.message.length > 300 ? '…' : ''} »\n\n`)
    return `mailto:${r.email}?subject=${subject}&body=${body}`
  }

  return (
    <div>
      <PageHead title="Messages des étudiants" sub="Les lettres privées envoyées depuis l'application : ce qu'ils veulent qu'on ajoute, change ou corrige. Réponds-leur par e-mail." />
      {err && <Notice tone="bad">{err}</Notice>}
      <KpiRow cols={3}>
        <Kpi label="Nouveaux" value={fmt(nNew)} tone={nNew > 0 ? 'warn' : undefined} />
        <Kpi label="Faits" value={fmt(rows.filter(r => r.status === 'done').length)} tone="good" />
        <Kpi label="Total reçus" value={fmt(rows.length)} />
      </KpiRow>

      <div className="tbl-bar">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['new', 'Nouveaux'], ['all', 'Tous']] as const).map(([k, l]) => (
            <button key={k} className={`fp${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <span className="ad-mut" style={{ marginLeft: 'auto' }}>{shown.length} message{shown.length > 1 ? 's' : ''}</span>
      </div>

      {shown.length === 0 ? (
        <div className="card"><p className="ad-empty">{filter === 'new' ? 'Aucun nouveau message.' : 'Aucun message.'}</p></div>
      ) : (
        <div className="id-list">
          {shown.map(r => (
            <div key={r.id} className="id-card">
              <div className="id-top">
                <strong>{names[r.user_id] ?? 'Étudiant'}</strong>
                {r.email ? <a href={`mailto:${r.email}`} className="ad-link">{r.email}</a> : <span className="ad-mut">e-mail inconnu</span>}
                <span className="ad-mut">· {dateTime(r.created_at)}</span>
                <span className={`badge ${STATUS_CLS[r.status] ?? 'bg-gy'}`} style={{ marginLeft: 'auto' }}>{STATUS[r.status] ?? r.status}</span>
              </div>
              <p className="id-msg">{r.message}</p>
              <div className="id-act">
                {r.email && <a className="btn-p blue" href={reply(r)}>Répondre par e-mail</a>}
                <button className="btn-s" disabled={busy === r.id} onClick={() => setStatus(r, 'planned')}>Prévu</button>
                <button className="btn-s" disabled={busy === r.id} onClick={() => setStatus(r, 'done')}>Fait</button>
                {r.status !== 'new' && <button className="btn-g" disabled={busy === r.id} onClick={() => setStatus(r, 'new')}>Remettre en nouveau</button>}
                <button className="btn-g" style={{ marginLeft: 'auto' }} onClick={() => remove(r)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
