import { supabase } from './supabase'

export type Limits = {
  daily_questions: number
  daily_qcm: number
  daily_contents: number
  max_documents: number | null
  pdf_export: boolean
  history_days: number | null
}
export type Price = { monthly: number; yearly: number }
export type PlanPrices = { MRU: Price; XOF: Price; MAD: Price }
export type Offers = {
  limits: Record<'freemium' | 'standard' | 'premium', Limits>
  prices: Record<'standard' | 'premium', PlanPrices>
}

const emptyPrice = (): Price => ({ monthly: 0, yearly: 0 })
const emptyLimits = (): Limits => ({ daily_questions: 0, daily_qcm: 0, daily_contents: 0, max_documents: null, pdf_export: false, history_days: null })

export async function loadOffers(): Promise<Offers> {
  const [plans, fx, lim] = await Promise.all([
    supabase.from('plans').select('plan,price_monthly,price_yearly').in('plan', ['standard', 'premium']),
    supabase.from('plan_prices').select('plan,currency,monthly,yearly'),
    supabase.from('plan_limits').select('*').in('plan', ['freemium', 'standard', 'premium']),
  ])
  if (plans.error) throw new Error(plans.error.message)
  if (lim.error) throw new Error(lim.error.message)
  const o: Offers = {
    limits: { freemium: emptyLimits(), standard: emptyLimits(), premium: emptyLimits() },
    prices: {
      standard: { MRU: emptyPrice(), XOF: emptyPrice(), MAD: emptyPrice() },
      premium: { MRU: emptyPrice(), XOF: emptyPrice(), MAD: emptyPrice() },
    },
  }
  for (const r of (plans.data ?? []) as { plan: 'standard' | 'premium'; price_monthly: number; price_yearly: number | null }[])
    o.prices[r.plan].MRU = { monthly: Number(r.price_monthly), yearly: Number(r.price_yearly ?? r.price_monthly * 10) }
  for (const r of (fx.data ?? []) as { plan: 'standard' | 'premium'; currency: 'XOF' | 'MAD'; monthly: number; yearly: number }[])
    if (o.prices[r.plan] && (r.currency === 'XOF' || r.currency === 'MAD')) o.prices[r.plan][r.currency] = { monthly: Number(r.monthly), yearly: Number(r.yearly) }
  for (const r of (lim.data ?? []) as (Limits & { plan: 'freemium' | 'standard' | 'premium' })[])
    o.limits[r.plan] = {
      daily_questions: r.daily_questions,
      daily_qcm: r.daily_qcm,
      daily_contents: r.daily_contents,
      max_documents: r.max_documents,
      pdf_export: r.pdf_export,
      history_days: r.history_days,
    }
  return o
}

export async function savePlan(plan: 'freemium' | 'standard' | 'premium', limits: Limits, prices?: PlanPrices): Promise<string | null> {
  const lim = await supabase.rpc('admin_set_plan_limits', {
    p_plan: plan,
    p_daily_questions: limits.daily_questions,
    p_daily_qcm: limits.daily_qcm,
    p_daily_contents: limits.daily_contents,
    p_max_documents: limits.max_documents,
    p_pdf_export: limits.pdf_export,
    p_history_days: limits.history_days,
  })
  if (lim.error) return lim.error.message
  if (prices && plan !== 'freemium') {
    const mru = await supabase.rpc('admin_set_plan_price_mru', { p_plan: plan, p_monthly: prices.MRU.monthly, p_yearly: prices.MRU.yearly })
    if (mru.error) return mru.error.message
    for (const c of ['XOF', 'MAD'] as const) {
      const r = await supabase.rpc('admin_set_plan_price_fx', { p_plan: plan, p_currency: c, p_monthly: prices[c].monthly, p_yearly: prices[c].yearly })
      if (r.error) return r.error.message
    }
  }
  return null
}
