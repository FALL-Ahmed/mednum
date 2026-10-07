import { useEffect, useMemo, useState } from 'react'
import { Bars, HBars, Lines } from '../components/charts'
import { Grid, Kpi, KpiRow, Loading, Notice, PageHead, Panel } from '../components/ui'
import {
  costUsd, curLabel, dayShort, fmt, fmtMru, fromMru, KIND_LABEL, loadFinance, MODELS, pct, toMru, type FinanceData, type Settings,
} from '../lib/admin'
import { derive, type PageProps } from '../lib/derive'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const PLAN: Record<string, string> = { freemium: 'Gratuit', trial: 'Gratuit', standard: 'Standard', premium: 'Premium' }
const planKey = (p: string) => (p === 'trial' ? 'freemium' : p)

function feeRate(ov: PageProps['ov'], s: Settings): number {
  // Frais moyens pondérés par les montants réellement encaissés par moyen de paiement
  let total = 0
  let fees = 0
  for (const r of ov.totals.by_method) {
    const mru = toMru(Number(r.amount), r.currency, s)
    const pctFee = r.provider === 'paydunya' ? s.feePaydunyaPct : r.provider === 'kitpay' ? s.feeKitpayPct : s.feeManualPct
    total += mru
    fees += (mru * pctFee) / 100
  }
  return total > 0 ? fees / total : 0
}

