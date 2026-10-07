import { useCallback, useEffect, useMemo, useState } from 'react'
import { Kpi, KpiRow, Loading, Notice, PageHead, Panel } from '../components/ui'
import { fmt } from '../lib/admin'
import { loadOffers, type Offers } from '../lib/offers'
import { supabase } from '../lib/supabase'

type Promo = {
  id: string; name: string; label: string; discount_percent: number
  plans: string[]; durations: string[]; countries: string[]
  starts_at: string; ends_at: string; active: boolean; created_at: string
}

const PLANS = [{ id: 'standard', label: 'Standard' }, { id: 'premium', label: 'Premium' }]
const DURATIONS = [{ id: 'monthly', label: 'Mensuel' }, { id: 'yearly', label: 'Annuel' }]
const COUNTRIES = [
  { id: 'mr', label: 'Mauritanie', cur: 'MRU' as const },
  { id: 'sn', label: 'Sénégal', cur: 'XOF' as const },
  { id: 'ma', label: 'Maroc', cur: 'MAD' as const },
]
const CUR_LABEL = { MRU: 'MRU', XOF: 'FCFA', MAD: 'MAD' }

/** Date locale au format attendu par un champ datetime-local. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const fromLocalInput = (s: string) => new Date(s).toISOString()
const dateFr = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function statusOf(p: Promo, now: number): { label: string; cls: string } {
  if (!p.active) return { label: 'Suspendue', cls: 'bg-gy' }
  if (now < +new Date(p.starts_at)) return { label: 'Programmée', cls: 'bg-yl' }
  if (now >= +new Date(p.ends_at)) return { label: 'Terminée', cls: 'bg-gy' }
  return { label: 'En cours', cls: 'bg-gr' }
}

function remaining(p: Promo, now: number): string {
  const ms = +new Date(p.ends_at) - now
  if (ms <= 0) return ''
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return d > 0 ? `reste ${d} j ${h} h` : `reste ${h} h`
}

export default function Promotions() {
  const [rows, setRows] = useState<Promo[] | null>(null)
  const [offers, setOffers] = useState<Offers | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Formulaire
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [pct, setPct] = useState('20')
  const [plans, setPlans] = useState<string[]>(['standard', 'premium'])
  const [durations, setDurations] = useState<string[]>(['monthly', 'yearly'])
  const [countries, setCountries] = useState<string[]>(['mr', 'sn', 'ma'])
  const [start, setStart] = useState(() => toLocalInput(new Date()))
  const [end, setEnd] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86400000)))

  const load = useCallback(() => {
    supabase.from('price_promotions').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else {
        setErr(null)
        setRows((data ?? []) as Promo[])
      }
    })
  }, [])
  useEffect(() => {
    load()
    loadOffers().then(setOffers).catch(() => setOffers(null))
    const t = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(t)
  }, [load])

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  const percent = Number(pct)
  const valid = name.trim().length > 0 && Number.isInteger(percent) && percent >= 1 && percent <= 90 && plans.length > 0 && durations.length > 0 && countries.length > 0 && +new Date(end) > +new Date(start)

  function quick(days: number) {
    const s = new Date(start)
    setEnd(toLocalInput(new Date((isNaN(+s) ? Date.now() : +s) + days * 86400000)))
  }

  // Aperçu : prix de base → prix avec promotion, pour chaque pays et durée choisis
  const preview = useMemo(() => {
    if (!offers || !(percent >= 1 && percent <= 90)) return []
    const out: { plan: string; country: string; duration: string; base: number; final: number; cur: string }[] = []
    for (const pl of PLANS.filter(x => plans.includes(x.id))) {
      for (const c of COUNTRIES.filter(x => countries.includes(x.id))) {
        for (const d of DURATIONS.filter(x => durations.includes(x.id))) {
          const pr = offers.prices[pl.id as 'standard' | 'premium']?.[c.cur]
          const base = pr ? (d.id === 'yearly' ? pr.yearly : pr.monthly) : 0
          if (base > 0) out.push({ plan: pl.label, country: c.label, duration: d.label, base, final: Math.round((base * (100 - percent)) / 100), cur: CUR_LABEL[c.cur] })
        }
      }
    }
    return out
  }, [offers, percent, plans, durations, countries])

  async function create() {
    if (!valid || busy) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('price_promotions').insert({
      name: name.trim(), label: label.trim(), discount_percent: percent, plans, durations, countries,
      starts_at: fromLocalInput(start), ends_at: fromLocalInput(end), active: true,
    })
    setBusy(false)
    if (error) setMsg({ ok: false, text: /price_promotions/.test(error.message) ? "La table des promotions n'existe pas encore : exécute d'abord le bloc SQL des promotions." : error.message })
    else {
      setMsg({ ok: true, text: 'Promotion enregistrée. Elle commence à la date choisie et s\'arrête toute seule à la fin.' })
      setName('')
      setLabel('')
      load()
    }
  }

  async function act(id: string, kind: 'suspend' | 'resume' | 'end' | 'delete') {
    const key = `${kind}:${id}`
    if ((kind === 'delete' || kind === 'end') && armed !== key) {
      setArmed(key)
      window.setTimeout(() => setArmed(a => (a === key ? null : a)), 4000)
      return
    }
    setArmed(null)
    const q = supabase.from('price_promotions')
    const { error } =
      kind === 'delete' ? await q.delete().eq('id', id)
      : kind === 'end' ? await q.update({ ends_at: new Date().toISOString() }).eq('id', id)
      : await q.update({ active: kind === 'resume' }).eq('id', id)
    if (error) setMsg({ ok: false, text: error.message })
    else load()
  }

  if (!rows) return <div><PageHead title="Promotions" />{err ? <Notice tone="bad">Impossible de lire les promotions : {err}. Si la table n&apos;existe pas encore, exécute le bloc SQL des promotions dans Supabase.</Notice> : <Loading />}</div>

  const running = rows.filter(r => statusOf(r, now).label === 'En cours').length
  const planned = rows.filter(r => statusOf(r, now).label === 'Programmée').length
  const over = rows.filter(r => statusOf(r, now).label === 'Terminée').length

  const chip = (on: boolean, text: string, click: () => void) => (
    <button type="button" className={`fp${on ? ' on' : ''}`} onClick={click} aria-pressed={on}>{text}</button>
  )

  return (
    <div>
      <PageHead title="Promotions" sub="Lance une réduction sur les prix, avec une date de fin : elle s'arrête toute seule. Le prix barré apparaît sur le site, dans l'application et au paiement." />
      <KpiRow>
        <Kpi label="En cours" value={fmt(running)} tone={running > 0 ? 'good' : undefined} sub="réduction active maintenant" />
        <Kpi label="Programmées" value={fmt(planned)} sub="commencent plus tard" />
        <Kpi label="Terminées" value={fmt(over)} sub="arrêtées automatiquement" />
        <Kpi label="Total créées" value={fmt(rows.length)} />
      </KpiRow>

      <Panel title="Nouvelle promotion" sub="Une seule réduction s'applique à la fois : si plusieurs se recoupent, la plus forte gagne (elles ne se cumulent pas).">
        <div className="of-grid">
          <div className="of-f"><span>Nom (interne, pour toi)</span><input className="ad-input" value={name} onChange={e => setName(e.target.value)} placeholder="ex : Offre de rentrée" maxLength={80} /></div>
          <div className="of-f"><span>Texte affiché aux étudiants (facultatif)</span><input className="ad-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex : Offre de rentrée" maxLength={60} /></div>
          <div className="of-f">
            <span>Réduction</span>
            <span className="of-in"><input className="ad-input" style={{ maxWidth: 110 }} inputMode="numeric" value={pct} onChange={e => setPct(e.target.value.replace(/\D/g, '').slice(0, 2))} /><em>% (de 1 à 90)</em></span>
          </div>
        </div>

        <div className="of-block">
          <h4>Sur quoi</h4>
          <div className="of-grid">
            <div className="of-f"><span>Offres</span><span className="of-in">{PLANS.map(p => chip(plans.includes(p.id), p.label, () => toggle(plans, setPlans, p.id)))}</span></div>
            <div className="of-f"><span>Durées</span><span className="of-in">{DURATIONS.map(d => chip(durations.includes(d.id), d.label, () => toggle(durations, setDurations, d.id)))}</span></div>
            <div className="of-f"><span>Pays</span><span className="of-in">{COUNTRIES.map(c => chip(countries.includes(c.id), c.label, () => toggle(countries, setCountries, c.id)))}</span></div>
          </div>
        </div>

        <div className="of-block">
          <h4>Quand</h4>
          <div className="of-grid">
            <div className="of-f"><span>Début</span><input className="ad-input" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div className="of-f">
              <span>Fin (la promotion s&apos;arrête toute seule)</span>
              <span className="of-in">
                <input className="ad-input" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
                {[3, 7, 14, 30].map(d => <button key={d} type="button" className="btn-s" onClick={() => quick(d)}>{d} jours</button>)}
              </span>
            </div>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="of-block">
            <h4>Prix pendant la promotion</h4>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt">
                <thead><tr><th>Offre</th><th>Pays</th><th>Durée</th><th>Prix normal</th><th>Prix promo</th></tr></thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}><td>{r.plan}</td><td>{r.country}</td><td>{r.duration}</td><td className="ad-mut" style={{ textDecoration: 'line-through' }}>{fmt(r.base)} {r.cur}</td><td><strong>{fmt(r.final)} {r.cur}</strong></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {msg && <div className={`ad-note ${msg.ok ? '' : 'bad'}`} style={{ margin: '12px 0 0' }}>{msg.text}</div>}
        <div style={{ marginTop: 16 }}>
          <button className="btn-p" disabled={!valid || busy} onClick={create}>{busy ? 'Enregistrement…' : 'Lancer la promotion'}</button>
          {!valid && <span className="ad-mut" style={{ marginLeft: 12 }}>Donne un nom, une réduction de 1 à 90 %, au moins une offre, une durée et un pays, et une fin après le début.</span>}
        </div>
      </Panel>

      <Panel title="Toutes les promotions" sub="Le statut se met à jour tout seul : une promotion terminée n'a plus aucun effet sur les prix.">
        {rows.length === 0 ? (
          <p className="ad-empty">Aucune promotion pour le moment.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Promotion</th><th>Réduction</th><th>Sur</th><th>Période</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {rows.map(r => {
                  const st = statusOf(r, now)
                  const live = st.label === 'En cours'
                  return (
                    <tr key={r.id}>
                      <td><strong>{r.name}</strong>{r.label && r.label !== r.name && <div className="ad-mut">« {r.label} »</div>}</td>
                      <td><strong>−{r.discount_percent} %</strong></td>
                      <td className="ad-mut">
                        {r.plans.map(p => PLANS.find(x => x.id === p)?.label ?? p).join(', ')}<br />
                        {r.durations.map(d => DURATIONS.find(x => x.id === d)?.label ?? d).join(', ')}<br />
                        {r.countries.map(c => COUNTRIES.find(x => x.id === c)?.label ?? c).join(', ')}
                      </td>
                      <td className="ad-mut">{dateFr(r.starts_at)}<br />→ {dateFr(r.ends_at)}{live && <div style={{ color: 'var(--t1)' }}>{remaining(r, now)}</div>}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {st.label !== 'Terminée' && (
                          <button className="btn-s" onClick={() => act(r.id, r.active ? 'suspend' : 'resume')}>{r.active ? 'Suspendre' : 'Réactiver'}</button>
                        )}{' '}
                        {live && <button className="btn-s" onClick={() => act(r.id, 'end')}>{armed === `end:${r.id}` ? 'Confirmer la fin' : 'Terminer maintenant'}</button>}{' '}
                        <button className="btn-s" onClick={() => act(r.id, 'delete')}>{armed === `delete:${r.id}` ? 'Confirmer' : 'Supprimer'}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
