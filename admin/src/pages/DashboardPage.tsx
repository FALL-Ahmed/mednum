import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Icons } from '../components/icons'
import { Logo } from '../components/Logo'
import { Loading, Notice } from '../components/ui'
import { CURRENCIES, DEFAULT_SETTINGS, loadOverview, setDisplayCurrency, type Cur, loadSettings, type Overview, type Settings as SettingsT } from '../lib/admin'
import type { Page } from '../lib/derive'
import { supabase } from '../lib/supabase'
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from '../lib/push'
import Activity from './Activity'
import Documents from './Documents'
import Errors from './Errors'
import Finance from './Finance'
import Growth from './Growth'
import Ideas from './Ideas'
import OverviewPage from './Overview'
import Payments from './Payments'
import Promotions from './Promotions'
import Reports from './Reports'
import SettingsPage from './Settings'
import Students from './Students'

type Item = { id: Page; label: string; Icon: (p: { size?: number }) => JSX.Element }
const NAV: { title: string; items: Item[] }[] = [
  {
    title: 'Pilotage',
    items: [
      { id: 'overview', label: "Vue d'ensemble", Icon: Icons.Overview },
      { id: 'growth', label: 'Croissance', Icon: Icons.Growth },
      { id: 'finance', label: 'Finances', Icon: Icons.Money },
    ],
  },
  {
    title: 'Élèves',
    items: [
      { id: 'students', label: 'Élèves', Icon: Icons.Users },
      { id: 'payments', label: 'Abonnements', Icon: Icons.Card },
      { id: 'activity', label: 'Activité', Icon: Icons.Pulse },
    ],
  },
  {
    title: 'Marketing',
    items: [{ id: 'promotions', label: 'Promotions', Icon: Icons.Tag }],
  },
  {
    title: 'Contenu',
    items: [
      { id: 'documents', label: 'Cours des élèves', Icon: Icons.Doc },
      { id: 'ideas', label: 'Messages', Icon: Icons.Pulse },
      { id: 'reports', label: 'Signalements', Icon: Icons.Flag },
    ],
  },
  {
    title: 'Système',
    items: [
      { id: 'errors', label: 'Erreurs', Icon: Icons.Flag },
      { id: 'settings', label: 'Paramètres', Icon: Icons.Cog },
    ],
  },
]

const PERIODIC: Page[] = ['overview', 'growth', 'finance', 'activity']
const PERIODS = [7, 30, 90]