export default function Finance({ ov, settings, days }: PageProps) {
  const [fin, setFin] = useState<FinanceData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setFin(null)
    loadFinance(days).then(setFin).catch(e => setErr(e.message))
  }, [days])

  const d = derive(ov, settings)
  const t = ov.totals
  const labels = ov.daily.map(x => dayShort(x.day))

  const calc = useMemo(() => {
    if (!fin) return null
    const usdMru = settings.usdMru
    const costOf = (r: { model: string; input_tokens: number; output_tokens: number }) =>
      costUsd(r.model, Number(r.input_tokens), Number(r.output_tokens), settings) * usdMru

    // Coût de l'IA par offre
    const byPlan = new Map<string, { calls: number; cost: number }>()
    for (const r of fin.cost_by_plan) {
      const k = planKey(r.plan)
      const cur = byPlan.get(k) ?? { calls: 0, cost: 0 }
      cur.calls += Number(r.calls)
      cur.cost += costOf(r)
      byPlan.set(k, cur)
    }
    const students = new Map<string, { n: number; active: number }>()
    for (const r of fin.plan_students) {
      const k = planKey(r.plan)
      const cur = students.get(k) ?? { n: 0, active: 0 }
      cur.n += Number(r.n)
      cur.active += Number(r.active_n)
      students.set(k, cur)
    }
    const mrrPlan = new Map<string, number>()
    for (const r of fin.mrr_by_plan) mrrPlan.set(r.plan, (mrrPlan.get(r.plan) ?? 0) + toMru(Number(r.amount), r.currency, settings))

    const perMonth = 30 / Math.max(1, days)
    const mrrDaily = ov.daily.map(x => sum(fin.mrr_daily.filter(m => m.day === x.day).map(m => toMru(Number(m.amount), m.currency, settings))))
    const fixedMonthly = settings.fixedInfraMru + settings.fixedOtherMru
    const fixedPeriod = fixedMonthly * (days / 30)
    const fee = feeRate(ov, settings)
    const feesPeriod = d.revenuePeriod * fee
    const net = d.revenuePeriod - feesPeriod - d.costPeriod - fixedPeriod
    const payers = Math.max(1, t.paying_now)
    const arpu = t.paying_now > 0 ? d.mrrMru / t.paying_now : 0
    const freeCost = byPlan.get('freemium')?.cost ?? 0
    const aiMonthly = d.costPeriod * perMonth
    const feeMonthly = (d.mrrMru * fee)
    const costPerActive = (k: string) => {
      const s = students.get(k)
      const c = byPlan.get(k)
      return s && c && s.active > 0 ? (c.cost * perMonth) / s.active : 0
    }
    const arpuNet = arpu * (1 - fee) - (t.paying_now > 0 ? ((byPlan.get('standard')?.cost ?? 0) + (byPlan.get('premium')?.cost ?? 0)) * perMonth / payers : 0)
    const needed = arpuNet > 0 ? Math.ceil((fixedMonthly + (freeCost * perMonth)) / arpuNet) : null
    const renewalRate = fin.subscribers.ever > 0 ? fin.subscribers.renewed / fin.subscribers.ever : 0
    // Durée de vie moyenne estimée : 1 / (1 - taux de renouvellement), plafonnée à 24 mois
    const lifetimeMonths = renewalRate > 0 && renewalRate < 1 ? Math.min(24, 1 / (1 - renewalRate)) : 1
    return {
      byPlan, students, mrrPlan, mrrDaily, fixedMonthly, fixedPeriod, fee, feesPeriod, net, arpu, freeCost, aiMonthly,
      feeMonthly, costPerActive, arpuNet, needed, renewalRate, lifetimeMonths, perMonth,
      freeShare: d.costPeriod > 0 ? freeCost / d.costPeriod : 0,
      monthlyNet: d.mrrMru - feeMonthly - aiMonthly - fixedMonthly,
    }
  }, [fin, settings, days, ov, d.costPeriod, d.mrrMru, d.revenuePeriod, t.paying_now])

  const modelName = (id: string) => MODELS.find(m => id.startsWith(m.id) || m.id.startsWith(id))?.label ?? id

  /* Simulateur */
  const [sim, setSim] = useState({ free: '', std: '', prem: '' })
  const simVals = {
    free: Number(sim.free || (calc ? calc.students.get('freemium')?.active ?? 0 : 0)),
    std: Number(sim.std || t.paying_standard),
    prem: Number(sim.prem || t.paying_premium),
  }

  if (err) return <div><PageHead title="Finances" /><Notice tone="bad">Impossible de lire les analyses financières : {err}. Lance la migration « admin_finance » (2 blocs) dans l'éditeur SQL de Supabase.</Notice></div>
  if (!fin || !calc) return <div><PageHead title="Finances" /><Loading /></div>

  const priceOf = (plan: 'standard' | 'premium') => {
    const row = fin.mrr_by_plan.find(r => r.plan === plan)
    return row && Number(row.n) > 0 ? toMru(Number(row.amount), row.currency, settings) / Number(row.n) : plan === 'standard' ? 800 : 1500
  }
  const simRevenue = simVals.std * priceOf('standard') + simVals.prem * priceOf('premium')
  const simCost =
    simVals.free * calc.costPerActive('freemium') + simVals.std * calc.costPerActive('standard') + simVals.prem * calc.costPerActive('premium')
  const simFees = simRevenue * calc.fee
  const simNet = simRevenue - simFees - simCost - calc.fixedMonthly

  const waterfall: { label: string; value: number; color: string; sign: '+' | '−' | '=' }[] = [
    { label: "Chiffre d'affaires encaissé", value: d.revenuePeriod, color: '#07A997', sign: '+' },
    { label: 'Frais de paiement', value: calc.feesPeriod, color: '#8A99AB', sign: '−' },
    { label: "Coût de l'IA", value: d.costPeriod, color: '#F59E0B', sign: '−' },
    { label: `Charges fixes (${days} j)`, value: calc.fixedPeriod, color: '#6F869D', sign: '−' },
  ]
  const wmax = Math.max(1, d.revenuePeriod, d.costPeriod + calc.feesPeriod + calc.fixedPeriod)

  return (
    <div>
      <PageHead title="Finances" sub={`Résultat, rentabilité et coût de l'IA · ${days} derniers jours · montants convertis dans la devise choisie en haut à droite`} />

      <KpiRow>
        <Kpi label={`Bénéfice net (${days} j)`} value={fmtMru(calc.net)} tone={calc.net >= 0 ? 'good' : 'bad'} sub={d.revenuePeriod > 0 ? `${pct(calc.net, d.revenuePeriod)} du chiffre d'affaires` : 'aucun encaissement sur la période'} />
        <Kpi label="Revenu mensuel récurrent" value={fmtMru(d.mrrMru)} sub={`soit ${fmtMru(d.mrrMru * 12)} par an · ${fmt(t.paying_now)} abonnés`} />
        <Kpi label="Bénéfice mensuel projeté" value={fmtMru(calc.monthlyNet)} tone={calc.monthlyNet >= 0 ? 'good' : 'bad'} sub="au rythme actuel : revenu − frais − IA − charges fixes" />
        <Kpi label="Seuil de rentabilité" value={calc.needed === null ? '—' : `${fmt(calc.needed)} abonnés`} sub="pour couvrir les charges fixes et le coût des élèves gratuits" />
      </KpiRow>

      <Grid>
        <Panel title="Compte de résultat" sub={`Du ${dayShort(ov.daily[0]?.day ?? '')} à aujourd'hui`}>
          <div className="wf">
            {waterfall.map(r => (
              <div key={r.label} className="wf-row">
                <span className="wf-s">{r.sign}</span>
                <div className="wf-m">
                  <div className="wf-t"><span>{r.label}</span><strong>{fmtMru(r.value)}</strong></div>
                  <div className="hb-track"><div className="hb-fill" style={{ width: `${(r.value / wmax) * 100}%`, background: r.color }} /></div>
                </div>
              </div>
            ))}
            <div className={`wf-total ${calc.net >= 0 ? 'good' : 'bad'}`}>
              <span>= Bénéfice net</span>
              <strong>{fmtMru(calc.net)}</strong>
            </div>
          </div>
          {calc.fee === 0 && <p className="ad-mut" style={{ marginTop: 10 }}>Frais de paiement à 0 % : renseigne-les dans Paramètres → Frais et charges pour un résultat réaliste.</p>}
        </Panel>
        <Panel title="Revenu mensuel récurrent dans le temps" sub="Abonnements en vigueur chaque jour, ramenés au mois">
          <Lines labels={labels} series={[{ name: 'Revenu mensuel récurrent', color: '#07A997', values: calc.mrrDaily.map(fromMru) }]} />
        </Panel>
      </Grid>

      <Panel title="Chiffre d'affaires, coût de l'IA et solde par jour" sub="Vert : encaissé · Orange : coût de l'IA · Bleu : solde du jour">
        <Bars
          labels={labels}
          unit={curLabel()}
          series={[
            { name: 'Encaissé', color: '#07A997', values: d.revByDay.map(fromMru) },
            { name: "Coût de l'IA", color: '#F59E0B', values: d.costByDay.map(fromMru) },
            { name: 'Solde', color: '#0B1E34', values: d.revByDay.map((v, i) => fromMru(v - d.costByDay[i])) },
          ]}
        />
      </Panel>

      <h2 className="ad-h2">Rentabilité de chaque offre</h2>
      <KpiRow>
        <Kpi label="Revenu moyen par abonné" value={calc.arpu > 0 ? fmtMru(calc.arpu) : '—'} sub="par mois, avant frais" />
        <Kpi label="Gain net par abonné" value={calc.arpuNet !== 0 ? fmtMru(calc.arpuNet) : '—'} tone={calc.arpuNet > 0 ? 'good' : calc.arpuNet < 0 ? 'bad' : undefined} sub="par mois, après frais et coût de son IA" />
        <Kpi label="Part du coût de l'IA pour les gratuits" value={d.costPeriod > 0 ? pct(calc.freeCost, d.costPeriod) : '—'} tone={calc.freeShare > 0.7 ? 'warn' : undefined} sub={`${fmtMru(calc.freeCost * calc.perMonth)} par mois pour attirer des abonnés`} />
        <Kpi label="Valeur estimée d'un abonné" value={calc.arpuNet > 0 ? fmtMru(calc.arpuNet * calc.lifetimeMonths) : '—'} sub={`gain net × ${fmt(calc.lifetimeMonths, 1)} mois de vie estimée`} />
      </KpiRow>
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table className="dt">
          <thead>
            <tr><th>Offre</th><th>Élèves</th><th>Actifs ({days} j)</th><th>Appels IA</th><th>Coût IA</th><th>Coût / actif / mois</th><th>Revenu mensuel</th><th>Marge mensuelle</th></tr>
          </thead>
          <tbody>
            {(['freemium', 'standard', 'premium'] as const).map(k => {
              const s = calc.students.get(k) ?? { n: 0, active: 0 }
              const c = calc.byPlan.get(k) ?? { calls: 0, cost: 0 }
              const rev = calc.mrrPlan.get(k) ?? 0
              const margin = rev * (1 - calc.fee) - c.cost * calc.perMonth
              return (
                <tr key={k}>
                  <td><strong>{PLAN[k]}</strong></td>
                  <td>{fmt(s.n)}</td>
                  <td>{fmt(s.active)}</td>
                  <td>{fmt(c.calls)}</td>
                  <td>{fmtMru(c.cost)}</td>
                  <td>{fmtMru(calc.costPerActive(k))}</td>
                  <td>{k === 'freemium' ? '—' : fmtMru(rev)}</td>
                  <td><strong style={{ color: margin >= 0 ? 'var(--accent-d)' : '#B91C1C' }}>{fmtMru(margin)}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Grid>
        <Panel title="Simulateur" sub="Que se passe-t-il avec d'autres effectifs ? Les coûts par élève sont ceux mesurés sur la période.">
          <div className="sim">
            {([
              ['free', 'Élèves gratuits actifs', simVals.free],
              ['std', 'Abonnés Standard', simVals.std],
              ['prem', 'Abonnés Premium', simVals.prem],
            ] as const).map(([k, label, v]) => (
              <label key={k} className="sim-row">
                <span>{label}</span>
                <input className="ad-input" inputMode="numeric" value={sim[k]} placeholder={String(v)} onChange={e => setSim(s => ({ ...s, [k]: e.target.value.replace(/[^\d]/g, '') }))} />
              </label>
            ))}
          </div>
          <table className="dt" style={{ marginTop: 14 }}>
            <tbody>
              <tr><td>Revenu par mois</td><td style={{ textAlign: 'right' }}>{fmtMru(simRevenue)}</td></tr>
              <tr><td>− Frais de paiement</td><td style={{ textAlign: 'right' }}>{fmtMru(simFees)}</td></tr>
              <tr><td>− Coût de l'IA</td><td style={{ textAlign: 'right' }}>{fmtMru(simCost)}</td></tr>
              <tr><td>− Charges fixes</td><td style={{ textAlign: 'right' }}>{fmtMru(calc.fixedMonthly)}</td></tr>
              <tr><td><strong>= Bénéfice mensuel</strong></td><td style={{ textAlign: 'right' }}><strong style={{ color: simNet >= 0 ? 'var(--accent-d)' : '#B91C1C' }}>{fmtMru(simNet)}</strong></td></tr>
            </tbody>
          </table>
        </Panel>
        <Panel title="Fidélité des abonnés" sub="Combien reviennent et combien partent">
          <table className="dt">
            <tbody>
              <tr><td>Ont déjà payé</td><td style={{ textAlign: 'right' }}>{fmt(fin.subscribers.ever)}</td></tr>
              <tr><td>Ont renouvelé au moins une fois</td><td style={{ textAlign: 'right' }}>{fmt(fin.subscribers.renewed)} · {pct(fin.subscribers.renewed, fin.subscribers.ever)}</td></tr>
              <tr><td>À renouveler dans les 7 jours</td><td style={{ textAlign: 'right' }}>{fmt(fin.subscribers.due_7d)}</td></tr>
              <tr><td>Abonnement terminé sans renouvellement (30 j)</td><td style={{ textAlign: 'right' }}>{fmt(fin.subscribers.lapsed_30d)}</td></tr>
              <tr><td>Délai entre l'inscription et le 1er paiement</td><td style={{ textAlign: 'right' }}>{fin.days_to_pay === null ? '—' : `${fmt(Number(fin.days_to_pay), 1)} jours`}</td></tr>
              <tr><td>Élèves encore actifs 7 jours après l'inscription</td><td style={{ textAlign: 'right' }}>{pct(fin.retention.d7.ok, fin.retention.d7.n)}</td></tr>
            </tbody>
          </table>
        </Panel>
      </Grid>

      <Grid>
        <Panel title="Coût de l'IA par modèle" sub="Tarifs vérifiés, réglables dans Paramètres">
          <table className="dt">
            <thead><tr><th>Modèle</th><th>Appels</th><th>Tokens (entrée / sortie)</th><th>Coût</th></tr></thead>
            <tbody>
              {[...d.byModel.entries()].sort((a, b) => b[1].usd - a[1].usd).map(([m, v]) => (
                <tr key={m}>
                  <td>{modelName(m)}</td><td>{fmt(v.calls)}</td><td>{fmt(v.input)} / {fmt(v.output)}</td>
                  <td><strong>{fmt(v.usd, 2)} $</strong> <span className="ad-mut">({fmtMru(v.usd * settings.usdMru)})</span></td>
                </tr>
              ))}
              {d.byModel.size === 0 && <tr><td colSpan={4} className="ad-empty">Aucun appel à l'IA sur la période.</td></tr>}
            </tbody>
          </table>
        </Panel>
        <Panel title="Ce qui coûte le plus cher" sub="Part du coût par type d'usage">
          <HBars
            color="#F59E0B"
            rows={[...d.byKind.entries()].sort((a, b) => b[1].usd - a[1].usd).map(([k, v]) => ({ label: KIND_LABEL[k] ?? k, value: v.usd, sub: `${fmt(v.usd, 2)} $ · ${fmt(v.calls)} appels` }))}
          />
        </Panel>
      </Grid>

      <Panel title="Les élèves qui coûtent le plus" sub="Pour repérer un usage excessif, surtout parmi les comptes gratuits">
        <table className="dt">
          <thead><tr><th>Élève</th><th>Offre</th><th>Appels</th><th>Coût sur la période</th></tr></thead>
          <tbody>
            {Object.values(
              fin.top_costly.reduce<Record<string, { name: string; plan: string; calls: number; cost: number }>>((acc, r) => {
                const k = `${r.name}|${r.plan}`
                const c = acc[k] ?? { name: r.name, plan: r.plan, calls: 0, cost: 0 }
                c.calls += Number(r.calls)
                c.cost += costUsd(r.model, Number(r.input_tokens), Number(r.output_tokens), settings) * settings.usdMru
                acc[k] = c
                return acc
              }, {}),
            ).sort((a, b) => b.cost - a.cost).slice(0, 10).map(r => (
              <tr key={r.name + r.plan}>
                <td><strong>{r.name}</strong></td>
                <td>{PLAN[r.plan] ?? r.plan}</td>
                <td>{fmt(r.calls)}</td>
                <td><strong>{fmtMru(r.cost)}</strong></td>
              </tr>
            ))}
            {fin.top_costly.length === 0 && <tr><td colSpan={4} className="ad-empty">Pas encore d'usage.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Grid cols={3}>
        <Panel title="Revenus par offre" sub="Depuis le début">
          <HBars
            color="#0B1E34"
            rows={Object.entries(
              fin.revenue_by_plan.reduce<Record<string, number>>((a, r) => {
                const k = `${PLAN[r.plan] ?? r.plan} · ${r.duration === 'yearly' ? 'annuel' : 'mensuel'}`
                a[k] = (a[k] ?? 0) + toMru(Number(r.amount), r.currency, settings)
                return a
              }, {}),
            ).map(([label, value]) => ({ label, value, sub: fmtMru(value) }))}
          />
        </Panel>
        <Panel title="Revenus par pays" sub="Depuis le début">
          <HBars
            rows={Object.entries(
              fin.revenue_by_country.reduce<Record<string, number>>((a, r) => {
                a[r.country] = (a[r.country] ?? 0) + toMru(Number(r.amount), r.currency, settings)
                return a
              }, {}),
            ).map(([label, value]) => ({ label, value, sub: fmtMru(value) }))}
          />
        </Panel>
        <Panel title="Revenus par moyen de paiement" sub="Depuis le début">
          <HBars
            color="#058A7B"
            rows={t.by_method.map(r => ({
              label: r.method === '?' ? r.provider : `${r.method}${r.provider !== 'manual' ? ` (${r.provider})` : ''}`,
              value: toMru(Number(r.amount), r.currency, settings),
              sub: `${fmtMru(toMru(Number(r.amount), r.currency, settings))} · ${fmt(Number(r.n))}`,
            }))}
          />
        </Panel>
      </Grid>

      <Notice tone="warn">
        <strong>Ce que ces chiffres incluent, et ce qu'ils n'incluent pas.</strong> Le coût de l&apos;IA vient des tokens réellement consommés par la discussion, les QCM, les fiches, les flashcards et les cas cliniques, multipliés par les tarifs du fournisseur. La transcription vocale et la lecture des PDF scannés ne sont comptées que pour les appels faits après leur mise à jour. Les frais de paiement et les charges fixes sont ceux que tu renseignes dans Paramètres. Les devises sont converties avec tes taux : c&apos;est une estimation de gestion, pas une comptabilité.
      </Notice>
    </div>
  )
}
