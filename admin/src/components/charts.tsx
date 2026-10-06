import { useEffect, useRef, useState } from 'react'

/** Largeur réelle du conteneur : le graphique garde des textes de taille normale quelle que soit sa place. */
function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setW(Math.max(280, Math.floor(el.clientWidth)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export type Series = { name: string; color: string; values: number[] }

const nice = (max: number) => {
  if (max <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(max)))
  const m = max / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

/** Histogramme (une ou plusieurs séries côte à côte). */
export function Bars({ labels, series, height = 200, unit = '' }: { labels: string[]; series: Series[]; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [boxRef, W] = useWidth()
  const H = height
  const padL = 44
  const padB = 24
  const padT = 10
  const max = nice(Math.max(1, ...series.flatMap(s => s.values)))
  const n = labels.length
  const slot = (W - padL) / Math.max(1, n)
  const bw = Math.max(2, (slot * 0.7) / series.length)
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max)
  const step = Math.max(1, Math.ceil(n / 10))
  return (
    <div className="ch" ref={boxRef}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Graphique">
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={padL} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#E8EEF3" />
            <text x={padL - 6} y={y(max * f) + 4} fontSize="11" fill="#8A99AB" textAnchor="end">
              {Math.round(max * f).toLocaleString('fr-FR')}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          const x0 = padL + i * slot + (slot - bw * series.length) / 2
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill={hover === i ? 'rgba(11,30,52,.04)' : 'transparent'} />
              {series.map((s, k) => {
                const v = s.values[i] ?? 0
                return <rect key={k} x={x0 + k * bw} y={y(v)} width={bw - 1} height={Math.max(0, H - padB - y(v))} rx="2" fill={s.color} />
              })}
              {i % step === 0 && (
                <text x={padL + i * slot + slot / 2} y={H - 6} fontSize="11" fill="#8A99AB" textAnchor="middle">
                  {l}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="ch-tip">
          <strong>{labels[hover]}</strong>
          {series.map(s => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name} : {(s.values[hover] ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {unit}
            </span>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="ch-leg">
          {series.map(s => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Courbe (une ou plusieurs séries). */
export function Lines({ labels, series, height = 200 }: { labels: string[]; series: Series[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const [boxRef, W] = useWidth()
  const H = height
  const padL = 44
  const padB = 24
  const padT = 10
  const max = nice(Math.max(1, ...series.flatMap(s => s.values)))
  const n = labels.length
  const x = (i: number) => padL + ((W - padL - 8) * i) / Math.max(1, n - 1)
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max)
  const step = Math.max(1, Math.ceil(n / 10))
  return (
    <div className="ch" ref={boxRef}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Graphique">
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={padL} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#E8EEF3" />
            <text x={padL - 6} y={y(max * f) + 4} fontSize="11" fill="#8A99AB" textAnchor="end">
              {Math.round(max * f).toLocaleString('fr-FR')}
            </text>
          </g>
        ))}
        {series.map(s => (
          <g key={s.name}>
            <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4" fill={s.color} />}
          </g>
        ))}
        {labels.map((l, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - 8} y={padT} width="16" height={H - padT - padB} fill="transparent" />
            {i % step === 0 && (
              <text x={x(i)} y={H - 6} fontSize="11" fill="#8A99AB" textAnchor="middle">
                {l}
              </text>
            )}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="ch-tip">
          <strong>{labels[hover]}</strong>
          {series.map(s => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name} : {(s.values[hover] ?? 0).toLocaleString('fr-FR')}
            </span>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="ch-leg">
          {series.map(s => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Barres horizontales pour un classement. */
export function HBars({ rows, color = '#07A997' }: { rows: { label: string; value: number; sub?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="hb">
      {rows.map(r => (
        <div key={r.label} className="hb-row">
          <div className="hb-top">
            <span>{r.label}</span>
            <strong>{r.sub ?? r.value.toLocaleString('fr-FR')}</strong>
          </div>
          <div className="hb-track">
            <div className="hb-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="ad-empty">Pas encore de données.</p>}
    </div>
  )
}

/** Entonnoir : chaque étape avec son effectif et le pourcentage de l'étape précédente. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1)
  return (
    <div className="fn">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value
        return (
          <div key={s.label} className="fn-row">
            <div className="fn-bar" style={{ width: `${Math.max(4, (s.value / top) * 100)}%` }}>
              <span>{s.label}</span>
            </div>
            <div className="fn-val">
              <strong>{s.value.toLocaleString('fr-FR')}</strong>
              <span>{prev !== null && prev > 0 ? `${Math.round((s.value / prev) * 100)} % de l'étape précédente` : 'point de départ'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
