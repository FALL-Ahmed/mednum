import { useCallback, useEffect, useState } from 'react'
import { Loading, Notice, PageHead, Panel } from '../components/ui'
import { fmtMru, MODELS, saveSetting, type Settings as S } from '../lib/admin'
import { supabase } from '../lib/supabase'
import { loadOffers, savePlan, type Limits, type Offers, type PlanPrices } from '../lib/offers'

type Tab = 'offers' | 'payments' | 'ai' | 'costs' | 'account'
const TABS: { id: Tab; label: string }[] = [
  { id: 'offers', label: 'Offres et limites' },
  { id: 'payments', label: 'Paiements' },
  { id: 'ai', label: "Tarifs de l'IA" },
  { id: 'costs', label: 'Frais et charges' },
  { id: 'account', label: 'Mon accès' },
]

type PlanKey = 'freemium' | 'standard' | 'premium'
const PLAN_NAME: Record<PlanKey, string> = { freemium: 'Gratuit', standard: 'Standard', premium: 'Premium' }

const num = (v: string): number | null => {
  const n = Number(v.replace(',', '.').trim())
  return v.trim() !== '' && Number.isFinite(n) ? n : null
}

/* ——— Onglet « Offres et limites » : nos prix et ce que chaque offre permet ——— */

function PlanCard({ plan, offers, onSaved }: { plan: PlanKey; offers: Offers; onSaved: () => void }) {
  const base = offers.limits[plan]
  const price = plan === 'freemium' ? null : offers.prices[plan]
  const [q, setQ] = useState(String(base.daily_questions))
  const [qcm, setQcm] = useState(String(base.daily_qcm))
  const [cont, setCont] = useState(String(base.daily_contents))
  const [docs, setDocs] = useState(base.max_documents === null ? '' : String(base.max_documents))
  const [docsInf, setDocsInf] = useState(base.max_documents === null)
  const [hist, setHist] = useState(base.history_days === null ? '' : String(base.history_days))
  const [histInf, setHistInf] = useState(base.history_days === null)
  const [pdf, setPdf] = useState(base.pdf_export)
  const [p, setP] = useState<Record<string, string>>(() =>
    price
      ? {
          mruM: String(price.MRU.monthly), mruY: String(price.MRU.yearly),
          xofM: String(price.XOF.monthly), xofY: String(price.XOF.yearly),
          madM: String(price.MAD.monthly), madY: String(price.MAD.yearly),
        }
      : {},
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    const limits: Limits = {
      daily_questions: num(q) ?? NaN, daily_qcm: num(qcm) ?? NaN, daily_contents: num(cont) ?? NaN,
      max_documents: docsInf ? null : num(docs) ?? NaN, pdf_export: pdf, history_days: histInf ? null : num(hist) ?? NaN,
    }
    if ([limits.daily_questions, limits.daily_qcm, limits.daily_contents, limits.max_documents ?? 0, limits.history_days ?? 0].some(n => !Number.isInteger(n) || n < 0)) {
      setMsg({ ok: false, text: 'Les limites doivent être des nombres entiers, zéro ou plus.' })
      return
    }
    let prices: PlanPrices | undefined
    if (price) {
      const g = (k: string) => num(p[k] ?? '')
      const vals = ['mruM', 'mruY', 'xofM', 'xofY', 'madM', 'madY'].map(g)
      if (vals.some(v => v === null || v <= 0)) {
        setMsg({ ok: false, text: 'Chaque prix doit être un nombre supérieur à zéro.' })
        return
      }
      prices = {
        MRU: { monthly: vals[0]!, yearly: vals[1]! },
        XOF: { monthly: vals[2]!, yearly: vals[3]! },
        MAD: { monthly: vals[4]!, yearly: vals[5]! },
      }
    }
    setBusy(true)
    setMsg(null)
    const err = await savePlan(plan, limits, prices)
    setBusy(false)
    if (err) setMsg({ ok: false, text: err })
    else {
      setMsg({ ok: true, text: 'Enregistré. Le site et l\'application utilisent déjà ces valeurs.' })
      onSaved()
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, unit?: string, disabled = false) => (
    <label className="of-f">
      <span>{label}</span>
      <span className="of-in">
        <input className="ad-input" inputMode="numeric" value={value} disabled={disabled} onChange={e => set(e.target.value)} />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  )

  return (
    <section className={`of-card of-${plan}`}>
      <header>
        <h3>{PLAN_NAME[plan]}</h3>
        {plan === 'freemium' && <span className="ad-mut">offre d&apos;entrée, sans paiement</span>}
      </header>

      {price && (
        <div className="of-block">
          <h4>Prix</h4>
          <div className="of-prices">
            <div className="of-cur"><b>Ouguiyas</b><small>Mauritanie</small></div>
            {field('Par mois', p.mruM, v => setP(s => ({ ...s, mruM: v })), 'MRU')}
            {field('Par an', p.mruY, v => setP(s => ({ ...s, mruY: v })), 'MRU')}
            <div className="of-cur"><b>FCFA</b><small>Sénégal</small></div>
            {field('Par mois', p.xofM, v => setP(s => ({ ...s, xofM: v })), 'FCFA')}
            {field('Par an', p.xofY, v => setP(s => ({ ...s, xofY: v })), 'FCFA')}
            <div className="of-cur"><b>Dirhams</b><small>Maroc</small></div>
            {field('Par mois', p.madM, v => setP(s => ({ ...s, madM: v })), 'MAD')}
            {field('Par an', p.madY, v => setP(s => ({ ...s, madY: v })), 'MAD')}
          </div>
        </div>
      )}

      <div className="of-block">
        <h4>Ce que l&apos;offre permet, chaque jour</h4>
        <div className="of-grid">
          {field('Questions à Dr. Ahmed', q, setQ, 'par jour')}
          {field('Séries de QCM', qcm, setQcm, 'par jour')}
          {field('Fiches, flashcards, cas cliniques', cont, setCont, 'par jour')}
        </div>
      </div>

      <div className="of-block">
        <h4>Autres limites</h4>
        <div className="of-grid">
          <div className="of-f">
            <span>Cours actifs</span>
            <span className="of-in">
              <input className="ad-input" inputMode="numeric" value={docsInf ? '' : docs} disabled={docsInf} onChange={e => setDocs(e.target.value)} placeholder={docsInf ? 'Illimité' : ''} />
              <label className="of-chk"><input type="checkbox" checked={docsInf} onChange={e => setDocsInf(e.target.checked)} /> Illimité</label>
            </span>
          </div>
          <div className="of-f">
            <span>Historique des discussions</span>
            <span className="of-in">
              <input className="ad-input" inputMode="numeric" value={histInf ? '' : hist} disabled={histInf} onChange={e => setHist(e.target.value)} placeholder={histInf ? 'Illimité' : ''} />
              <em>jours</em>
              <label className="of-chk"><input type="checkbox" checked={histInf} onChange={e => setHistInf(e.target.checked)} /> Illimité</label>
            </span>
          </div>
          <div className="of-f">
            <span>Export des fiches en PDF</span>
            <label className="of-chk of-big"><input type="checkbox" checked={pdf} onChange={e => setPdf(e.target.checked)} /> {pdf ? 'Autorisé' : 'Non autorisé'}</label>
          </div>
        </div>
      </div>

      {msg && <div className={`ad-note ${msg.ok ? '' : 'bad'}`} style={{ margin: '12px 0 0' }}>{msg.text}</div>}
      <div style={{ marginTop: 16 }}>
        <button className="btn-p" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : `Enregistrer l'offre ${PLAN_NAME[plan]}`}</button>
      </div>
    </section>
  )
}

