import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import type { Session } from '@supabase/supabase-js'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../lib/supabase'
import type { Course, Class, Subject } from '../lib/supabase'
import { splitIntoRichChunks, formatForEmbedding } from '../lib/chunking'
import type { RichChunk, ChunkType } from '../lib/chunking'
import { generateEmbeddings } from '../lib/embeddings'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

type Page = 'dashboard'|'eleves'|'feedback'|'abonnements'|'rapports'|'courses'|'upload'|'classes'|'subjects'|'parametres'
export type CourseChunk = { title:string; content:string; index:number; images?:string[]; startPage?:number; endPage?:number }

// ── SVG Icons ─────────────────────────────────────────────────────────────────
type IP = { size?: number }
const Ic = {
  Grid:    ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  Users:   ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Msg:     ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Card:    ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Doc:     ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Book:    ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  Up:      ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Bld:     ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  Tag:     ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  Cog:     ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Exit:    ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Bar:     ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Target:  ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Trend:   ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Dl:      ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Plus:    ({size=14}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Ticket:  ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>,
  Send:    ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Save:    ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Trash:   ({size=14}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Edit2:   ({size=14}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  X:       ({size=14}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Back:    ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  Img:     ({size=14}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  ChevUp:  ({size=14}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
  ChevDn:  ({size=14}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Search:  ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Alert:   ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Clock:   ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Check:   ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Refresh: ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Info:    ({size=16}:IP)=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ data, color='#2563EB' }: { data:number[]; color?:string }) {
  if (data.length < 2) return <div style={{width:88,height:36}}/>
  const W=88,H=36, max=Math.max(...data),min=Math.min(...data),rng=max-min||1
  const pts = data.map((v,i)=>({ x:(i/(data.length-1))*W, y:H-4-((v-min)/rng)*(H-8) }))
  const line = pts.map(p=>`${p.x},${p.y}`).join(' ')
  const area = `M ${pts[0].x},${H} `+pts.map(p=>`L ${p.x},${p.y}`).join(' ')+` L ${pts[pts.length-1].x},${H} Z`
  const id = `sp${color.replace(/\W/g,'')}`
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity=".2"/>
        <stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <path d={area} fill={`url(#${id})`}/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Area chart with tooltip ───────────────────────────────────────────────────
function AreaChart({ data, color='#2563EB', period, onPeriod }: {
  data: { label:string; value:number }[]; color?:string; period:string; onPeriod:(p:string)=>void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tip, setTip] = useState<{ idx:number; cx:number; cy:number }|null>(null)

  const W=800, H=200
  const PAD = { t:16, r:20, b:30, l:44 }
  const cW = W-PAD.l-PAD.r, cH = H-PAD.t-PAD.b
  const vals = data.map(d=>d.value)
  const maxV = Math.max(...vals, 1)

  const toX = (i:number) => PAD.l + (i/(data.length-1))*cW
  const toY = (v:number) => PAD.t + (1-v/maxV)*cH

  const pts = data.map((d,i)=>({ x:toX(i), y:toY(d.value) }))

  let linePath = `M ${pts[0].x} ${pts[0].y}`
  for (let i=1;i<pts.length;i++) {
    const p0=pts[i-1], p1=pts[i]
    const cp1x=p0.x+(p1.x-p0.x)*.35, cp2x=p1.x-(p1.x-p0.x)*.35
    linePath += ` C ${cp1x} ${p0.y} ${cp2x} ${p1.y} ${p1.x} ${p1.y}`
  }
  const areaPath = linePath+` L ${pts[pts.length-1].x} ${PAD.t+cH} L ${PAD.l} ${PAD.t+cH} Z`

  const yTicks = [0,.25,.5,.75,1].map(f=>({ v:Math.round(maxV*f), y:PAD.t+(1-f)*cH }))

  const onMove = useCallback((e:React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = ((e.clientX-rect.left)/rect.width)*W
    const chartX = svgX - PAD.l
    const raw = (chartX/cW)*(data.length-1)
    const idx = Math.max(0,Math.min(data.length-1,Math.round(raw)))
    setTip({ idx, cx: toX(idx), cy: toY(data[idx].value) })
  },[data])

  const gid = `ag${color.replace(/\W/g,'')}`

  return (
    <div>
      <div className="card-h" style={{paddingBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <span className="card-t">Activité</span>
          <div className="chart-legend">
            <div className="chart-leg-item"><div className="chart-leg-dot" style={{background:color}}/> Feedbacks reçus</div>
          </div>
        </div>
        <div className="chart-pills">
          {['7j','30j','Tout'].map(p=>(
            <button key={p} className={`chart-pill${period===p?' on':''}`} onClick={()=>onPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:200,display:'block'}}
          onMouseMove={onMove} onMouseLeave={()=>setTip(null)}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity=".18"/>
              <stop offset="85%" stopColor={color} stopOpacity=".02"/>
            </linearGradient>
          </defs>
          {/* grid */}
          {yTicks.map((t,i)=>(
            <g key={i}>
              <line x1={PAD.l} y1={t.y} x2={W-PAD.r} y2={t.y} stroke="#F3F4F6" strokeWidth="1"/>
              <text x={PAD.l-6} y={t.y+4} textAnchor="end" fontSize="9" fill="#9CA3AF">{t.v}</text>
            </g>
          ))}
          {/* area + line */}
          <path d={areaPath} fill={`url(#${gid})`}/>
          <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          {/* x labels */}
          {data.filter((_,i)=>data.length<=14||i%Math.ceil(data.length/14)===0).map((d,_,arr)=>{
            const realIdx = data.indexOf(d)
            return <text key={realIdx} x={toX(realIdx)} y={H-6} textAnchor="middle" fontSize="9" fill="#9CA3AF">{d.label}</text>
          })}
          {/* hover zones */}
          {data.map((_,i)=>{
            const step = cW/(data.length-1)
            return <rect key={i} x={toX(i)-step/2} y={PAD.t} width={step} height={cH} fill="transparent" onMouseEnter={()=>setTip({idx:i,cx:toX(i),cy:toY(data[i].value)})}/>
          })}
          {/* tooltip indicator */}
          {tip && (
            <g>
              <line x1={tip.cx} y1={PAD.t} x2={tip.cx} y2={PAD.t+cH} stroke="#E5E7EB" strokeWidth="1.5" strokeDasharray="4,2"/>
              <circle cx={tip.cx} cy={tip.cy} r="4.5" fill={color} stroke="#fff" strokeWidth="2"/>
            </g>
          )}
        </svg>
        {tip && (
          <div className="chart-tooltip" style={{ left:`${(tip.cx/W)*100}%`, top:`${(tip.cy/H)*100}%` }}>
            {data[tip.idx].value} feedbacks · {data[tip.idx].label}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Avatar colored ────────────────────────────────────────────────────────────
const PALETTE = ['#3B82F6','#10B981','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#EC4899','#F97316']
function Av({ name, size=28 }: { name:string; size?:number }) {
  const h = name.split('').reduce((a,c)=>a+c.charCodeAt(0),0)
  const bg = PALETTE[h % PALETTE.length]
  return (
    <div style={{width:size,height:size,borderRadius:7,background:bg,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:Math.floor(size*.42),fontWeight:700,flexShrink:0}}>
      {name.slice(0,1).toUpperCase()}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV: {sec:string; items:{id:Page; I:React.FC<IP>; lbl:string}[]}[] = [
  {sec:'MENU PRINCIPAL', items:[
    {id:'dashboard',   I:Ic.Grid,   lbl:'Dashboard'},
    {id:'eleves',      I:Ic.Users,  lbl:'Élèves'},
    {id:'feedback',    I:Ic.Msg,    lbl:'Feedback'},
    {id:'abonnements', I:Ic.Card,   lbl:'Abonnements'},
    {id:'rapports',    I:Ic.Doc,    lbl:'Rapports parents'},
  ]},
  {sec:'CONTENU', items:[
    {id:'courses',  I:Ic.Book, lbl:'Cours'},
    {id:'upload',   I:Ic.Up,   lbl:'Ajouter un cours'},
    {id:'classes',  I:Ic.Bld,  lbl:'Classes'},
    {id:'subjects', I:Ic.Tag,  lbl:'Matières'},
  ]},
  {sec:'SYSTÈME', items:[
    {id:'parametres', I:Ic.Cog, lbl:'Paramètres'},
  ]},
]

function Sidebar({ page, setPage, email }: { page:Page; setPage:(p:Page)=>void; email:string }) {
  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-mark">PN</div>
        <div><div className="sb-name">ProfNum</div><div className="sb-role">Administration</div></div>
      </div>
      <nav className="sb-nav">
        {NAV.map(sec=>(
          <div key={sec.sec} className="sb-sec">
            <span className="sb-sec-lbl">{sec.sec}</span>
            {sec.items.map(item=>(
              <button key={item.id} className={`ni${page===item.id?' act':''}`} onClick={()=>setPage(item.id)}>
                <item.I size={14}/>{item.lbl}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-foot">
        <div className="sb-usr">
          <div className="sb-av">{email[0]?.toUpperCase()||'A'}</div>
          <div style={{minWidth:0}}>
            <div className="sb-uname">{email.split('@')[0]}</div>
            <div className="sb-uemail">{email}</div>
          </div>
        </div>
        <button className="sb-out" onClick={()=>supabase.auth.signOut()}><Ic.Exit size={13}/>Déconnexion</button>
      </div>
    </aside>
  )
}

// ── Page header ───────────────────────────────────────────────────────────────
function PH({ title, sub, action }: { title:string; sub?:string; action?:React.ReactNode }) {
  return (
    <div className="ph">
      <div><h1 className="ph-t">{title}</h1>{sub&&<p className="ph-s">{sub}</p>}</div>
      {action&&<div style={{flexShrink:0}}>{action}</div>}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashTab({ courses, classes }: { courses:Course[]; classes:Class[] }) {
  const [fb, setFb]         = useState<any[]>([])
  const [chart, setChart]   = useState<{label:string;value:number}[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [period, setPeriod] = useState('7j')

  const buildChart = useCallback((data: any[], p: string) => {
    const days = p==='7j' ? 7 : p==='30j' ? 30 : 90
    const DAY = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
    const today = new Date()
    const keys: string[] = []
    const buckets: Record<string,number> = {}
    for (let i=days-1; i>=0; i--) {
      const d=new Date(today); d.setDate(d.getDate()-i); const k=d.toDateString()
      buckets[k]=0; keys.push(k)
    }
    data.forEach(f=>{ const k=new Date(f.created_at).toDateString(); if(k in buckets) buckets[k]++ })
    const arr = keys.map(k=>({ label: days<=14 ? DAY[new Date(k).getDay()] : new Date(k).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}), value:buckets[k] }))
    setChart(arr)
  },[])

  useEffect(()=>{
    supabase.from('message_feedback').select('*').order('created_at',{ascending:false}).limit(500)
      .then(({data})=>{
        if (!data) return
        setFb(data); setRecent(data.slice(0,8)); buildChart(data,period)
      })
  },[])

  useEffect(()=>{ if(fb.length) buildChart(fb,period) },[period,fb])

  const total = fb.length
  const up    = fb.filter(f=>f.rating==='up').length
  const pct   = total>0 ? Math.round((up/total)*100) : 0
  const today = new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})

  const spark7 = chart.slice(-7).map(d=>d.value)
  const courseSpark = [0,0,courses.length>1?1:0,...Array(5).fill(0).map((_,i)=>Math.min(i+1,courses.length))].slice(-7)

  return (
    <div>
      <PH title="Dashboard" sub={today.charAt(0).toUpperCase()+today.slice(1)}
        action={<button className="btn-p blue"><Ic.Plus/>Ajouter un cours</button>}
      />

      <div className="kpi-row">
        <div className="kpi">
          <div>
            <div className="kpi-ico"><Ic.Book size={16}/></div>
            <div className="kpi-lbl">Cours chargés</div>
            <div className="kpi-val">{courses.length}</div>
            <div className="kpi-sub">{classes.length} classe{classes.length!==1?'s':''}</div>
          </div>
          <Spark data={courseSpark} color="#2563EB"/>
        </div>
        <div className="kpi">
          <div>
            <div className="kpi-ico"><Ic.Msg size={16}/></div>
            <div className="kpi-lbl">Feedbacks reçus</div>
            <div className="kpi-val">{total.toLocaleString()}</div>
            <div className="kpi-sub">{up} positifs · {total-up} négatifs</div>
          </div>
          <Spark data={spark7.length>0?spark7:[0,0]} color="#059669"/>
        </div>
        <div className="kpi">
          <div>
            <div className="kpi-ico"><Ic.Target size={16}/></div>
            <div className="kpi-lbl">Taux d'approbation</div>
            <div className="kpi-val">{pct}%</div>
            <div className={`kpi-trend ${pct>=70?'up':pct>=50?'flat':'down'}`}>
              {pct>=70?<Ic.ChevUp/>:<Ic.ChevDn/>} {pct>=70?'Objectif atteint':pct>=50?'En progression':'À améliorer'}
            </div>
          </div>
          <Spark data={[40,45,pct-10>0?pct-10:0,pct-5>0?pct-5:0,pct]} color={pct>=70?'#059669':'#D97706'}/>
        </div>
      </div>

      <div className="dg2">
        {/* Chart */}
        <div className="card">
          {chart.length>0
            ? <AreaChart data={chart} color="#2563EB" period={period} onPeriod={setPeriod}/>
            : <div className="card-empty"><div style={{color:'var(--t4)'}}><Ic.Bar size={32}/></div><p>Aucune donnée disponible.</p></div>
          }
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="card-h">
            <span className="card-t">Activité récente</span>
            <span className="badge bg-gy">{recent.length}</span>
          </div>
          {recent.length===0
            ? <div className="card-empty" style={{padding:'28px 16px'}}><p>Aucune activité pour l'instant.</p></div>
            : recent.map((f,i)=>(
                <div key={i} className="feed-row">
                  <Av name={f.course_name||'?'} size={30}/>
                  <div className="feed-info">
                    <div className="feed-q">{f.question?.slice(0,46)||'—'}{(f.question?.length??0)>46?'…':''}</div>
                    <div className="feed-m">{f.course_name||'—'} · {f.student_name||'Anonyme'}</div>
                  </div>
                  <div className="feed-right">
                    <div className="feed-date">{new Date(f.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}</div>
                    <span className={`badge ${f.rating==='up'?'bg-gr':'bg-rd'}`} style={{fontSize:10,padding:'1px 7px'}}>
                      <span className="bd-dot" style={{background:f.rating==='up'?'#059669':'#DC2626'}}/>
                      {f.rating==='up'?'Positif':'Négatif'}
                    </span>
                  </div>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  )
}

// ── Shared page components ────────────────────────────────────────────────────

function MkRow({ items }: { items: { val:string|number; lbl:string; sub?:string; cls?:string }[] }) {
  return (
    <div className="mk-row">
      {items.map((it,i)=>(
        <div key={i} className="mk">
          <div className={`mk-val${it.cls?' '+it.cls:''}`}>{it.val}</div>
          <div className="mk-lbl">{it.lbl}</div>
          {it.sub&&<div className="mk-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function SBar({ value, onChange, placeholder='Rechercher…' }: { value:string; onChange:(v:string)=>void; placeholder?:string }) {
  return (
    <div className="sbar">
      <span className="sbar-ic"><Ic.Search size={13}/></span>
      <input className="sinp" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
      {value&&<button className="sclr" onClick={()=>onChange('')}><Ic.X size={11}/></button>}
    </div>
  )
}

// ── Élèves ────────────────────────────────────────────────────────────────────
function ElevesTab() {
  const [students, setStudents] = useState<any[]>([])
  const [feedback, setFeedback] = useState<any[]>([])
  const [quotas, setQuotas]     = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState<'questions'|'approbation'|'activite'|'classe'>('activite')

  useEffect(()=>{
    Promise.all([
      supabase.from('students').select('*').order('created_at',{ascending:false}),
      supabase.from('message_feedback').select('student_name,rating,course_name,created_at').limit(5000),
      supabase.from('user_quotas').select('user_id,daily_used,last_reset_at'),
    ]).then(([s, fb, q])=>{
      setStudents(s.data||[])
      setFeedback(fb.data||[])
      setQuotas(q.data||[])
      setLoading(false)
    })
  },[])

  // Stats par élève depuis message_feedback
  const fbByName: Record<string,{total:number;up:number;courses:Set<string>;last:string}> = {}
  feedback.forEach(f=>{
    const k=f.student_name||''; if(!k) return
    if(!fbByName[k]) fbByName[k]={total:0,up:0,courses:new Set(),last:f.created_at}
    fbByName[k].total++
    if(f.rating==='up') fbByName[k].up++
    if(f.course_name) fbByName[k].courses.add(f.course_name)
    if(f.created_at>fbByName[k].last) fbByName[k].last=f.created_at
  })

  // Enrichir students avec stats feedback
  const rows = students.map(s=>({
    ...s,
    fb: fbByName[s.name]||null,
    quota: quotas.find(q=>q.user_id===s.user_id)||null,
  }))

  const weekAgo = new Date(Date.now()-7*24*60*60*1000)
  const activeW = rows.filter(r=>r.fb&&new Date(r.fb.last)>weekAgo).length
  const withFb  = rows.filter(r=>r.fb).length
  const totalQ  = Object.values(fbByName).reduce((s,v)=>s+v.total,0)

  const sorted = [...rows].sort((a,b)=>{
    if(sortBy==='questions')   return (b.fb?.total||0)-(a.fb?.total||0)
    if(sortBy==='approbation') return ((b.fb?.up||0)/(b.fb?.total||1))-((a.fb?.up||0)/(a.fb?.total||1))
    if(sortBy==='classe')      return (a.class_name||'').localeCompare(b.class_name||'')
    // activite
    const la = a.fb?.last||a.created_at||''; const lb = b.fb?.last||b.created_at||''
    return lb.localeCompare(la)
  })
  const shown = sorted.filter(r=>
    !search||(r.name||'').toLowerCase().includes(search.toLowerCase())
    ||(r.class_name||'').toLowerCase().includes(search.toLowerCase())
    ||(r.school_name||'').toLowerCase().includes(search.toLowerCase())
  )

  const csv = () => {
    if(!students.length) return
    const hdr='nom,classe,ecole,questions,approuvees,taux,inscription'
    const body=rows.map(r=>`${r.name||''},${r.class_name||''},${r.school_name||''},${r.fb?.total||0},${r.fb?.up||0},${r.fb?Math.round(r.fb.up/r.fb.total*100):0}%,${new Date(r.created_at).toLocaleDateString('fr-FR')}`)
    const blob=new Blob(['﻿'+[hdr,...body].join('\n')],{type:'text/csv;charset=utf-8;'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`eleves-${Date.now()}.csv`;a.click()
  }

  return (
    <div>
      <PH title="Élèves" sub={`${students.length} élève${students.length!==1?'s':''} inscrits`}
        action={<button className="btn-s" onClick={csv} disabled={!students.length}><Ic.Dl size={13}/>Export CSV</button>}
      />
      {!loading && students.length>0 && (
        <MkRow items={[
          { val:students.length, lbl:'Élèves inscrits' },
          { val:activeW,         lbl:'Actifs cette semaine', cls:activeW>0?'mk-hi':'' },
          { val:withFb,          lbl:'Avec feedbacks envoyés', cls:withFb>0?'mk-ok':'' },
          { val:totalQ,          lbl:'Questions posées (total)', cls:'mk-ok' },
        ]}/>
      )}

      {loading ? <div className="ld">Chargement…</div>
        : students.length===0
          ? <div className="card"><div className="card-empty">
              <div style={{color:'var(--t4)'}}><Ic.Users size={36}/></div>
              <p>Aucun élève inscrit.</p>
              <p className="hint">Les élèves apparaissent ici dès qu'ils complètent le profil dans l'application.</p>
            </div></div>
          : <>
              <div className="tbl-bar">
                <SBar value={search} onChange={setSearch} placeholder="Nom, classe, école…"/>
                <div style={{display:'flex',gap:6}}>
                  {(['activite','questions','approbation','classe'] as const).map(s=>(
                    <button key={s} className={`fp${sortBy===s?' on':''}`} onClick={()=>setSortBy(s)}>
                      {s==='activite'?'Récents':s==='questions'?'+ actifs':s==='approbation'?'Meilleure note':'Par classe'}
                    </button>
                  ))}
                </div>
                <span style={{fontSize:12,color:'var(--t4)',marginLeft:'auto'}}>{shown.length} / {students.length}</span>
              </div>
              <div className="card">
                <table className="dt">
                  <thead><tr>
                    <th>#</th><th>Élève</th><th>Classe</th><th>École</th>
                    <th>Questions</th><th>Approbation</th><th>Dernière activité</th>
                  </tr></thead>
                  <tbody>{shown.map((r,i)=>{
                    const fbS = r.fb
                    const pct = fbS ? Math.round(fbS.up/fbS.total*100) : null
                    const lastDate = fbS?.last || r.created_at
                    const daysAgo = Math.floor((Date.now()-new Date(lastDate).getTime())/86400000)
                    const maxQ = Math.max(...shown.map((x:any)=>x.fb?.total||0), 1)
                    return (
                      <tr key={r.user_id||i}>
                        <td className="td-dim" style={{width:32}}>{i+1}</td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:9}}>
                            <Av name={r.name||'?'} size={28}/>
                            <span style={{fontWeight:600}}>{r.name||<span className="td-dim">Sans nom</span>}</span>
                          </div>
                        </td>
                        <td>{r.class_name
                          ? <span className="badge bg-bl" style={{fontSize:11}}>{r.class_name}</span>
                          : <span className="td-dim">—</span>}
                        </td>
                        <td className="td-dim">{r.school_name||'—'}</td>
                        <td>
                          {fbS
                            ? <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{fontWeight:600,minWidth:24}}>{fbS.total}</span>
                                <div className="pbar" style={{width:56}}><div className="pbar-fill" style={{width:`${Math.round(fbS.total/maxQ*100)}%`}}/></div>
                              </div>
                            : <span className="td-dim">—</span>}
                        </td>
                        <td>
                          {pct!==null
                            ? <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <span className={`badge ${pct>=70?'bg-gr':pct>=50?'bg-bl':'bg-rd'}`} style={{fontSize:11}}>{pct}%</span>
                                <span style={{fontSize:11,color:'var(--t4)'}}>{fbS!.up}👍/{fbS!.total-fbS!.up}👎</span>
                              </div>
                            : <span className="td-dim">—</span>}
                        </td>
                        <td>
                          {daysAgo===0 ? <span className="mk-hi" style={{fontSize:12,fontWeight:500}}>Aujourd'hui</span>
                          :daysAgo===1 ? <span className="mk-ok" style={{fontSize:12}}>Hier</span>
                          :daysAgo<=7  ? <span style={{fontSize:12,color:'var(--t2)'}}>Il y a {daysAgo}j</span>
                          :<span className="td-dim" style={{fontSize:12}}>{new Date(lastDate).toLocaleDateString('fr-FR')}</span>}
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </>
      }
    </div>
  )
}

// ── Feedback ──────────────────────────────────────────────────────────────────
function FeedbackTab() {
  const [rows, setRows]       = useState<any[]>([])
  const [filter, setFilter]   = useState<'all'|'up'|'down'>('all')
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string|null>(null)

  useEffect(()=>{
    supabase.from('message_feedback').select('*').order('created_at',{ascending:false}).limit(1000)
      .then(({data})=>{ setRows(data||[]); setLoading(false) })
  },[])

  const getProfInfo = (courseName:string='') => {
    const n = courseName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    if(n.includes('svt')||n.includes('biolog')||n.includes('naturel')||n.includes('vivant')) return {name:'Prof. Ibrahima',emoji:'🌿',color:'#0D6E4F',key:'svt'}
    if(n.includes('math')) return {name:'Prof. Sidi Mohamed',emoji:'📐',color:'#1D4ED8',key:'math'}
    if(n.includes('fran')||n.includes('lettr')) return {name:'Prof. Mokhtar',emoji:'✍️',color:'#9D174D',key:'francais'}
    if(n.includes('histoir')||n.includes('geo')) return {name:'Prof. Abdallah',emoji:'🌍',color:'#92400E',key:'histoire'}
    if(n.includes('physi')) return {name:'Prof. Oumar',emoji:'⚛️',color:'#4C1D95',key:'physique'}
    if(n.includes('chimi')) return {name:'Prof. Ismaïl',emoji:'🧪',color:'#6D28D9',key:'chimie'}
    if(n.includes('arab')) return {name:'Prof. Abderrahmane',emoji:'📖',color:'#065F46',key:'arabe'}
    if(n.includes('info')||n.includes('techno')) return {name:'Prof. Yahya',emoji:'💻',color:'#1E3A5F',key:'info'}
    if(n.includes('angla')||n.includes('english')) return {name:'Prof. Aminetou',emoji:'🇬🇧',color:'#7C3AED',key:'anglais'}
    if(n.includes('islam')) return {name:'Prof. Cheikh Moussa',emoji:'☪️',color:'#134E4A',key:'islamique'}
    if(n.includes('civiq')) return {name:'Prof. El Hacen',emoji:'🏛️',color:'#1E3A5F',key:'civique'}
    return {name:'Prof. Moctar',emoji:'📚',color:'#1A3A6B',key:'default'}
  }

  // Stats par professeur
  const profMap: Record<string,{name:string;emoji:string;color:string;total:number;up:number;courses:Set<string>}> = {}
  rows.forEach(r=>{
    const p = getProfInfo(r.course_name)
    if(!profMap[p.key]) profMap[p.key]={name:p.name,emoji:p.emoji,color:p.color,total:0,up:0,courses:new Set()}
    profMap[p.key].total++
    if(r.rating==='up') profMap[p.key].up++
    if(r.course_name) profMap[p.key].courses.add(r.course_name)
  })
  const profList = Object.values(profMap).sort((a,b)=>(a.up/a.total)-(b.up/b.total))

  // Réponses IA récurrentes rejetées (groupées par réponse similaire)
  const rejMap: Record<string,{question:string;response:string;count:number;course:string}> = {}
  rows.filter(r=>r.rating==='down'&&r.response).forEach(r=>{
    const key = (r.response||'').trim().toLowerCase().slice(0,80)
    if(!rejMap[key]) rejMap[key]={question:r.question||'',response:r.response||'',count:0,course:r.course_name||'—'}
    rejMap[key].count++
  })
  const topRej = Object.values(rejMap).sort((a,b)=>b.count-a.count).slice(0,6)

  const up  = rows.filter(r=>r.rating==='up').length
  const dn  = rows.length-up
  const pct = rows.length>0?Math.round((up/rows.length)*100):0

  const shown = rows.filter(r=>{
    if(filter==='up'&&r.rating!=='up') return false
    if(filter==='down'&&r.rating!=='down') return false
    if(search&&!(r.question?.toLowerCase().includes(search.toLowerCase())||r.course_name?.toLowerCase().includes(search.toLowerCase())||r.student_name?.toLowerCase().includes(search.toLowerCase()))) return false
    return true
  })

  return (
    <div>
      <PH title="Feedback" sub="Analyse par professeur — identifiez les réponses à améliorer"/>

      {!loading&&rows.length>0&&(
        <MkRow items={[
          {val:rows.length, lbl:'Total cumulé'},
          {val:up,          lbl:'Approuvées',  cls:up>0?'mk-hi':''},
          {val:dn,          lbl:'Rejetées',    cls:dn>up?'mk-err':''},
          {val:`${pct}%`,   lbl:'Taux global', cls:pct>=70?'mk-hi':pct>=50?'mk-ok':'mk-err'},
        ]}/>
      )}

      {/* ── Par professeur ── */}
      {!loading&&profList.length>0&&(
        <>
          <div className="sec-div">Par professeur</div>
          <div className="prof-grid">
            {profList.map(p=>{
              const rate = p.total>0?Math.round((p.up/p.total)*100):0
              const col  = rate>=70?'#059669':rate>=50?'#D97706':'#DC2626'
              return (
                <div key={p.name} className="prof-card">
                  <div className="prof-top">
                    <div className="prof-av" style={{background:p.color+'1A',color:p.color}}>{p.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="prof-name">{p.name}</div>
                      <div className="prof-meta">{p.courses.size} cours · {p.total} retours</div>
                    </div>
                    <div className="prof-rate" style={{color:col}}>{rate}%</div>
                  </div>
                  <div className="prof-bar-bg">
                    <div className="prof-bar-fill" style={{width:`${rate}%`,background:col}}/>
                  </div>
                  <div className="prof-legs">
                    <span style={{color:'#059669'}}>{p.up} 👍</span>
                    <span style={{color:'#DC2626'}}>{p.total-p.up} 👎</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Questions fréquemment rejetées ── */}
      {!loading&&topRej.length>0&&(
        <>
          <div className="sec-div" style={{display:'flex',alignItems:'center',gap:8}}>
            <span>Réponses IA fréquemment rejetées</span>
            <span className="badge bg-rd" style={{fontSize:10,padding:'2px 8px'}}>Réponse à améliorer</span>
          </div>
          <div className="card" style={{marginBottom:20}}>
            {topRej.map((r,i)=>(
              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'14px 20px',borderBottom:i<topRej.length-1?'1px solid var(--bdr2)':'none'}}>
                <div style={{width:26,height:26,borderRadius:7,background:'#FEE2E2',color:'#DC2626',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>{r.count}×</div>
                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:8}}>
                  <div>
                    <div style={{fontSize:10.5,fontWeight:600,color:'var(--t4)',marginBottom:3,textTransform:'uppercase',letterSpacing:.05}}>Question élève</div>
                    <div style={{fontSize:12.5,color:'var(--t3)',fontStyle:'italic'}}>"{r.question?.slice(0,100)}{(r.question?.length??0)>100?'…':''}"</div>
                  </div>
                  <div>
                    <div style={{fontSize:10.5,fontWeight:600,color:'#DC2626',marginBottom:3,textTransform:'uppercase',letterSpacing:.05}}>Réponse IA rejetée 👎</div>
                    <div style={{fontSize:13,color:'var(--t1)',lineHeight:1.5}}>{r.response.slice(0,160)}{r.response.length>160?'…':''}</div>
                  </div>
                  <div style={{fontSize:11.5,color:'var(--t4)'}}>{r.course}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Table détaillée avec expand ── */}
      {loading?<div className="ld">Chargement…</div>:<>
        <div className="sec-div">Tous les feedbacks</div>
        <div className="tbl-bar">
          <SBar value={search} onChange={setSearch} placeholder="Question, cours, élève…"/>
          <div style={{display:'flex',gap:6}}>
            {(['all','up','down'] as const).map(f=>(
              <button key={f} className={`fp${filter===f?' on':''}`} onClick={()=>setFilter(f)}>
                {f==='all'?`Tous (${rows.length})`:f==='up'?`👍 Approuvés (${up})`:`👎 Rejetés (${dn})`}
              </button>
            ))}
          </div>
          <span style={{fontSize:12,color:'var(--t4)',marginLeft:'auto'}}>{shown.length} résultat{shown.length!==1?'s':''}</span>
        </div>
        <div className="card">
          {shown.length===0
            ?<div className="card-empty"><div style={{color:'var(--t4)'}}><Ic.Msg size={34}/></div><p>Aucun feedback ne correspond.</p></div>
            :<table className="dt">
              <thead><tr>
                <th>Professeur</th><th>Cours</th><th>Question</th><th>Statut</th><th>Élève</th><th>Date</th><th></th>
              </tr></thead>
              <tbody>
                {shown.map((r,i)=>{
                  const prof   = getProfInfo(r.course_name)
                  const rowKey = r.id||String(i)
                  const open   = expanded===rowKey
                  return (
                    <Fragment key={rowKey}>
                      <tr style={{cursor:'pointer'}} onClick={()=>setExpanded(open?null:rowKey)}>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:7}}>
                            <span style={{fontSize:17}}>{prof.emoji}</span>
                            <span style={{fontWeight:600,fontSize:12.5,color:prof.color}}>{prof.name}</span>
                          </div>
                        </td>
                        <td style={{fontWeight:500,fontSize:12.5,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.course_name||'—'}</td>
                        <td className="td-trunc" style={{maxWidth:240,fontSize:13}}>{r.question?.slice(0,72)||'—'}{(r.question?.length??0)>72?'…':''}</td>
                        <td><span className={`badge ${r.rating==='up'?'bg-gr':'bg-rd'}`}><span className="bd-dot" style={{background:r.rating==='up'?'#059669':'#DC2626'}}/>{r.rating==='up'?'Approuvé':'Rejeté'}</span></td>
                        <td className="td-dim">{r.student_name||'Anonyme'}</td>
                        <td className="td-dim" style={{whiteSpace:'nowrap'}}>{new Date(r.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}</td>
                        <td style={{textAlign:'center',color:'var(--t4)',width:28}}>{open?<Ic.ChevUp size={13}/>:<Ic.ChevDn size={13}/>}</td>
                      </tr>
                      {open&&(
                        <tr>
                          <td colSpan={7} style={{padding:0,background:'var(--bg)',borderBottom:'2px solid var(--bdr)'}}>
                            <div style={{display:'flex'}}>
                              <div style={{flex:1,padding:'16px 20px',borderRight:'1px solid var(--bdr)'}}>
                                <div className="fb-expand-lbl">Question complète</div>
                                <div className="fb-expand-box">{r.question||'—'}</div>
                              </div>
                              <div style={{flex:1.4,padding:'16px 20px'}}>
                                <div className="fb-expand-lbl" style={{color:r.rating==='down'?'#DC2626':undefined}}>
                                  Réponse IA{r.rating==='down'?' — À revoir':''}
                                </div>
                                <div className="fb-expand-box" style={{maxHeight:180,overflowY:'auto',whiteSpace:'pre-wrap',color:'var(--t2)'}}>{r.response||'—'}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          }
        </div>
      </>}
    </div>
  )
}

// ── Abonnements ───────────────────────────────────────────────────────────────
const PLANS: Record<string,string> = { freemium:'Gratuit','1_matiere':'1 Matière (350 MRU)','3_matieres':'Pack 3 (800 MRU)',complet:'Pack Complet (1 100 MRU)' }
const PLAN_MRU: Record<string,number> = { freemium:0,'1_matiere':350,'3_matieres':800,complet:1100 }

function AbonnementsTab() {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setForm]   = useState(false)
  const [coupon, setCoupon]   = useState('')
  const [copied, setCopied]   = useState(false)
  const [act, setAct]         = useState(false)
  const [renewing, setRenewing] = useState<string|null>(null)
  const [filterS, setFilterS] = useState<'all'|'active'|'expired'>('all')
  const [form, setFv]         = useState({ phone:'', plan:'1_matiere', months:'1', notes:'' })

  const load = () => supabase.from('subscriptions').select('*').order('created_at',{ascending:false}).then(({data})=>{ setRows(data||[]); setLoading(false) })
  useEffect(()=>{ load() },[])

  const now = new Date()
  const in7 = new Date(Date.now()+7*24*60*60*1000)
  const isActive  = (r:any) => r.status==='active' && new Date(r.end_at)>now
  const isExpiring= (r:any) => isActive(r) && new Date(r.end_at)<in7
  const mrr = rows.filter(isActive).reduce((s,r)=>s+(PLAN_MRU[r.plan]||0),0)
  const activeCount  = rows.filter(isActive).length
  const expiring7    = rows.filter(isExpiring).length

  const shown = rows.filter(r=>filterS==='all'?true:filterS==='active'?isActive(r):!isActive(r))

  const genCoupon = () => { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; setCoupon(Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join('')); setCopied(false) }
  const copy = () => navigator.clipboard.writeText(coupon).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) })

  const submit = async (e:React.FormEvent) => {
    e.preventDefault(); setAct(true)
    const end = new Date(); end.setMonth(end.getMonth()+parseInt(form.months))
    const {error} = await supabase.from('subscriptions').insert({ phone:form.phone, plan:form.plan, start_at:new Date().toISOString(), end_at:end.toISOString(), status:'active', payment_method:'cash_agent', notes:form.notes })
    if (error) alert('Erreur : '+error.message)
    else { setForm(false); setFv({phone:'',plan:'1_matiere',months:'1',notes:''}); load() }
    setAct(false)
  }

  const renew = async (id:string, end_at:string) => {
    setRenewing(id)
    const newEnd = new Date(end_at); newEnd.setMonth(newEnd.getMonth()+1)
    await supabase.from('subscriptions').update({ end_at:newEnd.toISOString(), status:'active' }).eq('id',id)
    load(); setRenewing(null)
  }

  return (
    <div>
      <PH title="Abonnements" sub="Gestion des abonnements et revenus"
        action={<div style={{display:'flex',gap:8}}>
          <button className="btn-s" onClick={genCoupon}><Ic.Ticket size={13}/>Coupon cash</button>
          <button className="btn-p blue" onClick={()=>setForm(s=>!s)}><Ic.Plus/>{showForm?'Annuler':'Activer manuellement'}</button>
        </div>}
      />
      {!loading && (
        <MkRow items={[
          { val:`${mrr.toLocaleString()} MRU`, lbl:'MRR estimé', sub:'Revenus récurrents mensuels', cls:mrr>0?'mk-hi':'' },
          { val:activeCount,   lbl:'Abonnements actifs', cls:activeCount>0?'mk-ok':'' },
          { val:expiring7,     lbl:'Expirant dans 7 jours', cls:expiring7>0?'mk-warn':'' },
          { val:rows.length,   lbl:'Total enregistrés' },
        ]}/>
      )}
      {coupon&&(
        <div className="coupon">
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}><Ic.Ticket size={14}/><span className="coupon-lbl">Code coupon agent</span></div>
          <span className="coupon-code">{coupon}</span>
          <button className="btn-s" style={{fontSize:12,padding:'4px 11px'}} onClick={copy}>{copied?'✓ Copié':'Copier'}</button>
          <button className="btn-ic" style={{marginLeft:'auto'}} onClick={()=>setCoupon('')}><Ic.X/></button>
        </div>
      )}
      {showForm&&(
        <div className="card" style={{marginBottom:20,padding:24}}>
          <div style={{fontSize:14,fontWeight:600,color:'var(--t1)',marginBottom:6}}>Activer un abonnement</div>
          <div style={{fontSize:12.5,color:'var(--t3)',marginBottom:18}}>Pour les paiements en espèces via agent ou Bankily/Masrivi/Sedad.</div>
          <form onSubmit={submit} className="fgap">
            <div className="fg2">
              <div className="fc"><label>Téléphone élève</label><input value={form.phone} onChange={e=>setFv(f=>({...f,phone:e.target.value}))} placeholder="22xxxxxxxx" required/></div>
              <div className="fc"><label>Plan</label><select value={form.plan} onChange={e=>setFv(f=>({...f,plan:e.target.value}))}>{Object.entries(PLANS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              <div className="fc"><label>Durée</label><select value={form.months} onChange={e=>setFv(f=>({...f,months:e.target.value}))}><option value="1">1 mois</option><option value="3">3 mois (−10%)</option><option value="12">1 an (−25%)</option></select></div>
              <div className="fc"><label>Notes</label><input value={form.notes} onChange={e=>setFv(f=>({...f,notes:e.target.value}))} placeholder="ex : agent Tevragh-Zeina, réf. #42"/></div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button type="submit" className="btn-p blue" disabled={act}><Ic.Save size={13}/>{act?'Activation…':'Confirmer l\'activation'}</button>
              <span style={{fontSize:12,color:'var(--t3)'}}>Montant : <strong>{PLAN_MRU[form.plan]||0} MRU</strong> × {form.months} mois = <strong>{(PLAN_MRU[form.plan]||0)*parseInt(form.months)} MRU</strong></span>
            </div>
          </form>
        </div>
      )}
      {expiring7>0&&!showForm&&(
        <div className="warn-banner">
          <Ic.Alert size={15}/> <span><strong>{expiring7} abonnement{expiring7>1?'s':''}</strong> expire{expiring7>1?'nt':''} dans moins de 7 jours. Contactez les élèves pour le renouvellement.</span>
        </div>
      )}
      {loading ? <div className="ld">Chargement…</div>
        : rows.length===0
          ? <div className="card"><div className="card-empty"><div style={{color:'var(--t4)'}}><Ic.Card size={36}/></div><p>Aucun abonnement enregistré.</p><p className="hint">Utilisez le formulaire ci-dessus pour les premiers abonnés payant en espèces.</p></div></div>
          : <>
              <div className="tbl-bar">
                {(['all','active','expired'] as const).map(f=>(
                  <button key={f} className={`fp${filterS===f?' on':''}`} onClick={()=>setFilterS(f)}>
                    {f==='all'?`Tous (${rows.length})`:f==='active'?`Actifs (${activeCount})`:`Expirés (${rows.length-activeCount})`}
                  </button>
                ))}
                <span style={{fontSize:12,color:'var(--t4)',marginLeft:'auto'}}>{shown.length} résultat{shown.length!==1?'s':''}</span>
              </div>
              <div className="card">
                <table className="dt">
                  <thead><tr><th>Téléphone / ID</th><th>Plan</th><th>Valeur</th><th>Statut</th><th>Début</th><th>Expiration</th><th>Règlement</th><th>Action</th></tr></thead>
                  <tbody>{shown.map((r,i)=>{
                    const ok=isActive(r); const exp=isExpiring(r)
                    return (
                      <tr key={r.id||i} className={exp?'row-warn':!ok&&r.status==='active'?'row-dead':''}>
                        <td><div style={{display:'flex',alignItems:'center',gap:6}}>{exp&&<span title="Expire bientôt" style={{color:'#D97706'}}><Ic.Alert size={13}/></span>}{r.phone?<span style={{fontWeight:500}}>{r.phone}</span>:<span className="td-mono">{r.user_id?.slice(0,14)||'—'}</span>}</div></td>
                        <td><span className="badge bg-bl">{PLANS[r.plan]||r.plan||'—'}</span></td>
                        <td style={{fontWeight:600,color:'var(--t1)'}}>{PLAN_MRU[r.plan]?`${PLAN_MRU[r.plan]} MRU`:'—'}</td>
                        <td><span className={`badge ${ok?'bg-gr':exp?'bg-yl':'bg-gy'}`}><span className="bd-dot" style={{background:ok?'#059669':exp?'#D97706':'#D1D5DB'}}/>{ok?'Actif':exp?'Exp. bientôt':'Expiré'}</span></td>
                        <td className="td-dim">{r.start_at?new Date(r.start_at).toLocaleDateString('fr-FR'):'—'}</td>
                        <td className={exp?'mk-warn':'td-dim'} style={{fontWeight:exp?600:400}}>{r.end_at?new Date(r.end_at).toLocaleDateString('fr-FR'):'—'}</td>
                        <td className="td-dim">{r.payment_method==='cash_agent'?'Espèces':r.payment_method||'—'}</td>
                        <td>
                          <button className="act-pill" onClick={()=>renew(r.id,r.end_at||new Date().toISOString())} disabled={renewing===r.id} title="Prolonger de 1 mois">
                            {renewing===r.id?'…':<><Ic.Refresh size={11}/>+1 mois</>}
                          </button>
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </>
      }
    </div>
  )
}

// ── Rapports ──────────────────────────────────────────────────────────────────
function RapportsTab() {
  const [liens, setLiens]   = useState<any[]>([])
  const [raps, setRaps]     = useState<any[]>([])
  const [loading, setLoad]  = useState(true)
  const [sending, setSend]  = useState<string|null>(null)

  useEffect(()=>{
    Promise.all([
      supabase.from('parent_links').select('*').order('created_at',{ascending:false}),
      supabase.from('parent_reports').select('*').order('week_start',{ascending:false}).limit(200),
    ]).then(([l,r])=>{ setLiens(l.data||[]); setRaps(r.data||[]); setLoad(false) })
  },[])

  const lastRap = (sid:string) => raps.find(r=>r.student_id===sid)
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
  const rapsThisMonth = raps.filter(r=>new Date(r.created_at||r.week_start)>=monthStart).length
  const verified = liens.filter(l=>l.verified).length
  const inactive5 = liens.filter(l=>{
    // We don't have last_activity from liens but we can show who hasn't been sent a report recently
    const lr=lastRap(l.student_id)
    if(!lr) return true
    const d=new Date(lr.week_start); return (Date.now()-d.getTime())>5*24*60*60*1000
  }).length

  const gen = async (sid:string) => {
    setSend(sid)
    await supabase.from('parent_reports').insert({ student_id:sid, week_start:new Date().toISOString().split('T')[0], report_json:JSON.stringify({generated_at:new Date().toISOString()}) })
    const {data} = await supabase.from('parent_reports').select('*').order('week_start',{ascending:false}).limit(200)
    setRaps(data||[]); setSend(null)
  }

  return (
    <div>
      <PH title="Rapports parents" sub="Suivi des liaisons parent-élève et envoi des rapports hebdomadaires"/>
      {!loading && (
        <MkRow items={[
          { val:liens.length,   lbl:'Liaisons enregistrées' },
          { val:verified,       lbl:'Numéros vérifiés', cls:verified>0?'mk-hi':'' },
          { val:rapsThisMonth,  lbl:'Rapports ce mois', cls:rapsThisMonth>0?'mk-ok':'' },
          { val:inactive5,      lbl:'En attente de rapport', cls:inactive5>0?'mk-warn':'' },
        ]}/>
      )}
      {inactive5>0&&!loading&&(
        <div className="warn-banner">
          <Ic.Clock size={15}/>
          <span><strong>{inactive5} élève{inactive5>1?'s':''}</strong> n'ont pas reçu de rapport depuis plus de 5 jours. Cliquez "Générer" pour envoyer une mise à jour aux parents.</span>
        </div>
      )}
      {loading ? <div className="ld">Chargement…</div>
        : liens.length===0
          ? <div className="card"><div className="card-empty">
              <div style={{color:'var(--t4)'}}><Ic.Doc size={36}/></div>
              <p>Aucune liaison parent-élève.</p>
              <p className="hint">Les liaisons apparaissent automatiquement quand un élève saisit le numéro de son parent dans les paramètres de l'application.</p>
            </div></div>
          : <div className="card">
              <table className="dt">
                <thead><tr>
                  <th>Identifiant élève</th><th>Téléphone parent</th>
                  <th>Vérifié</th><th>Liaison</th><th>Dernier rapport</th><th>Rapport suivant</th><th>Action</th>
                </tr></thead>
                <tbody>{liens.map((l,i)=>{
                  const lr = lastRap(l.student_id)
                  const needsReport = !lr || (Date.now()-new Date(lr.week_start).getTime())>5*24*60*60*1000
                  return (
                    <tr key={l.id||i} className={needsReport&&l.active?'row-warn':''}>
                      <td><span className="td-mono">{l.student_id?.slice(0,14)||'—'}</span></td>
                      <td style={{fontWeight:500}}>{l.parent_phone||'—'}</td>
                      <td><span className={`badge ${l.verified?'bg-gr':'bg-yl'}`}><span className="bd-dot" style={{background:l.verified?'#059669':'#D97706'}}/>{l.verified?'Vérifié':'En attente'}</span></td>
                      <td><span className={`badge ${l.active?'bg-gr':'bg-gy'}`}><span className="bd-dot" style={{background:l.active?'#059669':'#D1D5DB'}}/>{l.active?'Active':'Inactive'}</span></td>
                      <td className="td-dim">{lr?new Date(lr.week_start).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'2-digit'}):'Jamais'}</td>
                      <td>
                        {!l.active?<span className="td-dim">—</span>
                        :needsReport?<span className="mk-warn" style={{fontSize:12,fontWeight:500,display:'flex',alignItems:'center',gap:4}}><Ic.Alert size={11}/>À envoyer</span>
                        :<span className="mk-hi" style={{fontSize:12,display:'flex',alignItems:'center',gap:4}}><Ic.Check size={11}/>À jour</span>}
                      </td>
                      <td>
                        <button className="btn-tbl" onClick={()=>gen(l.student_id)} disabled={sending===l.student_id||!l.active}>
                          <span style={{display:'flex',alignItems:'center',gap:5}}>
                            <Ic.Send size={11}/>{sending===l.student_id?'Envoi…':'Générer'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
      }
    </div>
  )
}

// ── Paramètres ────────────────────────────────────────────────────────────────
function ParametresTab() {
  const [q, setQ]     = useState({freemium:3,mat1:20,mat3:20,complet:50,mastery:70,inactivity:5,trial:7})
  const [saved, setSaved] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')

  useEffect(()=>{
    supabase.from('app_settings').select('*').then(({data})=>{
      if(!data) return
      const quotaRow = data.find(r=>r.key==='quotas')
      if(quotaRow?.value) { try { const v=JSON.parse(quotaRow.value); setQ(p=>({...p,...v})) } catch {} }
    })
  },[])

  const save = async () => {
    await supabase.from('app_settings').upsert({key:'quotas',value:JSON.stringify(q)})
    setSaved(true); setTimeout(()=>setSaved(false),2200)
  }

  const QR = [
    {k:'freemium', lbl:'Freemium',             hint:'Accès gratuit, sans carte',       col:'#9CA3AF', badge:'bg-gy'},
    {k:'mat1',     lbl:'1 Matière',             hint:'350 MRU / mois',                  col:'#2563EB', badge:'bg-bl'},
    {k:'mat3',     lbl:'Pack 3 Matières',       hint:'800 MRU / mois',                  col:'#7C3AED', badge:'bg-pu'},
    {k:'complet',  lbl:'Pack Complet',          hint:'1 100 MRU / mois — toutes matières', col:'#059669', badge:'bg-gr'},
  ]

  return (
    <div>
      <PH title="Paramètres" sub="Configuration des quotas, seuils pédagogiques et tarification"/>

      {/* Quotas */}
      <div className="sec-div">Quotas d'utilisation</div>
      <div className="sgrid">
        <div className="card">
          <div className="card-h">
            <span className="card-t">Questions par jour</span>
            <span style={{fontSize:12,color:'var(--t3)'}}>Par plan d'abonnement</span>
          </div>
          {QR.map(r=>(
            <div key={r.k} className="sr">
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span className="sr-dot" style={{background:r.col}}/>
                  <span className="sr-lbl">{r.lbl}</span>
                  <span className={`badge ${r.badge}`} style={{fontSize:10,padding:'1px 7px'}}>{r.hint}</span>
                </div>
              </div>
              <div className="si-wrap">
                <input type="number" className="si" value={q[r.k as keyof typeof q]} onChange={e=>setQ(p=>({...p,[r.k]:parseInt(e.target.value)||0}))} min={0} max={9999}/>
                <span className="si-u">q/j</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Pédagogie */}
          <div className="card">
            <div className="card-h"><span className="card-t">Pédagogie</span></div>
            <div className="sr">
              <div>
                <div className="sr-lbl">Seuil de maîtrise chapitre</div>
                <div className="sr-hint">Score minimum pour débloquer le chapitre suivant dans le SkillTree</div>
              </div>
              <div className="si-wrap"><input type="number" className="si" value={q.mastery} onChange={e=>setQ(p=>({...p,mastery:parseInt(e.target.value)||70}))} min={50} max={100}/><span className="si-u">%</span></div>
            </div>
            <div className="sr">
              <div>
                <div className="sr-lbl">Alerte inactivité parent</div>
                <div className="sr-hint">Envoyer notification WhatsApp si aucune session après N jours</div>
              </div>
              <div className="si-wrap"><input type="number" className="si" value={q.inactivity} onChange={e=>setQ(p=>({...p,inactivity:parseInt(e.target.value)||5}))} min={1} max={30}/><span className="si-u">jours</span></div>
            </div>
            <div className="sr">
              <div>
                <div className="sr-lbl">Durée de l'essai gratuit</div>
                <div className="sr-hint">Jours d'accès au plan 1 Matière avant paiement</div>
              </div>
              <div className="si-wrap"><input type="number" className="si" value={q.trial} onChange={e=>setQ(p=>({...p,trial:parseInt(e.target.value)||7}))} min={1} max={30}/><span className="si-u">jours</span></div>
            </div>
          </div>

          {/* Save */}
          <div className="card" style={{padding:'16px 20px'}}>
            <button className="btn-p" style={{width:'100%',justifyContent:'center',...(saved?{background:'#059669'}:{})}} onClick={save}>
              <Ic.Save size={13}/>{saved?'Paramètres enregistrés !':'Enregistrer tous les paramètres'}
            </button>
          </div>
        </div>
      </div>

      {/* Tarification */}
      <div className="sec-div">Grille tarifaire</div>
      <div className="card">
        <div className="card-h">
          <span className="card-t">Plans d'abonnement (MRU)</span>
          <div className="info-banner" style={{margin:0,padding:'6px 12px',border:'none',background:'none',fontSize:12,color:'var(--t3)'}}>
            <Ic.Info size={12}/> Cours particulier standard : 1 250 MRU/mois pour 1 seule matière
          </div>
        </div>
        <table className="dt">
          <thead><tr><th>Plan</th><th>Prix mensuel</th><th>Prix annuel</th><th>Économie annuelle</th><th>Questions/jour</th><th>Profil cible</th><th>vs Cours particulier</th></tr></thead>
          <tbody>
            {[
              {p:'Freemium',    m:'Gratuit',   a:'—',          s:'—',   q:q.freemium, t:'Découverte',        c:'—',                    b:'bg-gy'},
              {p:'1 Matière',   m:'350 MRU',   a:'3 150 MRU',  s:'-25%',q:q.mat1,    t:'1 matière difficile',c:'× 3.6 moins cher',     b:'bg-bl'},
              {p:'Pack 3',      m:'800 MRU',   a:'7 200 MRU',  s:'-25%',q:q.mat3,    t:'Prépa examens',      c:'× 1.6 moins cher',     b:'bg-pu'},
              {p:'Pack Complet',m:'1 100 MRU', a:'9 900 MRU',  s:'-25%',q:q.complet, t:'Très motivé',        c:'Même prix, TOUT inclus',b:'bg-gr'},
            ].map(r=>(
              <tr key={r.p}>
                <td><span className={`badge ${r.b}`}>{r.p}</span></td>
                <td style={{fontWeight:700,color:'var(--t1)'}}>{r.m}</td>
                <td className="td-dim">{r.a}</td>
                <td>{r.s!=='—'?<span className="badge bg-gr">{r.s}</span>:<span className="td-dim">—</span>}</td>
                <td><span className="badge bg-gy">{r.q} q/j</span></td>
                <td className="td-dim">{r.t}</td>
                <td style={{fontWeight:500,color:'var(--green)'}}>{r.c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── PDF utils (unchanged logic) ───────────────────────────────────────────────
const GK=import.meta.env.VITE_GEMINI_API_KEY||''
const GU='https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'

async function r2b64(pdf:any,n:number):Promise<string>{const p=await pdf.getPage(n);const v=p.getViewport({scale:1.8});const c=document.createElement('canvas');c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c.toDataURL('image/jpeg',.85).split(',')[1]}
async function extractBatch(pdf:any,s:number,e:number):Promise<{pageNum:number;text:string}[]>{const ps:any[]=[],n=e-s+1;for(let i=s;i<=e;i++)ps.push({inline_data:{mime_type:'image/jpeg',data:await r2b64(pdf,i)}});ps.push({text:`OCR expert manuels mauritaniens. Extrais ${n} pages (${s} à ${e}). [PAGE:N] obligatoire. Titres Chapitre/Unité sur ligne séparée. Pas de commentaire.`});const r=await fetch(`${GU}?key=${GK}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:ps}],generationConfig:{temperature:.1,maxOutputTokens:8192}})});if(!r.ok)throw new Error(`Gemini ${s}-${e}: ${r.status}`);const raw=(await r.json()).candidates?.[0]?.content?.parts?.[0]?.text||'';const out:{pageNum:number;text:string}[]=[];const seg=raw.split(/\[PAGE:(\d+)\]/g);for(let i=1;i<seg.length;i+=2){const pn=parseInt(seg[i]);const t=(seg[i+1]||'').trim();if(pn>=s&&pn<=e&&t)out.push({pageNum:pn,text:t})}if(!out.length&&raw.trim())for(let i=s;i<=e;i++)out.push({pageNum:i,text:raw.trim()});return out}
async function extractPDF(file:File,onP?:(m:string)=>void):Promise<{text:string;pages:number}>{const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const n=pdf.numPages;const texts:string[]=[];if(!GK){onP?.('Mode basique (ajoutez VITE_GEMINI_API_KEY pour la vision OCR)…');for(let i=1;i<=n;i++){const pg=await pdf.getPage(i);const c=await pg.getTextContent();const t=(c.items as any[]).map((it:any)=>it.str).filter(Boolean).join(' ');if(t.trim())texts.push(`[PAGE:${i}]\n${t}`)}return{text:texts.join('\n\n'),pages:n}}for(let s=1;s<=n;s+=5){const e=Math.min(s+4,n);onP?.(`Vision OCR — pages ${s}–${e} / ${n}…`);try{const rs=await extractBatch(pdf,s,e);for(const{pageNum:pn,text:t}of rs)if(t.trim())texts.push(`[PAGE:${pn}]\n${t}`)}catch{for(let i=s;i<=e;i++){try{const pg=await pdf.getPage(i);const c=await pg.getTextContent();const t=(c.items as any[]).map((it:any)=>it.str).filter(Boolean).join(' ');if(t.trim())texts.push(`[PAGE:${i}]\n${t}`)}catch{}}}if(e<n){onP?.(`${e}/${n} pages traitées, pause…`);await new Promise(r=>setTimeout(r,4200))}}return{text:texts.join('\n\n'),pages:n}}

function sN(l:string){return l.trim().replace(/^\d{1,3}\s+/,'').replace(/^IPN\s*/i,'').replace(/^\*+/,'').replace(/^#+\s*/,'').trim()}
function isToc(l:string){const t=l.trim();return t.length<=90&&(/\s\d{1,3}\s*$/.test(t)||/\.{3,}\s*\d{1,3}\s*$/.test(t))}
function isMaj(l:string){const t=sN(l);if(!t||t.length>160||isToc(t))return false;return /^(unit[eé]s?|ch[a]?pitres?|parties?|le[cç]ons?|th[eè]mes?|s[eé]quences?|modules?|sections?)\s*[\d:IVXivx]/i.test(t)}
function cTitle(txt:string):string|null{if(!/^(unit[eé]|ch[a]?pitres?|parties?|le[cç]ons?|th[eè]mes?|s[eé]quences?|modules?)\s*[\dIVXivx]/i.test(txt))return null;let end=Math.min(txt.length,180);const stop=txt.search(/\s+\d+[\.\-]\s+[A-ZÀ-Ü]|\s+Je\s+[a-z]|\s+Activit[eé]|\s+Consigne|\s+Exercice/i);if(stop>10&&stop<200)end=stop;return txt.slice(0,end).trim()}
function isTOC(t:string){return((t.match(/\s{2,}\d{1,3}(?:\s|$)/g))||[]).length>=3}
function splitChapters(text:string):CourseChunk[]{const segs=text.split(/\[PAGE:(\d+)\]/);const pgs:{num:number;raw:string}[]=[];for(let i=1;i<segs.length;i+=2){const raw=(segs[i+1]||'').trim();if(raw)pgs.push({num:parseInt(segs[i]),raw})}if(pgs.length>=3){const chunks:CourseChunk[]=[];let tt='Introduction',cc:string[]=[],sp=pgs[0].num;const fl=(ep:number)=>{const c=cc.join('\n\n').trim();if(c.length>30)chunks.push({title:tt,content:c,index:chunks.length,startPage:sp,endPage:ep});cc=[]};for(const{num,raw}of pgs){const clean=raw.replace(/^\d{1,3}\s+/,'').replace(/^IPN\s*/i,'').trim();const t=cTitle(clean);if(t){fl(num-1);tt=t;sp=num;const rest=clean.slice(t.length).trim();if(rest.length>10)cc.push(rest)}else if(!isTOC(clean))cc.push(clean)}fl(pgs[pgs.length-1].num);if(chunks.length>=2)return chunks.map((c,i)=>({...c,index:i}))}const ls=text.split('\n');const chunks:CourseChunk[]=[];let tt='Introduction',ll:string[]=[],cp=1,sp2=1,lp=1;const fl2=(ep=lp)=>{const c=ll.join('\n').trim();if(c.length>30)chunks.push({title:tt,content:c,index:chunks.length,startPage:sp2,endPage:ep});ll=[]};for(const ln of ls){const m=ln.match(/^\[PAGE:(\d+)\]$/);if(m){cp=parseInt(m[1]);continue}if(isMaj(ln)){fl2(cp-1>sp2?cp-1:cp);tt=sN(ln);sp2=cp;lp=cp}else if(!isToc(ln)){lp=cp;ll.push(ln)}}fl2();if(chunks.length>=2)return chunks;const ps=text.replace(/\[PAGE:\d+\]/g,'').split(/\n\s*\n/).filter(p=>p.trim().length>80);const g:CourseChunk[]=[];for(let i=0;i<ps.length;i+=3)g.push({title:`Partie ${g.length+1}`,content:ps.slice(i,i+3).join('\n\n'),index:g.length});return g.length>0?g:[{title:'Contenu du cours',content:text,index:0}]}

// ── Subject color palette ─────────────────────────────────────────────────────
const SUB_COLORS: Record<string,string> = {
  'svt':'#10B981','sciences':'#10B981','biologie':'#10B981',
  'math':'#2563EB','maths':'#2563EB','mathématiques':'#2563EB',
  'physique':'#7C3AED','chimie':'#7C3AED','physique-chimie':'#7C3AED',
  'français':'#F59E0B','lettres':'#F59E0B',
  'histoire':'#EF4444','géographie':'#EF4444',
  'anglais':'#06B6D4','langues':'#06B6D4',
  'philosophie':'#8B5CF6','arabe':'#D97706',
}
function subjectColor(name:string):string {
  const k = name.toLowerCase()
  for (const [pattern, color] of Object.entries(SUB_COLORS)) {
    if (k.includes(pattern)) return color
  }
  // fallback: hash-based color
  const COLORS=['#2563EB','#7C3AED','#059669','#D97706','#EF4444','#06B6D4','#EC4899']
  return COLORS[name.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % COLORS.length]
}

// ── Courses tab ───────────────────────────────────────────────────────────────
function CoursesTab({ courses, onDelete }: { courses:Course[]; onDelete:()=>void }) {
  const [del, setDel]         = useState<string|null>(null)
  const [edit, setEdit]       = useState<Course|null>(null)
  const [search, setSearch]   = useState('')
  const [filterClass, setFC]  = useState('')
  const [filterSub, setFS]    = useState('')

  const doDelete = async (c:Course) => {
    if(!confirm(`Supprimer « ${c.name} » ? Irréversible.`))return; setDel(c.id)
    await supabase.storage.from('courses').remove([c.pdf_path])
    await supabase.from('courses').delete().eq('id',c.id)
    setDel(null); onDelete()
  }

  const allClasses  = [...new Set(courses.map(c=>c.classes?.name||'Sans classe'))]
  const allSubjects = [...new Set(courses.map(c=>c.subjects?.name||'').filter(Boolean))]

  const filtered = courses.filter(c=>{
    if(search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if(filterClass && (c.classes?.name||'Sans classe')!==filterClass) return false
    if(filterSub && c.subjects?.name!==filterSub) return false
    return true
  })

  const grouped:Record<string,Course[]>={}
  filtered.forEach(c=>{const k=c.classes?.name||'Sans classe';if(!grouped[k])grouped[k]=[];grouped[k].push(c)})

  const nc = (c:Course) => { try { return c.chunks?JSON.parse(c.chunks).length:0 } catch { return 0 } }

  return (
    <div>
      <PH title="Cours" sub={`${courses.length} cours chargé${courses.length!==1?'s':''}`}/>
      {!courses.length
        ? <div className="card"><div className="card-empty">
            <div style={{color:'var(--t4)'}}><Ic.Book size={36}/></div>
            <p>Aucun cours chargé.</p>
            <p className="hint">Utilisez l'onglet "Ajouter un cours" pour importer votre premier PDF.</p>
          </div></div>
        : <>
            <div className="tbl-bar">
              <SBar value={search} onChange={setSearch} placeholder="Rechercher par titre de cours…"/>
              <select className="sinp" style={{flex:'unset',width:'auto',paddingLeft:10}} value={filterClass} onChange={e=>setFC(e.target.value)}>
                <option value="">Toutes les classes</option>
                {allClasses.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select className="sinp" style={{flex:'unset',width:'auto',paddingLeft:10}} value={filterSub} onChange={e=>setFS(e.target.value)}>
                <option value="">Toutes les matières</option>
                {allSubjects.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              {(search||filterClass||filterSub)&&(
                <button className="btn-g" style={{fontSize:12}} onClick={()=>{setSearch('');setFC('');setFS('')}}>
                  <Ic.X size={11}/>Effacer les filtres
                </button>
              )}
              <span style={{fontSize:12,color:'var(--t4)',marginLeft:'auto'}}>{filtered.length} / {courses.length}</span>
            </div>
            {edit&&<ChapModal course={edit} onClose={()=>setEdit(null)} onSaved={()=>{ setEdit(null); onDelete() }}/>}
            {Object.keys(grouped).length===0
              ? <div className="card"><div className="card-empty"><div style={{color:'var(--t4)'}}><Ic.Search size={28}/></div><p>Aucun résultat pour ces filtres.</p></div></div>
              : Object.entries(grouped).sort().map(([cls,items])=>(
                  <div key={cls} style={{marginBottom:24}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <span style={{fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.07em'}}>{cls}</span>
                      <span className="course-count-badge">{items.length} cours</span>
                    </div>
                    <div className="card" style={{padding:0}}>
                      {items.map(c=>{
                        const count=nc(c); const col=subjectColor(c.subjects?.name||'')
                        const initials=(c.subjects?.name||c.name).slice(0,2).toUpperCase()
                        return (
                          <div key={c.id} className="crd-row">
                            <div className="crd-av" style={{background:col}}>{initials}</div>
                            <div className="crd-body">
                              <div className="crd-name">{c.name}</div>
                              <div className="crd-chips">
                                {c.subjects?.name&&<span className="badge bg-gy" style={{fontSize:10.5,padding:'2px 8px'}}>{c.subjects.name}</span>}
                                {count>0
                                  ? <span className="badge bg-bl" style={{fontSize:10.5,padding:'2px 8px'}}>{count} chapitres</span>
                                  : <span className="badge" style={{background:'#FEF3C7',color:'#92400E',fontSize:10.5,padding:'2px 8px'}}>Pas encore indexé</span>
                                }
                                {c.pages&&<span className="crd-date">{c.pages} pages</span>}
                                <span className="crd-date">· {new Date(c.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'2-digit'})}</span>
                              </div>
                            </div>
                            <div className="crd-act">
                              <button className="btn-s" style={{fontSize:12,padding:'6px 12px',gap:5}} onClick={()=>setEdit(c)}>
                                <Ic.Edit2 size={12}/>Chapitres
                              </button>
                              <button className="btn-ic del" onClick={()=>doDelete(c)} disabled={del===c.id} title="Supprimer">
                                {del===c.id?<span style={{fontSize:11}}>…</span>:<Ic.Trash/>}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
            }
          </>
      }
    </div>
  )
}

// ── Upload ────────────────────────────────────────────────────────────────────
function UploadTab({ classes, subjects, onSuccess }: { classes:Class[]; subjects:Subject[]; onSuccess:()=>void }) {
  const [name,setName]=useState('')
  const [cid,setCid]=useState('')
  const [sid2,setSid2]=useState('')
  const [file,setFile]=useState<File|null>(null)
  const [up,setUp]=useState(false)
  const [prog,setProg]=useState('')
  const [err,setErr]=useState('')
  const [step,setStep]=useState(0) // 0=info, 1=processing, 2=done
  const [dragOver,setDragOver]=useState(false)
  const ref=useRef<HTMLInputElement>(null)

  const handleDrop=(e:React.DragEvent)=>{
    e.preventDefault(); setDragOver(false)
    const f=e.dataTransfer.files[0]
    if(f&&f.type==='application/pdf') setFile(f)
    else setErr('Seuls les fichiers PDF sont acceptés.')
  }

  const stepLabels=['Informations','Traitement OCR','Terminé']
  const curStep = up?1:step

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault()
    if(!file||!cid||!sid2||!name.trim()){setErr('Tous les champs sont requis.');return}
    setUp(true);setErr('');setStep(1);setProg('Lecture du PDF…')
    let text='',pages=0
    try{const r=await extractPDF(file,setProg);text=r.text;pages=r.pages;if(text.trim().length<30){setErr('PDF vide ou illisible — essayez un PDF avec du texte natif.');setUp(false);setStep(0);setProg('');return}}
    catch(ex:any){setErr(`Erreur PDF : ${ex?.message}`);setUp(false);setStep(0);setProg('');return}
    setProg('Upload du fichier…')
    const path=`${cid}/${sid2}/${Date.now()}.${file.name.split('.').pop()||'pdf'}`
    const{error:ue}=await supabase.storage.from('courses').upload(path,file,{upsert:false})
    if(ue){setErr(ue.message);setUp(false);setStep(0);setProg('');return}
    setProg('Analyse de la structure du cours…')
    const dc=splitChapters(text);const rc=splitIntoRichChunks(text)
    setProg('Enregistrement dans Supabase…')
    const{data:nc,error:de}=await supabase.from('courses').insert({class_id:cid,subject_id:sid2,name:name.trim(),pdf_path:path,pages,content:text,chunks:JSON.stringify(dc)}).select().single()
    if(de){setErr(de.message);setUp(false);setStep(0);setProg('');return}
    setProg(`Génération des embeddings pgvector (${rc.length} chunks)…`)
    try{const embs=await generateEmbeddings(rc.map(c=>formatForEmbedding(c,name.trim())));await supabase.from('course_chunks').insert(rc.map((c,i)=>({course_id:nc.id,chunk_index:i,title:c.title,content:c.content,embedding:embs[i],chunk_type:c.chunkType,start_page:c.startPage??null,end_page:c.endPage??null,images:c.images??[],word_count:c.wordCount})))}
    catch(ex:any){alert('Cours sauvegardé mais embeddings échoués : '+ex.message)}
    setUp(false);setStep(2);setProg('')
    setTimeout(()=>{ setName('');setCid('');setSid2('');setFile(null);if(ref.current)ref.current.value='';setStep(0);onSuccess() },1200)
  }

  return (
    <div>
      <PH title="Ajouter un cours" sub="Upload PDF avec extraction OCR Gemini Vision et indexation pgvector pour le RAG"/>

      {/* Steps */}
      <div className="steps" style={{marginBottom:28}}>
        {stepLabels.map((lbl,i)=>(
          <React.Fragment key={i}>
            <div className={`step${curStep>i?' done':curStep===i?' cur':''}`}>
              <div className="step-num">{curStep>i?<Ic.Check size={10}/>:i+1}</div>
              <span>{lbl}</span>
            </div>
            {i<stepLabels.length-1&&<div className={`step-line${curStep>i?' done':''}`}/>}
          </React.Fragment>
        ))}
      </div>

      {step===2
        ? <div className="card"><div className="card-empty"><div style={{color:'var(--green)'}}><Ic.Check size={40}/></div><p style={{color:'var(--green)'}}>Cours chargé avec succès !</p><p className="hint">Redirection vers la liste des cours…</p></div></div>
        : <form onSubmit={submit} style={{maxWidth:580}}>
            {/* Drag zone */}
            <div
              className={`dz${file?' has-file':''}${dragOver?' over':''}`}
              onClick={()=>ref.current?.click()}
              onDragOver={e=>{e.preventDefault();setDragOver(true)}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="dz-ico"><Ic.Up size={28}/></div>
              {file
                ? <>
                    <div className="dz-main" style={{color:'var(--green)'}}>{file.name}</div>
                    <div className="dz-hint">{(file.size/1024/1024).toFixed(1)} MB · Cliquez pour changer</div>
                  </>
                : <>
                    <div className="dz-main">Glissez votre PDF ici ou cliquez pour parcourir</div>
                    <div className="dz-hint">Format PDF uniquement · Taille max recommandée : 50 MB</div>
                  </>
              }
              <input ref={ref} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>{ const f=e.target.files?.[0]; if(f)setFile(f) }}/>
            </div>

            {/* Fields */}
            <div className="uf">
              <div className="ufield">
                <label>Titre du cours</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="ex : SVT — Génétique et hérédité (Chap. 3)" required disabled={up}/>
              </div>
              <div className="urow2">
                <div className="ufield">
                  <label>Classe cible</label>
                  <select value={cid} onChange={e=>setCid(e.target.value)} required disabled={up}>
                    <option value="">Sélectionner…</option>
                    {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="ufield">
                  <label>Matière</label>
                  <select value={sid2} onChange={e=>setSid2(e.target.value)} required disabled={up}>
                    <option value="">Sélectionner…</option>
                    {subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {err&&<p className="merr">{err}</p>}
              {prog&&(
                <div className="info-banner">
                  <Ic.Refresh size={13}/>
                  <span>{prog}</span>
                </div>
              )}
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <button type="submit" className="btn-p blue" disabled={up||!file}>
                  <Ic.Up size={13}/>{up?'Traitement en cours…':'Lancer l\'extraction et l\'upload'}
                </button>
                {!classes.length&&<span style={{fontSize:12,color:'var(--red)'}}>Aucune classe — créez-en une d'abord</span>}
                {!subjects.length&&<span style={{fontSize:12,color:'var(--red)'}}>Aucune matière — créez-en une d'abord</span>}
              </div>
            </div>
          </form>
      }
    </div>
  )
}

// ── Classes + Subjects ────────────────────────────────────────────────────────
function EntityGrid<T extends {id:string;name:string}>({
  title, sub, items, courses, table, onRefresh, colorFn
}: {
  title:string; sub:string; items:T[]; courses:Course[]; table:string;
  onRefresh:()=>void; colorFn:(name:string)=>string
}) {
  const [v,setV]=useState('')
  const [adding,setAdding]=useState(false)
  const [showForm,setShowForm]=useState(false)
  const [editing,setEditing]=useState<{id:string;name:string}|null>(null)

  const add=async(e:React.FormEvent)=>{
    e.preventDefault();if(!v.trim())return;setAdding(true)
    await supabase.from(table).insert({name:v.trim()})
    setV('');setAdding(false);setShowForm(false);onRefresh()
  }
  const del=async(id:string,name:string)=>{
    const cnt=courses.filter(c=>(c as any)[`${table.slice(0,-2)}_id`]===id).length
    if(!confirm(`Supprimer « ${name} » ?${cnt>0?` ${cnt} cours liés seront supprimés.`:''}`))return
    await supabase.from(table).delete().eq('id',id);onRefresh()
  }
  const rename=async()=>{
    if(!editing?.name.trim())return
    await supabase.from(table).update({name:editing.name.trim()}).eq('id',editing.id)
    setEditing(null);onRefresh()
  }

  return (
    <div>
      <PH title={title} sub={sub} action={
        <button className="btn-p blue" onClick={()=>setShowForm(s=>!s)}>
          <Ic.Plus/>{showForm?'Annuler':'Ajouter'}
        </button>
      }/>
      {showForm&&(
        <form onSubmit={add} style={{display:'flex',gap:8,marginBottom:20,maxWidth:400}}>
          <input className="sinp" value={v} onChange={e=>setV(e.target.value)}
            placeholder={table==='classes'?'ex : 1ère AS Sciences':'ex : SVT, Mathématiques…'} required autoFocus/>
          <button type="submit" className="btn-p blue" disabled={adding}><Ic.Check size={13}/>{adding?'…':'Valider'}</button>
        </form>
      )}
      <div className="entity-grid">
        {items.map(item=>{
          const cnt=courses.filter(c=>(c as any)[`${table.slice(0,-2)}_id`]===item.id).length
          const col=colorFn(item.name)
          return (
            <div key={item.id} className={`entity-card${editing?.id===item.id?' editing':''}`}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
                <div className="entity-av" style={{background:col}}>
                  {item.name.slice(0,2).toUpperCase()}
                </div>
                <div style={{display:'flex',gap:4}}>
                  <button className="btn-ic" style={{width:26,height:26}} onClick={()=>setEditing(editing?.id===item.id?null:{id:item.id,name:item.name})} title="Renommer">
                    <Ic.Edit2 size={12}/>
                  </button>
                  <button className="btn-ic del" style={{width:26,height:26}} onClick={()=>del(item.id,item.name)} title="Supprimer">
                    <Ic.Trash size={12}/>
                  </button>
                </div>
              </div>
              {editing?.id===item.id
                ? <div style={{display:'flex',gap:6,marginTop:4}}>
                    <input className="entity-edit-inp" value={editing.name}
                      onChange={e=>setEditing(p=>p?{...p,name:e.target.value}:p)}
                      onKeyDown={e=>e.key==='Enter'&&rename()} autoFocus/>
                    <button className="btn-p blue" style={{padding:'4px 10px',fontSize:12,flexShrink:0}} onClick={rename}>OK</button>
                  </div>
                : <>
                    <div className="entity-name">{item.name}</div>
                    <div className="entity-meta">{cnt} cours chargé{cnt!==1?'s':''}</div>
                  </>
              }
            </div>
          )
        })}
        <div className="entity-add" onClick={()=>{ setShowForm(true); setTimeout(()=>document.querySelector<HTMLInputElement>('.entity-edit-inp, form .sinp')?.focus(),50) }}>
          <Ic.Plus size={20}/>
          <span>Ajouter {table==='classes'?'une classe':'une matière'}</span>
        </div>
      </div>
      {!items.length&&!showForm&&(
        <p style={{color:'var(--t4)',fontSize:13,marginTop:16}}>Aucun{table==='subjects'?'e':''} {table==='classes'?'classe':'matière'}. Cliquez sur "Ajouter" pour commencer.</p>
      )}
    </div>
  )
}

function ClassesTab({ classes, courses, onRefresh }: { classes:Class[]; courses:Course[]; onRefresh:()=>void }) {
  const classColor = (name:string) => {
    const COLS=['#2563EB','#7C3AED','#059669','#D97706','#EF4444','#06B6D4','#EC4899','#F97316']
    return COLS[name.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%COLS.length]
  }
  return <EntityGrid title="Classes" sub={`${classes.length} classe${classes.length!==1?'s':''} · ${courses.length} cours au total`}
    items={classes} courses={courses} table="classes" onRefresh={onRefresh} colorFn={classColor}/>
}

function SubjectsTab({ subjects, courses, onRefresh }: { subjects:Subject[]; courses:Course[]; onRefresh:()=>void }) {
  return <EntityGrid title="Matières" sub={`${subjects.length} matière${subjects.length!==1?'s':''}`}
    items={subjects} courses={courses} table="subjects" onRefresh={onRefresh} colorFn={subjectColor}/>
}

// ── Chapter editor modal — split panel ───────────────────────────────────────
function ChapModal({ course, onClose, onSaved }: { course:Course; onClose:()=>void; onSaved:()=>void }) {
  const [chunks, setChunks] = useState<CourseChunk[]>(()=>{try{return course.chunks?JSON.parse(course.chunks):[]}catch{return[]}})
  const [sel, setSel]       = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty]   = useState(false)
  const [upl, setUpl]       = useState(false)
  const imgRef              = useRef<HTMLInputElement>(null)

  // Local edit state for selected chunk
  const cur = chunks[sel]
  const [title, setTitle]     = useState(cur?.title||'')
  const [content, setContent] = useState(cur?.content||'')
  const [imgs, setImgs]       = useState<string[]>(cur?.images||[])

  useEffect(()=>{
    const c=chunks[sel]
    if(c){ setTitle(c.title); setContent(c.content); setImgs(c.images||[]) }
  },[sel])

  const commitEdit = ()=>{
    setChunks(p=>p.map((ch,i)=>i===sel?{...ch,title,content,images:imgs}:ch))
    setDirty(true)
  }

  const addChunk = ()=>{
    commitEdit()
    const nc:CourseChunk={title:'Nouveau chapitre',content:'',index:chunks.length}
    setChunks(p=>[...p,nc])
    const newIdx=chunks.length
    setSel(newIdx); setTitle('Nouveau chapitre'); setContent(''); setImgs([])
    setDirty(true)
  }

  const delChunk = (i:number, e:React.MouseEvent)=>{
    e.stopPropagation()
    if(!confirm('Supprimer ce chapitre ?'))return
    const next = chunks.filter((_,j)=>j!==i).map((c,j)=>({...c,index:j}))
    setChunks(next)
    const newSel=Math.min(sel,next.length-1)
    setSel(newSel<0?0:newSel)
    if(next[newSel<0?0:newSel]){const c=next[newSel<0?0:newSel];setTitle(c.title);setContent(c.content);setImgs(c.images||[])}
    setDirty(true)
  }

  const uploadImg = async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const fs=Array.from(e.target.files||[]);if(!fs.length)return;setUpl(true)
    const ni:string[]=[]
    for(const f of fs){
      const p=`course-images/${course.id}/${sel}/${Date.now()}_${f.name}`
      const{error}=await supabase.storage.from('courses').upload(p,f,{upsert:true})
      if(!error){const{data}=supabase.storage.from('courses').getPublicUrl(p);if(data.publicUrl)ni.push(data.publicUrl)}
    }
    const newImgs=[...imgs,...ni]; setImgs(newImgs)
    setChunks(p=>p.map((ch,i)=>i===sel?{...ch,images:newImgs}:ch))
    setUpl(false);if(imgRef.current)imgRef.current.value=''
  }

  const saveAll = async()=>{
    commitEdit()
    setSaving(true)
    const ri = chunks.map((c,i)=>({...c,title:i===sel?title:c.title,content:i===sel?content:c.content,images:i===sel?imgs:c.images,index:i}))
    const{error}=await supabase.from('courses').update({chunks:JSON.stringify(ri)}).eq('id',course.id)
    if(error){setSaving(false);alert('Erreur : '+error.message);return}
    try{
      const rc:RichChunk[]=ri.map(c=>({title:c.title,content:c.content,chunkType:'content' as ChunkType,index:c.index,startPage:c.startPage,endPage:c.endPage,wordCount:c.content.trim().split(/\s+/).length,images:c.images}))
      const embs=await generateEmbeddings(rc.map(c=>formatForEmbedding(c,course.name)))
      await supabase.from('course_chunks').delete().eq('course_id',course.id)
      await supabase.from('course_chunks').insert(rc.map((c,i)=>({course_id:course.id,chunk_index:i,title:c.title,content:c.content,embedding:embs[i],chunk_type:c.chunkType,start_page:c.startPage??null,end_page:c.endPage??null,images:c.images??[],word_count:c.wordCount})))
    }catch(ex:any){alert('Sauvegardé, embeddings échoués : '+ex.message)}
    setSaving(false);setDirty(false);onSaved()
  }

  const col = subjectColor(course.subjects?.name||'')

  return (
    <div className="mo" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="chap-modal">
        {/* Header */}
        <div className="chap-modal-h">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:32,height:32,borderRadius:8,background:col,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:800,flexShrink:0}}>
              {(course.subjects?.name||course.name).slice(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--t1)'}}>{course.name}</div>
              <div style={{fontSize:11.5,color:'var(--t3)',marginTop:1}}>{chunks.length} chapitre{chunks.length!==1?'s':''} · {chunks.reduce((s,c)=>s+c.content.length,0).toLocaleString()} caractères</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {dirty&&<span style={{fontSize:11.5,color:'var(--yel)',fontWeight:500}}>Modifications non sauvegardées</span>}
            <button className="btn-s" style={{fontSize:12}} onClick={onClose}>Fermer</button>
            <button className="btn-p blue" onClick={saveAll} disabled={saving}>
              <Ic.Save size={13}/>{saving?'Sauvegarde…':'Sauvegarder'}
            </button>
          </div>
        </div>

        {/* Body: split panel */}
        <div className="chap-modal-body">
          {/* Left — chapter list */}
          <div className="chap-list-panel">
            <div style={{padding:'10px 10px 6px',borderBottom:'1px solid var(--bdr2)',fontSize:11,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.07em'}}>
              Chapitres
            </div>
            <div className="chap-list-scroll">
              {chunks.length===0&&(
                <div style={{textAlign:'center',padding:'32px 12px',color:'var(--t4)',fontSize:12.5}}>
                  Aucun chapitre.<br/>Cliquez sur "Ajouter".
                </div>
              )}
              {chunks.map((ch,i)=>(
                <div key={i} className={`chap-item${sel===i?' sel':''}`} onClick={()=>{ commitEdit(); setSel(i) }}>
                  <div className="chap-num-b">{i+1}</div>
                  <div className="chap-item-body">
                    <div className="chap-item-title">{i===sel?title:ch.title}</div>
                    <div className="chap-item-chars">{(i===sel?content:ch.content).length.toLocaleString()} car.</div>
                  </div>
                  <button className="btn-ic del" style={{width:22,height:22,flexShrink:0}} onClick={e=>delChunk(i,e)}><Ic.X size={11}/></button>
                </div>
              ))}
            </div>
            <div className="chap-list-foot">
              <button className="btn-g" style={{width:'100%',justifyContent:'center',fontSize:12.5}} onClick={addChunk}>
                <Ic.Plus size={13}/>Ajouter un chapitre
              </button>
            </div>
          </div>

          {/* Right — editor */}
          {chunks.length===0
            ? <div className="chap-empty-panel">
                <div style={{color:'var(--t4)'}}><Ic.Book size={36}/></div>
                <p style={{fontSize:13.5,fontWeight:500,color:'var(--t3)'}}>Aucun chapitre pour l'instant</p>
                <p style={{fontSize:12,color:'var(--t4)'}}>Cliquez sur "Ajouter un chapitre" pour commencer.</p>
              </div>
            : <div className="chap-edit-panel">
                <div className="chap-edit-scroll">
                  {/* Title */}
                  <div>
                    <label className="chap-lbl">Titre du chapitre</label>
                    <input className="chap-title-inp" value={title} onChange={e=>{setTitle(e.target.value);setDirty(true)}}
                      placeholder="ex : Unité I — Introduction aux SVT" autoComplete="off"/>
                  </div>
                  {/* Content */}
                  <div style={{flex:1,display:'flex',flexDirection:'column'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
                      <label className="chap-lbl" style={{marginBottom:0}}>Contenu du chapitre</label>
                      <span style={{fontSize:10.5,color:'var(--t4)'}}>{content.length.toLocaleString()} caractères · {Math.round(content.trim().split(/\s+/).filter(Boolean).length)} mots</span>
                    </div>
                    <textarea className="chap-content-ta" value={content}
                      onChange={e=>{setContent(e.target.value);setDirty(true)}}
                      placeholder="Collez ici le texte extrait du manuel. Ce contenu sera découpé en sous-chunks pour le RAG…"
                      style={{minHeight:320}}
                    />
                  </div>
                  {/* Images */}
                  <div>
                    <label className="chap-lbl">Illustrations ({imgs.length})</label>
                    <div className="chap-imgs-row">
                      {imgs.map((img,i)=>(
                        <div key={i} className="chap-img-card">
                          <img src={img} className="chap-img-thumb" alt=""/>
                          <button className="chap-img-del" onClick={()=>{const ni=imgs.filter((_,j)=>j!==i);setImgs(ni);setDirty(true)}}><Ic.X size={8}/></button>
                        </div>
                      ))}
                      <button className="chap-img-add-btn" onClick={()=>imgRef.current?.click()} disabled={upl}>
                        <Ic.Img size={14}/>{upl?'…':'Ajouter'}
                      </button>
                      <input ref={imgRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={uploadImg}/>
                    </div>
                  </div>
                </div>
                <div className="chap-edit-foot">
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:12,color:'var(--t3)'}}>Chapitre {sel+1} / {chunks.length}</span>
                    {sel>0&&<button className="btn-g" style={{fontSize:12}} onClick={()=>{commitEdit();setSel(sel-1)}}><Ic.Back size={12}/>Précédent</button>}
                    {sel<chunks.length-1&&<button className="btn-g" style={{fontSize:12}} onClick={()=>{commitEdit();setSel(sel+1)}}>Suivant<Ic.Trend size={12}/></button>}
                  </div>
                  <button className="btn-p blue" onClick={saveAll} disabled={saving}>
                    <Ic.Save size={13}/>{saving?'Sauvegarde en cours…':'Sauvegarder tout'}
                  </button>
                </div>
              </div>
          }
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage({ session }: { session:Session }) {
  const [page, setPage]     = useState<Page>('dashboard')
  const [courses, setCourses] = useState<Course[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [subjects, setSubs]   = useState<Subject[]>([])
  const [rk, setRk]           = useState(0)
  const refresh = () => setRk(k=>k+1)

  useEffect(()=>{
    Promise.all([
      supabase.from('courses').select('*,classes(name),subjects(name)').order('created_at',{ascending:false}),
      supabase.from('classes').select('*').order('name'),
      supabase.from('subjects').select('*').order('name'),
    ]).then(([c,cl,s])=>{
      if(c.data)setCourses(c.data as Course[])
      if(cl.data)setClasses(cl.data as Class[])
      if(s.data)setSubs(s.data as Subject[])
    })
  },[rk])

  return (
    <div className="al">
      <Sidebar page={page} setPage={setPage} email={session.user.email}/>
      <main className="am">
        <div className="ac">
          {page==='dashboard'   && <DashTab courses={courses} classes={classes}/>}
          {page==='eleves'      && <ElevesTab/>}
          {page==='feedback'    && <FeedbackTab/>}
          {page==='abonnements' && <AbonnementsTab/>}
          {page==='rapports'    && <RapportsTab/>}
          {page==='courses'     && <CoursesTab courses={courses} onDelete={refresh}/>}
          {page==='upload'      && <UploadTab classes={classes} subjects={subjects} onSuccess={()=>{ refresh(); setPage('courses') }}/>}
          {page==='classes'     && <ClassesTab classes={classes} courses={courses} onRefresh={refresh}/>}
          {page==='subjects'    && <SubjectsTab subjects={subjects} courses={courses} onRefresh={refresh}/>}
          {page==='parametres'  && <ParametresTab/>}
        </div>
      </main>
    </div>
  )
}
