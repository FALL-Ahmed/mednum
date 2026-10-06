import { costUsd, toMru, type Overview, type Settings } from './admin'

export type Page =
  | 'overview' | 'growth' | 'finance'
  | 'students' | 'payments' | 'activity'
  | 'documents' | 'reports'
  | 'settings'

export type PageProps = {
  ov: Overview
  settings: Settings
  days: number
  go: (p: Page) => void
  reportsNew: number
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

/** Chiffres dérivés : tout est converti en ouguiyas (MRU) pour pouvoir additionner. */
export function derive(ov: Overview, s: Settings) {
  const days = ov.daily.map(d => d.day)
  const revByDay = days.map(d =>
    sum(ov.revenue_daily.filter(r => r.day === d).map(r => toMru(Number(r.amount), r.currency, s))),
  )
  const costByDay = days.map(d =>
    sum(ov.usage_daily.filter(u => u.day === d).map(u => costUsd(u.model, Number(u.input_tokens), Number(u.output_tokens), s) * s.usdMru)),
  )
  const revenuePeriod = sum(revByDay)
  const costPeriod = sum(costByDay)

  const byModel = new Map<string, { calls: number; input: number; output: number; usd: number }>()
  const byKind = new Map<string, { calls: number; usd: number }>()
  for (const u of ov.usage_daily) {
    const usd = costUsd(u.model, Number(u.input_tokens), Number(u.output_tokens), s)
    const m = byModel.get(u.model) ?? { calls: 0, input: 0, output: 0, usd: 0 }
    m.calls += Number(u.calls); m.input += Number(u.input_tokens); m.output += Number(u.output_tokens); m.usd += usd
    byModel.set(u.model, m)
    const k = byKind.get(u.kind) ?? { calls: 0, usd: 0 }
    k.calls += Number(u.calls); k.usd += usd
    byKind.set(u.kind, k)
  }

  const mrrMru = sum(Object.entries(ov.totals.mrr).map(([c, a]) => toMru(Number(a), c, s)))
  const revenueTotalMru = sum(Object.entries(ov.totals.revenue_total).map(([c, a]) => toMru(Number(a), c, s)))
  const t = ov.totals
  const free = Math.max(0, t.students - t.paying_now)
  const periodActiveDays = ov.daily.map(d => d.active)
  const totalCalls = sum(ov.usage_daily.map(u => Number(u.calls)))

  return {
    days, revByDay, costByDay, revenuePeriod, costPeriod, margin: revenuePeriod - costPeriod,
    byModel, byKind, mrrMru, revenueTotalMru, free, periodActiveDays, totalCalls,
    costUsdPeriod: costPeriod / s.usdMru,
    conversion: t.students > 0 ? t.paying_now / t.students : 0,
  }
}