function OffersTab() {
  const [offers, setOffers] = useState<Offers | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [rev, setRev] = useState(0)
  const load = useCallback(() => {
    loadOffers().then(o => { setOffers(o); setRev(r => r + 1) }).catch(e => setErr(e.message))
  }, [])
  useEffect(load, [load])
  if (err) return <Notice tone="bad">Impossible de lire les offres : {err}</Notice>
  if (!offers) return <Loading />
  return (
    <div>
      <Notice>
        Ces valeurs sont <strong>appliquées tout de suite</strong> : les quotas du jour, les prix de la page Abonnement et le contrôle des limites lisent ces réglages en direct. Les prix affichés sur la page d&apos;accueil publique sont, eux, écrits dans le site.
      </Notice>
      <div className="of-cols">
        {(['freemium', 'standard', 'premium'] as PlanKey[]).map(pl => (
          <PlanCard key={`${pl}-${rev}`} plan={pl} offers={offers} onSaved={load} />
        ))}
      </div>
    </div>
  )
}

/* ——— Onglet « Paiements » : les numéros où les étudiants envoient l'argent ——— */

const METHODS = [
  { id: 'bankily', label: 'Bankily' },
  { id: 'masrivi', label: 'Masrivi' },
  { id: 'sedad', label: 'Sedad' },
  { id: 'click', label: 'Click' },
]