export default function DashboardPage({ session }: { session: Session }) {
  const [page, setPage] = useState<Page>('overview')
  const [days, setDays] = useState(30)
  const [ov, setOv] = useState<Overview | null>(null)
  const [settings, setSettings] = useState<SettingsT>(DEFAULT_SETTINGS)
  const [err, setErr] = useState<string | null>(null)
  const [reportsNew, setReportsNew] = useState(0)
  const [pendingN, setPendingN] = useState(0)
  const [errorsN, setErrorsN] = useState(0)
  const [ideasN, setIdeasN] = useState(0)
  const [push, setPush] = useState<PushState>('off')
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  useEffect(() => { pushState().then(setPush) }, [])

  // Ouverture depuis une notification : #payments dans l'adresse, ou message du service worker
  useEffect(() => {
    const fromHash = () => { if (window.location.hash === '#payments') { setPage('payments'); history.replaceState(null, '', '/') } }
    fromHash()
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'open' && String(e.data.url).includes('payments')) setPage('payments') }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [])

  async function togglePush() {
    setPushMsg(null)
    if (push === 'on') {
      await disablePush()
      setPush(await pushState())
      return
    }
    const err = await enablePush()
    setPush(await pushState())
    if (err) setPushMsg(err)
    else {
      const t = await sendTestPush()
      setPushMsg(t ? `Activé, mais l'envoi de test a échoué (${t}). Vérifie que la fonction notify-admin est déployée.` : 'Activé : une notification de test arrive.')
    }
  }
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false) // tiroir du menu sur mobile
  const [cur, setCur] = useState<Cur>(() => {
    try {
      const v = localStorage.getItem('ax_admin_cur')
      return CURRENCIES.some(c => c.id === v) ? (v as Cur) : 'MRU'
    } catch { return 'MRU' }
  })
  const pickCur = (c: Cur) => {
    setCur(c)
    try { localStorage.setItem('ax_admin_cur', c) } catch { /* stockage refusé */ }
  }

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const [o, s] = await Promise.all([loadOverview(days), loadSettings()])
      setOv(o)
      setSettings(s)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur inconnue')
    }
    const { count } = await supabase.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'new')
    setReportsNew(count ?? 0)
    const pend = await supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    setPendingN(pend.count ?? 0)
    const errs = await supabase.from('client_errors').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 86400000).toISOString())
    setErrorsN(errs.count ?? 0)
    const ideas = await supabase.from('suggestions').select('id', { count: 'exact', head: true }).eq('status', 'new')
    setIdeasN(ideas.count ?? 0)
    setBusy(false)
  }, [days])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Les pages lisent la devise d'affichage au moment du rendu : on la règle d'abord
  setDisplayCurrency(cur, settings)
  const email = session.user.email ?? ''

  const curPicker = (
    <label className="cur-pick">
      <span>Devise</span>
      <select className="ad-select" value={cur} onChange={e => pickCur(e.target.value as Cur)} aria-label="Devise d'affichage">
        {CURRENCIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  )
  const pending = Math.max(pendingN, ov?.totals.pending ?? 0)
  const badge = (id: Page) => (id === 'payments' ? pending : id === 'reports' ? reportsNew : id === 'errors' ? errorsN : id === 'ideas' ? ideasN : 0)

  const forbidden = !!err && /forbidden/i.test(err)
  const missing = !!err && /(could not find|schema cache|does not exist)/i.test(err)

  return (
    <div className="al">
      <header className="mb-top">
        <button className="mb-burger" onClick={() => setMenu(true)} aria-label="Ouvrir le menu" aria-expanded={menu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <Logo size={22} />
        {pending > 0 ? (
          <button className="mb-pend" onClick={() => setPage('payments')} aria-label={`${pending} abonnement à valider`}>
            <span>{pending}</span> à valider
          </button>
        ) : <span className="mb-pend-spacer" aria-hidden />}
      </header>
      {menu && <div className="mb-scrim" onClick={() => setMenu(false)} />}
      <aside className={`sb${menu ? ' open' : ''}`}>
        <div className="sb-brand">
          <div>
            <Logo size={22} />
            <div className="sb-role" style={{ marginTop: 4 }}>Administration</div>
          </div>
        </div>
        <nav className="sb-nav">
          {NAV.map(sec => (
            <div key={sec.title} className="sb-sec">
              <span className="sb-sec-lbl">{sec.title}</span>
              {sec.items.map(({ id, label, Icon }) => (
                <button key={id} className={`ni${page === id ? ' act' : ''}`} onClick={() => { setPage(id); setMenu(false) }}>
                  <Icon size={15} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badge(id) > 0 && <span className={`ni-badge${id === 'payments' ? ' pulse' : ''}`} aria-label={`${badge(id)} à traiter`}>{badge(id)}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          {push !== 'unsupported' && (
            <>
              <button className={`sb-notif${push === 'on' ? ' on' : ''}`} onClick={togglePush} disabled={push === 'denied'}>
                <span aria-hidden>{push === 'on' ? '🔔' : '🔕'}</span>
                {push === 'on' ? 'Notifications activées' : push === 'denied' ? 'Notifications bloquées' : 'Activer les notifications'}
              </button>
              {pushMsg && <p className="sb-notif-msg">{pushMsg}</p>}
              {push === 'denied' && <p className="sb-notif-msg">Autorise-les dans les réglages du navigateur pour ce site.</p>}
            </>
          )}
          <div className="sb-usr">
            <div className="sb-av">{email[0]?.toUpperCase() || 'A'}</div>
            <div style={{ minWidth: 0 }}>
              <div className="sb-uname">{email.split('@')[0]}</div>
              <div className="sb-uemail">{email}</div>
            </div>
          </div>
          <button className="sb-out" onClick={() => supabase.auth.signOut()}>
            <Icons.Exit size={14} />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="am">
        <div className="ac">
          {PERIODIC.includes(page) && !forbidden && !missing && (
            <div className="ad-bar">
              <div className="ad-periods" role="group" aria-label="Période">
                {PERIODS.map(p => (
                  <button key={p} className={`fp${days === p ? ' on' : ''}`} onClick={() => setDays(p)}>
                    {p} jours
                  </button>
                ))}
              </div>
              <div className="ad-bar-r">
                {(page === 'overview' || page === 'finance') && curPicker}
                <button className="btn-s" onClick={refresh} disabled={busy}>
                  <Icons.Refresh />
                  {busy ? 'Actualisation…' : 'Actualiser'}
                </button>
              </div>
            </div>
          )}
          {page === 'settings' && <div className="ad-bar" style={{ justifyContent: 'flex-end' }}>{curPicker}</div>}

          {forbidden ? (
            <div className="ad-gate">
              <h1>Accès administrateur requis</h1>
              <p>Ce compte est connecté, mais il n'est pas déclaré administrateur. Dans Supabase, lance cette requête avec ton adresse, puis recharge la page :</p>
              <pre>{`insert into public.admin_users (user_id)\nselect id from auth.users where email = '${email}'\non conflict do nothing;`}</pre>
            </div>
          ) : missing ? (
            <div className="ad-gate">
              <h1>Une étape manque côté base de données</h1>
              <p>Les fonctions de statistiques ne sont pas encore installées. Lance la migration <code>20260930090000_admin_analytics.sql</code> dans l'éditeur SQL de Supabase (blocs 1, 2 et 3), puis recharge la page.</p>
              <pre>{err}</pre>
            </div>
          ) : !ov && !err && PERIODIC.includes(page) ? (
            <Loading />
          ) : (
            <>
              {err && <Notice tone="bad">{err}</Notice>}
              {page === 'overview' && ov && <OverviewPage ov={ov} settings={settings} days={days} go={setPage} reportsNew={reportsNew} pending={pending} />}
              {page === 'growth' && ov && <Growth ov={ov} settings={settings} days={days} go={setPage} reportsNew={reportsNew} />}
              {page === 'finance' && ov && <Finance ov={ov} settings={settings} days={days} go={setPage} reportsNew={reportsNew} />}
              {page === 'activity' && ov && <Activity ov={ov} settings={settings} days={days} go={setPage} reportsNew={reportsNew} />}
              {page === 'students' && <Students />}
              {page === 'payments' && <Payments />}
              {page === 'promotions' && <Promotions />}
              {page === 'documents' && <Documents />}
              {page === 'reports' && <Reports />}
              {page === 'errors' && <Errors />}
              {page === 'ideas' && <Ideas />}
              {page === 'settings' && <SettingsPage settings={settings} onSaved={refresh} email={email} />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
