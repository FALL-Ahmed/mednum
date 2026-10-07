import { supabase } from './supabase'

/* ——— Réglages (tarifs de l'IA, taux de change) ——— */

export type Settings = {
  usdMru: number // 1 dollar = X MRU
  xofPerMru: number // X FCFA pour 1 MRU
  madPerMru: number // X dirhams pour 1 MRU
  prices: Record<string, { in: number; out: number }> // dollars pour 1 million de tokens
  fixedInfraMru: number // hébergement, base de données (MRU par mois)
  fixedOtherMru: number // autres charges fixes (MRU par mois)
  feePaydunyaPct: number // frais retenus sur les paiements PayDunya
  feeKitpayPct: number
  feeManualPct: number
}

export const MODELS: { id: string; key: string; label: string; perHour?: boolean; use: string }[] = [
  { id: 'claude-haiku-4-5-20251001', key: 'haiku45', label: 'Claude Haiku 4.5', use: 'ancien modèle de discussion' },
  { id: 'claude-sonnet-5-5', key: 'sonnet55', label: 'Claude Sonnet 5.5', use: 'discussion, QCM, fiches, flashcards' },
  { id: 'claude-opus-5-5', key: 'opus55', label: 'Claude Opus 5.5', use: 'cas cliniques' },
  { id: 'gemini-2.5-flash', key: 'gemini25flash', label: 'Gemini 2.5 Flash (texte)', use: 'lecture des PDF scannés' },
  { id: 'gemini-2.5-flash-audio', key: 'gemini25audio', label: 'Gemini 2.5 Flash (audio)', use: 'transcription vocale' },
  { id: 'groq-whisper-large-v3', key: 'whisper', label: 'Whisper large v3 (Groq)', perHour: true, use: 'transcription de secours, facturée à la durée' },
]

export const DEFAULT_SETTINGS: Settings = {
  usdMru: 40,
  xofPerMru: 16,
  madPerMru: 0.27,
  fixedInfraMru: 0,
  fixedOtherMru: 0,
  feePaydunyaPct: 0,
  feeKitpayPct: 0,
  feeManualPct: 0,
  prices: {
    haiku45: { in: 1, out: 5 },
    sonnet55: { in: 2, out: 10 },
    opus55: { in: 4, out: 20 },
    gemini25flash: { in: 0.3, out: 2.5 },
    gemini25audio: { in: 1, out: 2.5 },
    whisper: { in: 0.111, out: 0 },
  },
}

export async function loadSettings(): Promise<Settings> {
  const s: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  const { data } = await supabase.from('app_config').select('key,value').or('key.like.fx_%,key.like.api_price_%,key.like.cost_%,key.like.fee_%')
  for (const r of (data ?? []) as { key: string; value: string }[]) {
    const v = Number(r.value)
    if (!Number.isFinite(v) || v < 0) continue
    if (r.key === 'cost_fixed_infra_mru') s.fixedInfraMru = v
    else if (r.key === 'cost_fixed_other_mru') s.fixedOtherMru = v
    else if (r.key === 'fee_paydunya_pct') s.feePaydunyaPct = v
    else if (r.key === 'fee_kitpay_pct') s.feeKitpayPct = v
    else if (r.key === 'fee_manual_pct') s.feeManualPct = v
    else if (v <= 0) continue
    else if (r.key === 'fx_usd_mru') s.usdMru = v
    else if (r.key === 'fx_xof_per_mru') s.xofPerMru = v
    else if (r.key === 'fx_mad_per_mru') s.madPerMru = v
    else {
      const m = r.key.match(/^api_price_([a-z0-9]+)_(in|out)$/)
      if (m && s.prices[m[1]]) s.prices[m[1]][m[2] as 'in' | 'out'] = v
    }
  }
  return s
}

export async function saveSetting(key: string, value: number): Promise<string | null> {
  const { error } = await supabase.rpc('admin_set_config', { p_key: key, p_value: String(value) })
  return error ? error.message : null
}

/* ——— Conversions et coûts ——— */

export const toMru = (amount: number, currency: string, s: Settings) =>
  currency === 'XOF' ? amount / s.xofPerMru : currency === 'MAD' ? amount / s.madPerMru : amount

export function modelKey(model: string): string {
  if (model.startsWith('groq-whisper')) return 'whisper'
  if (model.startsWith('gemini') && model.includes('audio')) return 'gemini25audio'
  if (model.startsWith('gemini')) return 'gemini25flash'
  if (/opus/i.test(model)) return 'opus55'
  if (/haiku/i.test(model)) return 'haiku45'
  return 'sonnet55'
}