function PaymentsTab() {
  const [vals, setVals] = useState<Record<string, string> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('payment_accounts').select('method,account_number'),
      supabase.from('app_config').select('value').eq('key', 'support_whatsapp').maybeSingle(),
    ]).then(([a, w]) => {
      if (a.error) { setErr(a.error.message); return }
      const v: Record<string, string> = { whatsapp: (w.data?.value as string) ?? '' }
      for (const m of METHODS) v[m.id] = ''
      for (const r of a.data ?? []) v[r.method as string] = r.account_number as string
      setVals(v)
    })
  }, [])

  async function save() {
    if (!vals) return
    setBusy(true)
    setMsg(null)
    let error: string | null = null
    for (const m of METHODS) {
      const n = vals[m.id].trim()
      // Un numéro vide retire le moyen de paiement de l'application.
      const r = n
        ? await supabase.from('payment_accounts').upsert({ method: m.id, account_number: n })
        : await supabase.from('payment_accounts').delete().eq('method', m.id)
      if (r.error) { error = r.error.message; break }
    }
    if (!error) {
      const w = vals.whatsapp.replace(/\D/g, '')
      const r = w
        ? await supabase.from('app_config').upsert({ key: 'support_whatsapp', value: w })
        : { error: null }
      if (r.error) error = r.error.message
    }
    setBusy(false)
    setMsg(error
      ? { ok: false, text: /row-level security|permission/i.test(error) ? "Droits manquants : exécute d'abord le fichier 20261012000000_payment_accounts_admin.sql dans Supabase (éditeur SQL)." : error }
      : { ok: true, text: "Enregistré. L'application affiche déjà ces numéros." })
  }

  if (err) return <Notice tone="bad">Impossible de lire les numéros : {err}</Notice>
  if (!vals) return <Loading />
  return (
    <Panel title="Numéros de paiement" sub="Ce sont les numéros affichés à l'étudiant : c'est là qu'il envoie l'argent avant de t'envoyer sa capture. Laisse un champ vide pour retirer ce moyen de paiement de l'application.">
      <div className="ad-fx">
        {METHODS.map(m => (
          <label key={m.id} className="ad-fx-row">
            <span><strong>{m.label}</strong><small>Numéro qui reçoit l&apos;argent</small></span>
            <span className="of-in">
              <input className="ad-input" style={{ width: 220 }} inputMode="tel" placeholder="ex : 41 51 32 11" value={vals[m.id]} onChange={e => setVals(v => ({ ...v!, [m.id]: e.target.value }))} />
            </span>
          </label>
        ))}
        <label className="ad-fx-row">
          <span><strong>WhatsApp du support</strong><small>Avec l&apos;indicatif, sans + ni espaces (ex : 22241513211).</small></span>
          <span className="of-in">
            <input className="ad-input" style={{ width: 220 }} inputMode="tel" placeholder="22241513211" value={vals.whatsapp} onChange={e => setVals(v => ({ ...v!, whatsapp: e.target.value }))} />
          </span>
        </label>
      </div>
      {msg && <div className={`ad-note ${msg.ok ? '' : 'bad'}`} style={{ margin: '12px 0 0' }}>{msg.text}</div>}
      <div style={{ marginTop: 16 }}><button className="btn-p" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer les numéros'}</button></div>
    </Panel>
  )
}

