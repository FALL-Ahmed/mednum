import { useEffect, useState } from 'react'
import { Bars, Funnel, HBars, Lines } from '../components/charts'
import { Grid, Kpi, KpiRow, PageHead, Panel } from '../components/ui'
import { dayShort, fmt, loadFinance, pct, type FinanceData } from '../lib/admin'
import type { PageProps } from '../lib/derive'

export default function Growth({ ov, days }: PageProps) {
  const t = ov.totals
  const [fin, setFin] = useState<FinanceData | null>(null)
  useEffect(() => {
    loadFinance(days).then(setFin).catch(() => setFin(null))
  }, [days])
  const labels = ov.daily.map(x => dayShort(x.day))
  const signups = ov.daily.map(x => Number(x.signups))
  const cumulative: number[] = []
  let acc = t.students - signups.reduce((a, b) => a + b, 0)
  for (const n of signups) cumulative.push((acc += n))
  const avg = signups.reduce((a, b) => a + b, 0) / Math.max(1, signups.length)

  return (
    <div>
      <PageHead title="Croissance" sub={`Arrivées d'élèves et passage au payant · ${days} derniers jours`} />
      <KpiRow>
        <Kpi label="Inscrits aujourd'hui" value={fmt(t.students_today)} />
        <Kpi label={`Inscrits sur ${days} jours`} value={fmt(t.students_period)} sub={`${fmt(avg, 1)} par jour en moyenne`} />
        <Kpi label="Conversion en payant" value={pct(t.paying_now, t.students)} sub={`${fmt(t.paying_now)} abonnés sur ${fmt(t.students)} inscrits`} tone={t.paying_now > 0 ? 'good' : undefined} />
        <Kpi label="Ont déjà payé" value={fmt(t.ever_paid)} sub="au moins un paiement confirmé" />
      </KpiRow>

      <Grid>
        <Panel title="Inscriptions par jour">
          <Bars labels={labels} series={[{ name: 'Inscriptions', color: '#07A997', values: signups }]} />
        </Panel>
        <Panel title="Nombre total d'élèves">
          <Lines labels={labels} series={[{ name: 'Élèves', color: '#0B1E34', values: cumulative }]} />
        </Panel>
      </Grid>

      <Panel title="Parcours des élèves" sub="Où les élèves s'arrêtent entre l'inscription et l'abonnement">
        <Funnel
          steps={[
            { label: 'Inscrits', value: t.students },
            { label: 'Ont ajouté un cours', value: t.users_with_docs },
            { label: 'Ont utilisé l\'IA au moins une fois', value: Math.min(t.students, Math.max(t.active_7d, t.users_with_docs)) },
            { label: 'Abonnés payants', value: t.paying_now },
          ]}
        />
      </Panel>

      {fin && (
        <Panel title="Les élèves reviennent-ils ?" sub="Part des élèves qui réutilisent Axone après leur inscription (seuls les élèves inscrits depuis assez longtemps sont comptés)">
          <HBars
            color="#0B1E34"
            rows={([['Le lendemain', fin.retention.d1], ['Dans la première semaine', fin.retention.d7], ['Un mois plus tard', fin.retention.d30]] as const).map(([label, r]) => ({
              label,
              value: r.n > 0 ? (r.ok / r.n) * 100 : 0,
              sub: r.n > 0 ? `${pct(r.ok, r.n)} · ${fmt(r.ok)} sur ${fmt(r.n)}` : 'pas encore assez de recul',
            }))}
          />
        </Panel>
      )}

      <Grid>
        <Panel title="D'où viennent les élèves">
          <HBars rows={t.countries.map(c => ({ label: c.country, value: Number(c.n) }))} />
        </Panel>
        <Panel title="Niveaux d'étude">
          <HBars color="#058A7B" rows={t.promotions.map(p => ({ label: p.promotion, value: Number(p.n) }))} />
        </Panel>
      </Grid>
    </div>
  )
}