/** Coût en dollars d'un appel (tokens × tarif du modèle). */
export function costUsd(model: string, input: number, output: number, s: Settings): number {
  const key = modelKey(model)
  const p = s.prices[key] ?? s.prices.sonnet55
  // Whisper est facturé à la durée : « input » contient des secondes d'audio, le tarif est en dollars par heure.
  if (key === 'whisper') return (input / 3600) * p.in
  return (input * p.in + output * p.out) / 1_000_000
}

/* ——— Données ——— */

export type Daily = { day: string; signups: number; docs: number; active: number; chat: number; qcm: number; content: number }
export type RevDaily = { day: string; currency: string; n: number; amount: number }
export type UsageDaily = { day: string; model: string; kind: string; calls: number; input_tokens: number; output_tokens: number }
export type Totals = {
  students: number; students_period: number; students_today: number
  documents: number; users_with_docs: number
  active_today: number; active_7d: number
  paying_now: number; paying_standard: number; paying_premium: number; ever_paid: number; pending: number
  revenue_total: Record<string, number>; mrr: Record<string, number>
  by_method: { provider: string; method: string; currency: string; n: number; amount: number }[]
  countries: { country: string; n: number }[]
  promotions: { promotion: string; n: number }[]
}
export type Overview = { days: number; daily: Daily[]; revenue_daily: RevDaily[]; usage_daily: UsageDaily[]; totals: Totals }

export async function loadOverview(days: number): Promise<Overview> {
  const { data, error } = await supabase.rpc('admin_overview', { p_days: days })
  if (error) throw new Error(error.message)
  return data as Overview
}

/* ——— Mise en forme ——— */

export const fmt = (n: number, digits = 0) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/* ——— Devise d'affichage : tout est calculé en MRU, puis converti à l'écran avec les taux des Paramètres ——— */

export type Cur = 'MRU' | 'USD' | 'MAD' | 'XOF'
export const CURRENCIES: { id: Cur; label: string; name: string }[] = [
  { id: 'MRU', label: 'MRU', name: 'Ouguiya (MRU)' },
  { id: 'USD', label: '$', name: 'Dollar ($)' },
  { id: 'MAD', label: 'MAD', name: 'Dirham (MAD)' },
  { id: 'XOF', label: 'FCFA', name: 'Franc CFA (FCFA)' },
]
let display: { cur: Cur; rate: number } = { cur: 'MRU', rate: 1 } // rate = unités de la devise pour 1 MRU
export function setDisplayCurrency(cur: Cur, s: Settings) {
  const rate = cur === 'USD' ? 1 / (s.usdMru || 1) : cur === 'MAD' ? s.madPerMru : cur === 'XOF' ? s.xofPerMru : 1
  display = { cur, rate: Number.isFinite(rate) && rate > 0 ? rate : 1 }
}
/** Montant en MRU → montant dans la devise affichée (pour les graphiques). */
export const fromMru = (n: number) => n * display.rate
export const curLabel = () => CURRENCIES.find(c => c.id === display.cur)!.label
/** Montant en MRU, écrit dans la devise choisie (ex. « 12,5 $ » ou « 4 500 MRU »). */
export const fmtMru = (n: number) => {
  const v = n * display.rate
  const digits = display.cur === 'USD' && Math.abs(v) < 1000 ? 2 : 0
  return `${fmt(digits ? v : Math.round(v), digits)} ${curLabel()}`
}
export const pct = (a: number, b: number) => (b > 0 ? `${fmt((a / b) * 100, 1)} %` : '—')
export const dayShort = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
export const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export const KIND_LABEL: Record<string, string> = {
  chat: 'Discussion', qcm: 'QCM', fiche: 'Fiche', flashcards: 'Flashcards', case: 'Cas cliniques', summary: 'Résumé', voice: 'Transcription vocale', ocr: 'Lecture de PDF scannés', '?': 'Autre',
}

/* ——— Finances détaillées ——— */

export type FinanceData = {
  cost_by_plan: { plan: string; model: string; kind: string; calls: number; input_tokens: number; output_tokens: number }[]
  plan_students: { plan: string; n: number; active_n: number }[]
  top_costly: { name: string; plan: string; model: string; calls: number; input_tokens: number; output_tokens: number }[]
  mrr_daily: { day: string; currency: string; amount: number; n: number }[]
  mrr_by_plan: { plan: string; currency: string; n: number; amount: number }[]
  revenue_by_plan: { plan: string; duration: string; currency: string; n: number; amount: number }[]
  revenue_by_country: { country: string; currency: string; n: number; amount: number }[]
  subscribers: { ever: number; renewed: number; due_7d: number; lapsed_30d: number }
  days_to_pay: number | null
  retention: { d1: { n: number; ok: number }; d7: { n: number; ok: number }; d30: { n: number; ok: number } }
}

export async function loadFinance(days: number): Promise<FinanceData> {
  const { data, error } = await supabase.rpc('admin_finance', { p_days: days })
  if (error) throw new Error(error.message)
  return data as FinanceData
}