/* ——— Onglets de coûts ——— */

function NumberRows({
  rows, onSave, button,
}: {
  rows: { key: string; label: string; hint?: string; value: number; unit?: string; approx?: boolean }[]
  onSave: (vals: { key: string; value: number }[]) => Promise<string | null>
  button: string
}) {
  const [vals, setVals] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    const out: { key: string; value: number }[] = []
    for (const r of rows) {
      const raw = vals[r.key]
      if (raw === undefined) continue
      const n = num(raw)
      if (n === null || n < 0) { setMsg({ ok: false, text: 'Chaque valeur doit être un nombre, zéro ou plus.' }); return }
      out.push({ key: r.key, value: n })
    }
    setBusy(true)
    const err = await onSave(out)
    setBusy(false)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Enregistré.' })
  }
  return (
    <>
      <div className="ad-fx">
        {rows.map(r => (
          <label key={r.key} className="ad-fx-row">
            <span><strong>{r.label}</strong>{r.hint && <small>{r.hint}</small>}</span>
            <span className="of-in">
              <input className="ad-input" inputMode="decimal" value={vals[r.key] ?? String(r.value)} onChange={e => setVals(v => ({ ...v, [r.key]: e.target.value }))} />
              {r.unit && <em>{r.unit}</em>}
              {r.approx && <em>≈ {fmtMru(num(vals[r.key] ?? String(r.value)) ?? 0)}</em>}
            </span>
          </label>
        ))}
      </div>
      {msg && <div className={`ad-note ${msg.ok ? '' : 'bad'}`} style={{ margin: '12px 0 0' }}>{msg.text}</div>}
      <div style={{ marginTop: 16 }}><button className="btn-p" disabled={busy} onClick={save}>{button}</button></div>
    </>
  )
}

