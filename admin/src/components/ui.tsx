import type { ReactNode } from 'react'

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="ph">
      <div>
        <h1 className="ph-t">{title}</h1>
        {sub && <p className="ph-s">{sub}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

export function Kpi({ label, value, sub, tone, big }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad'; big?: boolean }) {
  return (
    <div className={`ad-kpi${tone ? ' ' + tone : ''}${big ? ' big' : ''}`}>
      <div className="ad-kpi-l">{label}</div>
      <div className="ad-kpi-v">{value}</div>
      {sub && <div className="ad-kpi-s">{sub}</div>}
    </div>
  )
}

export const KpiRow = ({ children, cols = 4 }: { children: ReactNode; cols?: number }) => (
  <div className="ad-kpis" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
    {children}
  </div>
)

export function Panel({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="ad-panel">
      <div className="ad-panel-h">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      <div className="ad-panel-b">{children}</div>
    </section>
  )
}

export const Grid = ({ children, cols = 2 }: { children: ReactNode; cols?: number }) => (
  <div className="ad-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
    {children}
  </div>
)

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad'; children: ReactNode }) {
  return <div className={`ad-note ${tone}`}>{children}</div>
}

export const Loading = () => <div className="ld">Chargement…</div>

export function PlanBadge({ plan }: { plan: string }) {
  const label = plan === 'premium' ? 'Duo' : plan === 'standard' ? 'Standard' : 'Gratuit'
  return <span className={`badge ${plan === 'premium' ? 'bg-pu' : plan === 'standard' ? 'bg-gr' : 'bg-gy'}`}>{label}</span>
}
