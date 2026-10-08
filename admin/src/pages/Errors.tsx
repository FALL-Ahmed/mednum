import { useCallback, useEffect, useMemo, useState } from 'react'
import { Kpi, KpiRow, Loading, Notice, PageHead, Panel } from '../components/ui'
import { dateTime, fmt } from '../lib/admin'
import { supabase } from '../lib/supabase'

type Row = { id: string; created_at: string; user_id: string | null; kind: string; message: string; stack: string | null; url: string | null; user_agent: string | null; context: Record<string, unknown> | null }

const KIND: Record<string, string> = { window: 'Page', promise: 'Action échouée', render: 'Affichage', ai: "Génération (IA)", bank: 'Banque de cours' }
const device = (ua: string | null) => (!ua ? '—' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows|Macintosh|Linux/.test(ua) ? 'Ordinateur' : 'Autre')

export default function Errors() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)

  const load = useCallback(async () => {
    // Les erreurs de plus de 90 jours sont supprimées (durée de conservation limitée)
    await supabase.from('client_errors').delete().lt('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
    const { data, error } = await supabase.from('client_errors').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) setErr(error.message)
    else { setErr(null); setRows((data ?? []) as Row[]) }
  }, [])
  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; kind: string; message: string; n: number; users: Set<string>; last: string; sample: Row }>()
    for (const r of rows ?? []) {
      const key = `${r.kind}|${r.message}`
      const g = m.get(key) ?? { key, kind: r.kind, message: r.message, n: 0, users: new Set<string>(), last: r.created_at, sample: r }
      g.n++
      if (r.user_id) g.users.add(r.user_id)
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => +new Date(b.last) - +new Date(a.last))
  }, [rows])

  async function clearAll() {
    if (!armed) { setArmed(true); window.setTimeout(() => setArmed(false), 4000); return }
    setArmed(false)
    await supabase.from('client_errors').delete().gte('created_at', '2000-01-01')
    load()
  }

  if (err) return <div><PageHead title="Erreurs" /><Notice tone="bad">{/client_errors/.test(err) ? "La table des erreurs n'existe pas encore : exécute le fichier supabase/ops/a_executer_maintenant.sql dans Supabase (SQL Editor)." : err}</Notice></div>
  if (!rows) return <div><PageHead title="Erreurs" /><Loading /></div>

  const day = rows.filter(r => Date.now() - +new Date(r.created_at) < 86400000)
  const students = new Set(day.map(r => r.user_id).filter(Boolean)).size

  return (
    <div>
      <PageHead title="Erreurs" sub="Ce qui a planté chez les étudiants : à corriger en premier ce qui revient le plus souvent." />
      <KpiRow>
        <Kpi label="Erreurs sur 24 h" value={fmt(day.length)} tone={day.length > 0 ? 'warn' : 'good'} sub={day.length === 0 ? 'rien à signaler' : undefined} />
        <Kpi label="Étudiants touchés (24 h)" value={fmt(students)} />
        <Kpi label="Problèmes différents" value={fmt(groups.length)} sub="sur 90 jours" />
        <Kpi label="Total enregistré" value={fmt(rows.length)} />
      </KpiRow>

      <Panel
        title="Problèmes rencontrés"
        sub="Regroupés par message, du plus récent au plus ancien. Un clic affiche les détails."
        action={rows.length > 0 ? <button className="btn-s" onClick={clearAll}>{armed ? 'Confirmer : tout vider' : 'Tout vider'}</button> : undefined}
      >
        {groups.length === 0 ? (
          <p className="ad-empty">Aucune erreur. Tout va bien.</p>
        ) : (
          <div className="er-list">
            {groups.map(g => (
              <div key={g.key} className="er-item">
                <button className="er-head" onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={open === g.key}>
                  <span className="er-n">{g.n}×</span>
                  <span className="er-msg">
                    <strong>{g.message}</strong>
                    <small>{KIND[g.kind] ?? g.kind} · {g.users.size > 0 ? `${g.users.size} étudiant${g.users.size > 1 ? 's' : ''}` : 'visiteur'} · dernière : {dateTime(g.last)}</small>
                  </span>
                </button>
                {open === g.key && (
                  <div className="er-body">
                    <div className="ad-mut">Page : {g.sample.url ?? '—'} · Appareil : {device(g.sample.user_agent)}</div>
                    {g.sample.context && <div className="ad-mut">Détails : {JSON.stringify(g.sample.context)}</div>}
                    {g.sample.stack && <pre>{g.sample.stack}</pre>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