/** Envoie à ton adresse l'e-mail de bienvenue : pour vérifier que Resend est bien configuré. */
function MailTest() {
  const [busy, setBusy] = useState(false)
  const [to, setTo] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function test() {
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.functions.invoke('send-email', { body: { type: 'test', all: true, to: to.trim() || undefined } })
    setBusy(false)
    if (error) {
      let detail = error.message
      try { detail = (await (error as unknown as { context: Response }).context.json()).error ?? detail } catch { /* corps illisible */ }
      setMsg({ ok: false, text: /resend_not_configured/.test(detail) ? "La clé Resend n'est pas encore enregistrée : lance la commande supabase secrets set RESEND_API_KEY=… puis déploie la fonction send-email." : `L'envoi a échoué : ${detail}` })
    } else setMsg({ ok: true, text: `3 e-mails de test envoyés à ${(data as { to?: string })?.to ?? 'ton adresse'} (bienvenue, relance, fin d'abonnement). Regarde ta boîte et les courriers indésirables.` })
  }
  return (
    <Panel title="E-mails automatiques" sub="Bienvenue après l'inscription, relance du premier cours après 2 jours, et rappel 3 jours avant la fin d'un abonnement. Envoyés avec Resend.">
      {msg && <div className={`ad-note ${msg.ok ? '' : 'bad'}`} style={{ margin: '0 0 12px' }}>{msg.text}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="ad-input" style={{ width: 280, maxWidth: '100%' }} type="email" placeholder="Envoyer à (vide = ton adresse de connexion)" value={to} onChange={e => setTo(e.target.value)} />
        <button className="btn-s" disabled={busy} onClick={test}>{busy ? 'Envoi…' : "Envoyer les 3 e-mails de test"}</button>
      </div>
    </Panel>
  )
}

export default function SettingsPage({ settings, onSaved, email }: { settings: S; onSaved: () => void; email: string }) {
  const [tab, setTab] = useState<Tab>('offers')
  const save = (list: { key: string; value: number }[]) =>
    (async () => {
      for (const r of list) {
        const err = await saveSetting(r.key, r.value)
        if (err) return err
      }
      onSaved()
      return null
    })()

  return (
    <div>
      <PageHead title="Paramètres" sub="Nos offres, nos limites et les chiffres qui servent à calculer les coûts" />
      <div className="of-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`of-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'offers' && <OffersTab />}

      {tab === 'payments' && <PaymentsTab />}

      {tab === 'ai' && (
        <>
          <Panel title="Tarifs de l'IA" sub="En dollars pour 1 million de tokens. Claude : prix officiels d'Anthropic. Gemini : prix officiels de Google (audio facturé plus cher que le texte). Whisper : tarif Groq par heure d'audio.">
            <NumberRows
              button="Enregistrer les tarifs"
              onSave={save}
              rows={MODELS.flatMap(m =>
                m.perHour
                  ? [{ key: `api_price_${m.key}_in`, label: m.label, hint: m.use, value: settings.prices[m.key].in, unit: '$ / heure d audio' }]
                  : [
                      { key: `api_price_${m.key}_in`, label: `${m.label} · entrée`, hint: `${m.id} · ${m.use}`, value: settings.prices[m.key].in, unit: '$ / million' },
                      { key: `api_price_${m.key}_out`, label: `${m.label} · sortie`, value: settings.prices[m.key].out, unit: '$ / million' },
                    ],
              )}
            />
          </Panel>
          <Panel title="Taux de change" sub="Estimations pour additionner des devises différentes en ouguiyas (MRU).">
            <NumberRows
              button="Enregistrer les taux"
              onSave={save}
              rows={[
                { key: 'fx_usd_mru', label: '1 dollar vaut', hint: "Convertit le coût de l'IA (facturé en dollars).", value: settings.usdMru, unit: 'MRU' },
                { key: 'fx_xof_per_mru', label: '1 MRU vaut', hint: 'Convertit les paiements du Sénégal.', value: settings.xofPerMru, unit: 'FCFA' },
                { key: 'fx_mad_per_mru', label: '1 MRU vaut', hint: 'Convertit les paiements du Maroc.', value: settings.madPerMru, unit: 'MAD' },
              ]}
            />
          </Panel>
        </>
      )}

      {tab === 'costs' && (
        <Panel title="Frais et charges" sub="Pour calculer le vrai bénéfice : ce qui n'est pas le coût de l'IA, mais qu'il faut payer chaque mois.">
          <NumberRows
            button="Enregistrer"
            onSave={save}
            rows={[
              { key: 'cost_fixed_infra_mru', label: 'Hébergement et base de données', hint: 'Supabase, hébergement du site… par mois.', value: settings.fixedInfraMru, unit: 'MRU / mois', approx: true },
              { key: 'cost_fixed_other_mru', label: 'Autres charges fixes', hint: 'Nom de domaine, outils, abonnements… par mois.', value: settings.fixedOtherMru, unit: 'MRU / mois', approx: true },
              { key: 'fee_paydunya_pct', label: 'Frais PayDunya', hint: 'Part retenue sur chaque paiement au Sénégal.', value: settings.feePaydunyaPct, unit: '%' },
              { key: 'fee_kitpay_pct', label: 'Frais KitPay', hint: 'Part retenue sur chaque paiement automatique en Mauritanie.', value: settings.feeKitpayPct, unit: '%' },
              { key: 'fee_manual_pct', label: 'Frais des paiements manuels', hint: "Frais de retrait ou de transfert sur les paiements par reçu.", value: settings.feeManualPct, unit: '%' },
            ]}
          />
        </Panel>
      )}

      {tab === 'account' && (
        <>
        <Panel title="Ton accès">
          <p className="ad-mut">Connecté en tant que <strong style={{ color: 'var(--t1)' }}>{email}</strong>. Seuls les comptes listés dans la table <code>admin_users</code> voient les chiffres de ce panneau.</p>
        </Panel>
        <MailTest />
        </>
      )}
    </div>
  )
}
