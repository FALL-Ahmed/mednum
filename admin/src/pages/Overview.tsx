import { Bars, HBars, Lines } from '../components/charts'
import { Grid, Kpi, KpiRow, Notice, PageHead, Panel } from '../components/ui'
import { dayShort, fmt, fmtMru, pct } from '../lib/admin'
import { derive, type PageProps } from '../lib/derive'

export default function Overview({ ov, settings, days, go, reportsNew }: PageProps) {
  const d = derive(ov, settings)
  const t = ov.totals
  const labels = ov.daily.map(x => dayShort(x.day))
  return (
    <div>
      <PageHead title="Vue d'ensemble" sub={`Les ${days} derniers jours · tous les montants sont convertis en ouguiyas (MRU)`} />

      {(t.pending > 0 || reportsNew > 0) && (
        <div className="ad-alerts">
          {t.pending > 0 && (
            <button className="ad-alert warn" onClick={() => go('payments')}>
              <strong>{t.pending}</strong> paiement{t.pending > 1 ? 's' : ''} à valider →
            </button>
          )}
          {reportsNew > 0 && (
            <button className="ad-alert bad" onClick={() => go('reports')}>
              <strong>{reportsNew}</strong> erreur{reportsNew > 1 ? 's' : ''} signalée{reportsNew > 1 ? 's' : ''} à traiter →
            </button>
          )}
        </div>
      )}

      <KpiRow>
        <Kpi label="Élèves inscrits" value={fmt(t.students)} sub={`+${fmt(t.students_today)} aujourd'hui · +${fmt(t.students_period)} sur ${days} j`} />
        <Kpi label="Actifs aujourd'hui" value={fmt(t.active_today)} sub={`${fmt(t.active_7d)} sur les 7 derniers jours`} />
        <Kpi label="Abonnés payants" value={fmt(t.paying_now)} sub={`${fmt(t.paying_standard)} Standard · ${fmt(t.paying_premium)} Premium`} tone={t.paying_now > 0 ? 'good' : undefined} />
        <Kpi label="Conversion gratuit → payant" value={pct(t.paying_now, t.students)} sub={`${fmt(d.free)} élèves en offre gratuite`} />
      </KpiRow>
      <KpiRow>
        <Kpi label="Revenu mensuel récurrent" value={fmtMru(d.mrrMru)} sub="abonnements en cours, ramenés au mois" />
        <Kpi label={`Chiffre d'affaires (${days} j)`} value={fmtMru(d.revenuePeriod)} sub={`${fmtMru(d.revenueTotalMru)} depuis le début`} />
        <Kpi label={`Coût de l'IA (${days} j)`} value={fmtMru(d.costPeriod)} sub={`≈ ${fmt(d.costUsdPeriod, 2)} $ · ${fmt(d.totalCalls)} appels`} />
        <Kpi label="Marge" value={fmtMru(d.margin)} tone={d.margin >= 0 ? 'good' : 'bad'} sub={d.revenuePeriod > 0 ? `${pct(d.margin, d.revenuePeriod)} du chiffre d'affaires` : 'aucun revenu sur la période'} />
      </KpiRow>

      <Grid>
        <Panel title="Nouveaux élèves par jour">
          <Bars labels={labels} series={[{ name: 'Inscriptions', color: '#07A997', values: ov.daily.map(x => Number(x.signups)) }]} />
        </Panel>
        <Panel title="Élèves actifs par jour" sub="Élèves qui ont utilisé l'IA ce jour-là">
          <Lines labels={labels} series={[{ name: 'Actifs', color: '#0B1E34', values: d.periodActiveDays.map(Number) }]} />
        </Panel>
      </Grid>

      <Panel title="Chiffre d'affaires et coût de l'IA par jour" sub="En ouguiyas (MRU)">
        <Bars
          labels={labels}
          unit="MRU"
          series={[
            { name: "Chiffre d'affaires", color: '#07A997', values: d.revByDay },
            { name: "Coût de l'IA", color: '#F59E0B', values: d.costByDay },
          ]}
        />
      </Panel>

      <Grid cols={3}>
        <Panel title="Gratuit et payant">
          <HBars
            color="#0B1E34"
            rows={[
              { label: 'Gratuit', value: d.free },
              { label: 'Standard', value: t.paying_standard },
              { label: 'Premium', value: t.paying_premium },
            ]}
          />
        </Panel>
        <Panel title="Pays">
          <HBars rows={t.countries.map(c => ({ label: c.country, value: Number(c.n) }))} />
        </Panel>
        <Panel title="Niveaux d'étude">
          <HBars color="#058A7B" rows={t.promotions.map(p => ({ label: p.promotion, value: Number(p.n) }))} />
        </Panel>
      </Grid>

      {t.students === 0 && <Notice>Aucun élève inscrit pour l'instant. Les chiffres apparaîtront dès les premières inscriptions.</Notice>}
    </div>
  )
}
