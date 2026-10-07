import { useCallback, useEffect, useMemo, useState } from 'react'
import { Kpi, KpiRow, Loading, Notice, PageHead, Panel } from '../components/ui'
import { fmt } from '../lib/admin'
import { loadOffers, type Offers } from '../lib/offers'
import { supabase } from '../lib/supabase'

type Promo = {
  id: string; name: string; label: string; discount_percent: number
  plans: string[]; durations: string[]; countries: string[]
  starts_at: string; ends_at: string; active: boolean; created_at: string
  /** Prix promo arrondis à la main : clé « offre:pays:durée » → prix final. Vide = calcul automatique. */
  price_overrides?: Record<string, number> | null
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
  const [overrides, setOverrides] = useState<Record<string, string>>({})

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
  // Changer le pourcentage repart du calcul automatique : les prix arrondis à la main ne seraient plus à jour.
  const changePct = (v: string) => { setPct(v); setOverrides({}) }

  function quick(days: number) {
    const s = new Date(start)
    setEnd(toLocalInput(new Date((isNaN(+s) ? Date.now() : +s) + days * 86400000)))
  }

  // Aperçu : prix de base → prix avec promotion, pour chaque pays et durée choisis
  const preview = useMemo(() => {
    if (!offers || !(percent >= 1 && percent <= 90)) return []
    const out: { key: string; plan: string; country: string; duration: string; base: number; auto: number; cur: string }[] = []
    for (const pl of PLANS.filter(x => plans.includes(x.id))) {
      for (const c of COUNTRIES.filter(x => countries.includes(x.id))) {
        for (const d of DURATIONS.filter(x => durations.includes(x.id))) {
          const pr = offers.prices[pl.id as 'standard' | 'premium']?.[c.cur]
          const base = pr ? (d.id === 'yearly' ? pr.yearly : pr.monthly) : 0
          if (base > 0) out.push({ key: `${pl.id}:${c.id}:${d.id}`, plan: pl.label, country: c.label, duration: d.label, base, auto: Math.round((base * (100 - percent)) / 100), cur: CUR_LABEL[c.cur] })
        }
      }
    }
    return out
  }, [offers, percent, plans, durations, countries])

  // Seuls les prix modifiés à la main sont enregistrés ; ils doivent être entiers, > 0 et ≤ au prix normal.
  const finalOverrides = useMemo(() => {
    const out: Record<string, number> = {}
    let ok = true
    for (const r of preview) {
      const raw = overrides[r.key]
      if (raw === undefined || raw === String(r.auto)) continue
      const v = Number(raw)
      if (!raw || !Number.isInteger(v) || v < 1 || v > r.base) ok = false
      else out[r.key] = v
    }
    return { out, ok }
  }, [preview, overrides])

  const valid = name.trim().length > 0 && Number.isInteger(percent) && percent >= 1 && percent <= 90 && plans.length > 0 && durations.length > 0 && countries.length > 0 && +new Date(end) > +new Date(start) && finalOverrides.ok

  async function create() {
    if (!valid || busy) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('price_promotions').insert({
      name: name.trim(), label: label.trim(), discount_percent: percent, plans, durations, countries, price_overrides: finalOverrides.out,
      starts_at: fromLocalInput(start), ends_at: fromLocalInput(end), active: true,
    })
    setBusy(false)
    if (error) setMsg({ ok: false, text: /price_overrides/.test(error.message) ? "Il manque une colonne pour les prix arrondis : exécute le fichier 20261011000000_promo_price_overrides.sql dans Supabase (éditeur SQL)." : /price_promotions/.test(error.message) ? "La table des promotions n'existe pas encore : exécute d'abord le fichier 20261010000000_promotions.sql dans Supabase (éditeur SQL), puis 20261011000000_promo_price_overrides.sql." : error.message })
    else {
      setMsg({ ok: true, text: 'Promotion enregistrée. Elle commence à la date choisie et s\'arrête toute seule à la fin.' })
      setName('')
      setLabel('')
      setOverrides({})
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
    <button key={text} type="button" className={`fp${on ? ' on' : ''}`} onClick={click} aria-pressed={on}>{text}</button>
  )

  const days = Math.round((+new Date(end) - +new Date(start)) / 86400000)
  const byCountry = COUNTRIES.filter(c => countries.includes(c.id)).map(c => ({
    c,
    plans: PLANS.filter(pl => plans.includes(pl.id)).map(pl => ({
      pl,
      cells: DURATIONS.filter(d => durations.includes(d.id)).map(d => preview.find(r => r.key === `${pl.id}:${c.id}:${d.id}`)),
    })),
  }))
  const adjusted = preview.filter(r => overrides[r.key] !== undefined && overrides[r.key] !== String(r.auto)).length

  return (
    <div>
      <PageHead title="Promotions" sub="Lance une réduction sur les prix, avec une date de fin : elle s'arrête toute seule. Le prix barré apparaît sur le site, dans l'application et au paiement." />
      <KpiRow>
        <Kpi label="En cours" value={fmt(running)} tone={running > 0 ? 'good' : undefined} sub="réduction active maintenant" />
        <Kpi label="Programmées" value={fmt(planned)} sub="commencent plus tard" />
        <Kpi label="Terminées" value={fmt(over)} sub="arrêtées automatiquement" />
        <Kpi label="Total créées" value={fmt(rows.length)} sub="depuis le début" />
      </KpiRow>

      <div className="pm-layout">
        <Panel title="Nouvelle promotion" sub="Une seule réduction s'applique à la fois : si plusieurs se recoupent, la plus forte gagne (elles ne se cumulent pas).">
          <div className="pm-step">
            <h3><span className="pm-num">1</span>Réduction</h3>
            <div className="pm-pct">
              <label className="pm-pct-box">
                <input inputMode="numeric" aria-label="Pourcentage de réduction" value={pct} onChange={e => changePct(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                <b>%</b>
              </label>
              <div className="pm-quick">
                {[10, 20, 30, 50].map(v => <button key={v} type="button" className="btn-s" onClick={() => changePct(String(v))}>−{v} %</button>)}
              </div>
            </div>
            <div className="pm-fields">
              <label className="pm-field"><span>Nom <small>(interne, pour toi)</small></span><input className="ad-input" value={name} onChange={e => setName(e.target.value)} placeholder="ex : Offre de rentrée" maxLength={80} /></label>
              <label className="pm-field"><span>Texte affiché aux étudiants <small>(facultatif)</small></span><input className="ad-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex : Offre de rentrée" maxLength={60} /></label>
            </div>
          </div>

          <div className="pm-step">
            <h3><span className="pm-num">2</span>Sur quoi</h3>
            <div className="pm-scope">
              <div><span className="pm-lbl">Offres</span><div className="pm-chips">{PLANS.map(p => chip(plans.includes(p.id), p.label, () => toggle(plans, setPlans, p.id)))}</div></div>
              <div><span className="pm-lbl">Durées</span><div className="pm-chips">{DURATIONS.map(d => chip(durations.includes(d.id), d.label, () => toggle(durations, setDurations, d.id)))}</div></div>
              <div><span className="pm-lbl">Pays</span><div className="pm-chips">{COUNTRIES.map(c => chip(countries.includes(c.id), c.label, () => toggle(countries, setCountries, c.id)))}</div></div>
            </div>
          </div>

          <div className="pm-step">
            <h3><span className="pm-num">3</span>Quand</h3>
            <div className="pm-dates">
              <label className="pm-field"><span>Début</span><input className="ad-input" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
              <label className="pm-field"><span>Fin <small>(s&apos;arrête toute seule)</small></span><input className="ad-input" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
            </div>
            <div className="pm-quick">
              <span className="ad-mut" style={{ alignSelf: 'center' }}>Durée rapide :</span>
              {[3, 7, 14, 30].map(d => <button key={d} type="button" className="btn-s" onClick={() => quick(d)}>{d} jours</button>)}
            </div>
          </div>
        </Panel>

        <div className="pm-side">
          <Panel title="Aperçu" sub="Ce que verront les étudiants. Tu peux modifier chaque prix promo pour arrondir.">
            <div className="pm-sum">
              <div className="pm-sum-pct">−{percent >= 1 && percent <= 90 ? percent : '?'} %</div>
              <div className="pm-sum-t">
                <b>{name.trim() || 'Sans nom'}</b><br />
                {+new Date(end) > +new Date(start) ? <>du {dateFr(start)}<br />au {dateFr(end)} · {days} jour{days > 1 ? 's' : ''}</> : 'La fin doit être après le début'}
              </div>
            </div>
            {preview.length === 0 ? (
              <p className="pm-empty">Choisis au moins une offre, une durée et un pays pour voir les prix.</p>
            ) : byCountry.map(({ c, plans: ps }) => (
              <div key={c.id} className="pm-country">
                <h4>{c.label}</h4>
                {ps.map(({ pl, cells }) => (
                  <div key={pl.id} className="pm-row" style={{ gridTemplateColumns: `84px repeat(${Math.max(cells.length, 1)}, minmax(0, 1fr))` }}>
                    <span>{pl.label}</span>
                    {cells.map((r, i) => r ? (
                      <span key={i} className="pm-price">
                        <i>{r.duration}</i>
                        <small>{fmt(r.base)} {r.cur}</small>
                        <span className="pm-pin">
                          <input
                            inputMode="numeric"
                            aria-label={`Prix promo ${pl.label} ${r.country} ${r.duration}`}
                            value={overrides[r.key] ?? String(r.auto)}
                            onChange={e => setOverrides(o => ({ ...o, [r.key]: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                          />
                          <em>{r.cur}</em>
                        </span>
                      </span>
                    ) : <span key={i} className="ad-mut">—</span>)}
                  </div>
                ))}
              </div>
            ))}
            {adjusted > 0 && (
              <p className="pm-hint">{adjusted} prix arrondi{adjusted > 1 ? 's' : ''} à la main. <button type="button" className="btn-g" onClick={() => setOverrides({})}>Tout remettre au calcul automatique</button></p>
            )}
            {msg && <div className={`ad-note ${msg.ok ? '' : 'bad'}`} style={{ margin: '12px 0 0' }}>{msg.text}</div>}
            <div className="pm-act">
              <button className="btn-p blue" disabled={!valid || busy} onClick={create}>{busy ? 'Enregistrement…' : 'Lancer la promotion'}</button>
              {!valid && <p>Il manque : un nom, une réduction de 1 à 90 %, au moins une offre, une durée et un pays, des prix valides, et une fin après le début.</p>}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Toutes les promotions" sub="Le statut se met à jour tout seul : une promotion terminée n'a plus aucun effet sur les prix.">
        {rows.length === 0 ? (
          <p className="pm-empty">Aucune promotion pour le moment.</p>
        ) : (
          <div className="pm-list">
            {rows.map(r => {
              const st = statusOf(r, now)
              const live = st.label === 'En cours'
              const nAdj = Object.keys(r.price_overrides ?? {}).length
              return (
                <div key={r.id} className={`pm-item${live ? ' live' : ''}`}>
                  <div className="pm-item-pct">−{r.discount_percent} %</div>
                  <div>
                    <div className="pm-item-name">{r.name}<span className={`badge ${st.cls}`}>{st.label}</span>{live && <span className="ad-mut">{remaining(r, now)}</span>}</div>
                    <div className="pm-item-meta">
                      {r.label && r.label !== r.name && <>« {r.label} » · </>}
                      {r.plans.map(p => PLANS.find(x => x.id === p)?.label ?? p).join(', ')} · {r.durations.map(d => DURATIONS.find(x => x.id === d)?.label ?? d).join(', ')} · {r.countries.map(c => COUNTRIES.find(x => x.id === c)?.label ?? c).join(', ')}
                      {nAdj > 0 && <> · {nAdj} prix arrondi{nAdj > 1 ? 's' : ''}</>}
                      <br />{dateFr(r.starts_at)} → {dateFr(r.ends_at)}
                    </div>
                  </div>
                  <div className="pm-item-acts">
                    {st.label !== 'Terminée' && <button className="btn-s" onClick={() => act(r.id, r.active ? 'suspend' : 'resume')}>{r.active ? 'Suspendre' : 'Réactiver'}</button>}
                    {live && <button className="btn-s" onClick={() => act(r.id, 'end')}>{armed === `end:${r.id}` ? 'Confirmer la fin' : 'Terminer maintenant'}</button>}
                    <button className="btn-s" onClick={() => act(r.id, 'delete')}>{armed === `delete:${r.id}` ? 'Confirmer' : 'Supprimer'}</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
