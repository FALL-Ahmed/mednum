import { useEffect, useState } from 'react'
import { Bars, HBars, Lines } from '../components/charts'
import { Grid, Kpi, KpiRow, PageHead, Panel } from '../components/ui'
import { dayShort, fmt, KIND_LABEL } from '../lib/admin'
import type { PageProps } from '../lib/derive'
import { supabase } from '../lib/supabase'

type Top = { name: string; questions_total: number; qcm_total: number; content_total: number; documents: number }

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

export default function Activity({ ov, days }: PageProps) {
  const [top, setTop] = useState<Top[]>([])
  useEffect(() => {
    supabase.rpc('admin_students', { p_limit: 1000 }).then(({ data }) => {
      const rows = ((data ?? []) as Top[])
        .map(r => ({ ...r, total: Number(r.questions_total) + Number(r.qcm_total) + Number(r.content_total) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
      setTop(rows)
    })
  }, [])

  const labels = ov.daily.map(x => dayShort(x.day))
  const chat = ov.daily.map(x => Number(x.chat))
  const qcm = ov.daily.map(x => Number(x.qcm))
  const content = ov.daily.map(x => Number(x.content))
  const docs = ov.daily.map(x => Number(x.docs))
  const calls = new Map<string, number>()
  for (const u of ov.usage_daily) calls.set(u.kind, (calls.get(u.kind) ?? 0) + Number(u.calls))

  return (
    <div>
      <PageHead title="Activité" sub={`Ce que font les élèves · ${days} derniers jours`} />
      <KpiRow>
        <Kpi label="Questions posées à Dr. Ahmed" value={fmt(sum(chat))} sub={`${fmt(sum(chat) / Math.max(1, days), 1)} par jour`} />
        <Kpi label="Séries de QCM" value={fmt(sum(qcm))} />
        <Kpi label="Fiches, flashcards, cas cliniques" value={fmt(sum(content))} />
        <Kpi label="Cours ajoutés" value={fmt(sum(docs))} sub={`${fmt(ov.totals.documents)} au total`} />
      </KpiRow>

      <Grid>
        <Panel title="Utilisation par jour">
          <Bars
            labels={labels}
            series={[
              { name: 'Questions', color: '#0B1E34', values: chat },
              { name: 'QCM', color: '#07A997', values: qcm },
              { name: 'Contenus', color: '#F59E0B', values: content },
            ]}
          />
        </Panel>
        <Panel title="Cours ajoutés par jour">
          <Lines labels={labels} series={[{ name: 'Cours', color: '#058A7B', values: docs }]} />
        </Panel>
      </Grid>

      <Grid>
        <Panel title="Appels à l'IA par type" sub="Les appels réellement envoyés au modèle">
          <HBars rows={[...calls.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: KIND_LABEL[k] ?? k, value: v }))} />
        </Panel>
        <Panel title="Les élèves les plus actifs" sub="Questions, QCM et contenus générés depuis le début">
          <table className="dt">
            <thead><tr><th>Élève</th><th>Questions</th><th>QCM</th><th>Contenus</th></tr></thead>
            <tbody>
              {top.map((r, i) => (
                <tr key={i}><td><strong>{r.name}</strong></td><td>{fmt(Number(r.questions_total))}</td><td>{fmt(Number(r.qcm_total))}</td><td>{fmt(Number(r.content_total))}</td></tr>
              ))}
              {top.length === 0 && <tr><td colSpan={4} className="ad-empty">Pas encore d'activité.</td></tr>}
            </tbody>
          </table>
        </Panel>
      </Grid>
    </div>
  )
}
