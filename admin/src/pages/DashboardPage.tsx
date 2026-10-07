import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Icons } from '../components/icons'
import { Loading, Notice } from '../components/ui'
import { DEFAULT_SETTINGS, loadOverview, loadSettings, type Overview, type Settings as SettingsT } from '../lib/admin'
import type { Page } from '../lib/derive'
import { supabase } from '../lib/supabase'
import Activity from './Activity'
import Documents from './Documents'
import Finance from './Finance'
import Growth from './Growth'
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
      { id: 'reports', label: 'Signalements', Icon: Icons.Flag },
    ],
  },
  { title: 'Système', items: [{ id: 'settings', label: 'Paramètres', Icon: Icons.Cog }] },
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
  const [busy, setBusy] = useState(false)

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
    setBusy(false)
  }, [days])

  useEffect(() => {
    refresh()
  }, [refresh])

  const email = session.user.email ?? ''
  const badge = (id: Page) => (id === 'payments' ? ov?.totals.pending ?? 0 : id === 'reports' ? reportsNew : 0)

  const forbidden = !!err && /forbidden/i.test(err)
  const missing = !!err && /(could not find|schema cache|does not exist)/i.test(err)

  return (
    <div className="al">
      <aside className="sb">
        <div className="sb-brand">
          <div className="sb-mark">ax</div>
          <div>
            <div className="sb-name">Axone</div>
            <div className="sb-role">Administration</div>
          </div>
        </div>
        <nav className="sb-nav">
          {NAV.map(sec => (
            <div key={sec.title} className="sb-sec">
              <span className="sb-sec-lbl">{sec.title}</span>
              {sec.items.map(({ id, label, Icon }) => (
                <button key={id} className={`ni${page === id ? ' act' : ''}`} onClick={() => setPage(id)}>
                  <Icon size={15} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badge(id) > 0 && <span className="ni-badge">{badge(id)}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
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
              <button className="btn-s" onClick={refresh} disabled={busy}>
                <Icons.Refresh />
                {busy ? 'Actualisation…' : 'Actualiser'}
              </button>
            </div>
          )}

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
              {page === 'overview' && ov && <OverviewPage ov={ov} settings={settings} days={days} go={setPage} reportsNew={reportsNew} />}
              {page === 'growth' && ov && <Growth ov={ov} settings={settings} days={days} go={setPage} reportsNew={reportsNew} />}
              {page === 'finance' && ov && <Finance ov={ov} settings={settings} days={days} go={setPage} reportsNew={reportsNew} />}
              {page === 'activity' && ov && <Activity ov={ov} settings={settings} days={days} go={setPage} reportsNew={reportsNew} />}
              {page === 'students' && <Students />}
              {page === 'payments' && <Payments />}
              {page === 'promotions' && <Promotions />}
              {page === 'documents' && <Documents />}
              {page === 'reports' && <Reports />}
              {page === 'settings' && <SettingsPage settings={settings} onSaved={refresh} email={email} />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
