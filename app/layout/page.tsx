'use client'

import { useState, useMemo, useEffect, useRef } from 'react'

/* ============================================================
   Classroom Planner — top-down room layout tool.
   Geometry is in INCHES. Front wall = top.
   Data model is plain JSON (room ft+in, desks, teacher desks,
   doors) so it can be POSTed to a backend later unchanged.

   STORAGE: persistence runs through the small `Store` adapter
   below. It currently uses the browser's localStorage so the
   page works on its own. To move to a backend later, replace
   the two methods with API calls, keeping the same shapes:
     get(key)        -> { value: "<json string>" }  (or null)
     set(key, value) -> anything  (value is already a JSON string)
   The whole list of saved layouts is stored under one key, so a
   single GET/PUT pair is enough to start.
   ============================================================ */

const Store = {
  async get(key: string): Promise<{ value: string } | null> {
    try {
      const v = localStorage.getItem(key)
      return v == null ? null : { value: v }
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<{ ok: boolean } | null> {
    try {
      localStorage.setItem(key, value)
      return { ok: true }
    } catch {
      return null
    }
  },
}

/* ---------------- types ---------------- */

type Item = { cx: number; cy: number; w: number; d: number; rot: number; seats?: number; ada?: boolean }
type Wall = 'left' | 'right' | 'top' | 'bottom'
type DoorT = { wall: Wall; pos: number; len?: number }
type Room = { w: number; l: number }
type Desk = { w: number; d: number; seats: number }
type Sp = { aisle: number; rowGap: number; front: number; perim: number }
type SelKind = 'desk' | 'teacher' | 'door'
type Sel = { kind: SelKind; idx: number } | null
type Box = { l: number; r: number; t: number; b: number }
type BuildResult = { desks: Item[]; cap: number }
type LayoutKind = 'grid' | 'u' | 'perim' | 'lanes'
type LayoutDef = {
  id: string
  name: string
  kind: LayoutKind
  cCols?: number
  cRows?: number
  rings?: number
  facing?: 'in' | 'out'
  blurb: string
}
type Saved = {
  id: string
  name: string
  createdAt: number
  count: number
  roomWft: number
  roomWin: number
  roomLft: number
  roomLin: number
  deskW: number
  deskD: number
  deskSeats: number
  layoutId: string
  target: number
  fillMax: boolean
  showADA: boolean
  aisle: number
  rowGap: number
  front: number
  perim: number
  manual: boolean
  studentDesks: Item[] | null
  teachers: Item[]
  doors: DoorT[]
}

/* ---------------- palette ---------------- */

const C = {
  shell: '#EDEFF2', paper: '#FFFFFF', line: '#D7DBE0', lineSoft: '#E8EBEE',
  ink: '#1A1E23', muted: '#5E656D', faint: '#969CA4',
  accent: '#3C5A99', accentDeep: '#2C4475', accentSoft: '#EDF1F8',
  amber: '#A9671C', amberSoft: '#F4EADA',
  floor: '#FFFFFF', grid: '#EEF1F3', gridStrong: '#E1E5E9', wall: '#373C42',
  deskFill: '#E9ECF0', deskEdge: '#525A63', chair: '#CCD2D9',
  sage: '#5C7762', sageSoft: '#E7EEE9', ok: '#2E7A50', warn: '#AE3A29',
}

/* Drawing palettes. `C` styles the app chrome (panels, buttons); the floor plan
   itself is themed by one of these so we can switch between a clean CAD/drafting
   look and the original colored look without touching the UI. Keys mirror the
   subset of `C` that the SVG components use, so a component just reads `pal.x`. */
const PAL_COLOR = {
  floor: C.floor, grid: C.grid, gridStrong: C.gridStrong, wall: C.wall,
  accent: C.accent, faint: C.faint, deskFill: C.deskFill, deskEdge: C.deskEdge,
  chair: C.chair, amber: C.amber, amberSoft: C.amberSoft, sage: C.sage,
  sageSoft: C.sageSoft, muted: C.muted, warn: C.warn, paper: C.paper, ok: C.ok,
  wallHatch: null as string | null, wallFill: C.wall, rx: 1.5, showGrid: true,
}
type Pal = typeof PAL_COLOR
const PAL_CAD: Pal = {
  ...PAL_COLOR,
  grid: '#F2F2F2', gridStrong: '#E6E6E6', wall: '#202020', accent: '#202020',
  faint: '#8A8A8A', deskFill: '#FFFFFF', deskEdge: '#2B2B2B', chair: '#FFFFFF',
  amber: '#202020', amberSoft: '#F2F2F2', sage: '#202020', sageSoft: '#F4F4F4',
  muted: '#202020', warn: '#9A9A9A', wallHatch: '#202020', wallFill: '#E4E4E4', rx: 0, showGrid: false,
}

const INTRA = 0 // gap between desks inside a cluster (in) — flush
const SEAT_GAP = 6 // gap between desks along a horseshoe wall (in)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const effW = (d: Item) => (d.rot % 180 === 0 ? d.w : d.d)
const effH = (d: Item) => (d.rot % 180 === 0 ? d.d : d.w)
const bboxOf = (d: Item): Box => {
  const w = effW(d), h = effH(d)
  return { l: d.cx - w / 2, r: d.cx + w / 2, t: d.cy - h / 2, b: d.cy + h / 2 }
}

function doorClear(dr: DoorT, room: Room): Box {
  const len = dr.len || 36
  if (dr.wall === 'left') return { l: 0, r: len, t: dr.pos - len / 2, b: dr.pos + len / 2 }
  if (dr.wall === 'right') return { l: room.w - len, r: room.w, t: dr.pos - len / 2, b: dr.pos + len / 2 }
  if (dr.wall === 'top') return { l: dr.pos - len / 2, r: dr.pos + len / 2, t: 0, b: len }
  return { l: dr.pos - len / 2, r: dr.pos + len / 2, t: room.l - len, b: room.l }
}
const overlaps = (bb: Box, z: Box) => bb.l < z.r - 0.5 && bb.r > z.l + 0.5 && bb.t < z.b - 0.5 && bb.b > z.t + 0.5
const clearOfDoors = (desks: Item[], zones: Box[]) =>
  desks.filter((d) => { const bb = bboxOf(d); return !zones.some((z) => overlaps(bb, z)) })

// Worksurface sizes in inches (W × D). Sources: standard student desk ~24×18;
// office/computer desks run 30–60" wide × 24–30" deep (dual-monitor ≥60×30).
const DESK_PRESETS = [
  { name: 'Student desk 24×18', w: 24, d: 18, seats: 1 },
  { name: 'Standard desk 30×24', w: 30, d: 24, seats: 1 },
  { name: 'Computer desk 30×30', w: 30, d: 30, seats: 1 },
  { name: '2-seat table 48×24', w: 48, d: 24, seats: 2 },
  { name: 'Activity table 60×30', w: 60, d: 30, seats: 2 },
]

const LAYOUTS: LayoutDef[] = [
  { id: 'rows', name: 'Traditional rows', kind: 'grid', cCols: 1, cRows: 1, blurb: 'Single desks, all facing front.' },
  { id: 'paired', name: 'Paired rows', kind: 'grid', cCols: 2, cRows: 1, blurb: 'Desks in twos, aisle between pairs.' },
  { id: 'pods4', name: 'Pods of 4', kind: 'grid', cCols: 2, cRows: 2, blurb: '2×2 clusters for group work.' },
  { id: 'pods6', name: 'Pods of 6', kind: 'grid', cCols: 3, cRows: 2, blurb: '3×2 clusters, fewer aisles.' },
  { id: 'sides_center', name: 'Two sides + center', kind: 'lanes', blurb: 'Left & right desks face the walls; a center double-column faces inward.' },
  { id: 'u', name: 'Horseshoe', kind: 'u', rings: 1, blurb: 'One ring facing the center.' },
  { id: 'u2', name: 'Double horseshoe', kind: 'u', rings: 2, blurb: 'Two nested rings for larger groups.' },
  { id: 'perim_out', name: 'Perimeter — face walls', kind: 'perim', facing: 'out', blurb: 'Desks along all walls, facing out.' },
  { id: 'perim_in', name: 'Perimeter — face center', kind: 'perim', facing: 'in', blurb: 'Desks along all walls, facing in.' },
]

// Which spacing rules actually bind for a given arrangement. Front and perimeter
// clearances apply everywhere; aisle only matters where there's a walking lane
// (grid columns, or nested horseshoe rings); row gap is grid-only.
type SpacingApplies = { perim: boolean; front: boolean; aisle: boolean; rowGap: boolean }
function spacingApplies(layout: LayoutDef): SpacingApplies {
  if (layout.kind === 'grid') return { perim: true, front: true, aisle: true, rowGap: true }
  if (layout.kind === 'u') return { perim: true, front: true, aisle: (layout.rings ?? 1) > 1, rowGap: false }
  if (layout.kind === 'lanes') return { perim: true, front: true, aisle: false, rowGap: false }
  return { perim: true, front: true, aisle: false, rowGap: false }
}

/* ---------------- geometry ---------------- */

function buildGrid(room: Room, desk: Desk, sp: Sp, cCols: number, cRows: number): BuildResult {
  const usableW = room.w - 2 * sp.perim
  const usableL = room.l - sp.front - sp.perim
  const clW = cCols * desk.w + (cCols - 1) * INTRA
  const clH = cRows * desk.d + (cRows - 1) * INTRA
  const nCC = Math.max(0, Math.floor((usableW + sp.aisle) / (clW + sp.aisle)))
  const nCR = Math.max(0, Math.floor((usableL + sp.rowGap) / (clH + sp.rowGap)))
  const usedW = nCC * clW + Math.max(0, nCC - 1) * sp.aisle
  const startX = sp.perim + Math.max(0, (usableW - usedW) / 2)
  const startY = sp.front
  const desks: Item[] = []
  for (let cr = 0; cr < nCR; cr++) for (let cc = 0; cc < nCC; cc++) {
    const cx0 = startX + cc * (clW + sp.aisle)
    const cy0 = startY + cr * (clH + sp.rowGap)
    for (let dr = 0; dr < cRows; dr++) {
      // in a multi-row cluster (a pod), the top row faces down so chairs
      // sit on the outer edges and students face each other across the pod
      const drot = cRows > 1 && dr < cRows - 1 - dr ? 180 : 0
      for (let dc = 0; dc < cCols; dc++) {
        desks.push({ cx: cx0 + dc * (desk.w + INTRA) + desk.w / 2, cy: cy0 + dr * (desk.d + INTRA) + desk.d / 2, w: desk.w, d: desk.d, rot: drot, seats: desk.seats })
      }
    }
  }
  desks.sort((a, b) => a.cy - b.cy || a.cx - b.cx)
  return { desks, cap: desks.length }
}

function buildHorseshoe(room: Room, desk: Desk, sp: Sp, rings: number): BuildResult {
  const all: Item[] = []
  for (let r = 0; r < rings; r++) {
    const off = r * (desk.d + sp.aisle)
    const iL = sp.perim + off, iR = room.w - sp.perim - off, iT = sp.front + off, iB = room.l - sp.perim - off
    if (iR - iL < desk.w || iB - iT < desk.d) break
    const backN = Math.max(0, Math.floor((iR - iL + SEAT_GAP) / (desk.w + SEAT_GAP)))
    const backUsed = backN * desk.w + Math.max(0, backN - 1) * SEAT_GAP
    const bx0 = iL + (iR - iL - backUsed) / 2
    for (let i = 0; i < backN; i++) all.push({ cx: bx0 + i * (desk.w + SEAT_GAP) + desk.w / 2, cy: iB - desk.d / 2, w: desk.w, d: desk.d, rot: 0, seats: desk.seats })
    const sideTop = iT, sideBot = iB - desk.d - SEAT_GAP
    const sideN = Math.max(0, Math.floor((sideBot - sideTop + SEAT_GAP) / (desk.w + SEAT_GAP)))
    const sideUsed = sideN * desk.w + Math.max(0, sideN - 1) * SEAT_GAP
    const sy0 = sideTop + (sideBot - sideTop - sideUsed) / 2
    for (let i = 0; i < sideN; i++) {
      const cy = sy0 + i * (desk.w + SEAT_GAP) + desk.w / 2
      all.push({ cx: iL + desk.d / 2, cy, w: desk.w, d: desk.d, rot: 90, seats: desk.seats })
      all.push({ cx: iR - desk.d / 2, cy, w: desk.w, d: desk.d, rot: -90, seats: desk.seats })
    }
  }
  return { desks: all, cap: all.length }
}

function buildPerimeter(room: Room, desk: Desk, sp: Sp, facing: 'in' | 'out'): BuildResult {
  // Front (board) wall honors the front-clearance rule; the other three walls use perimeter.
  const iL = sp.perim, iR = room.w - sp.perim, iT = sp.front, iB = room.l - sp.perim
  const all: Item[] = []
  const out = facing !== 'in'
  const lineX = (y: number, rot: number) => {
    const span = iR - iL
    const n = Math.max(0, Math.floor((span + SEAT_GAP) / (desk.w + SEAT_GAP)))
    const used = n * desk.w + Math.max(0, n - 1) * SEAT_GAP
    const x0 = iL + (span - used) / 2
    for (let i = 0; i < n; i++) all.push({ cx: x0 + i * (desk.w + SEAT_GAP) + desk.w / 2, cy: y, w: desk.w, d: desk.d, rot, seats: desk.seats })
  }
  const lineY = (x: number, rot: number, top: number, bot: number) => {
    const span = bot - top
    const n = Math.max(0, Math.floor((span + SEAT_GAP) / (desk.w + SEAT_GAP)))
    const used = n * desk.w + Math.max(0, n - 1) * SEAT_GAP
    const y0 = top + (span - used) / 2
    for (let i = 0; i < n; i++) all.push({ cx: x, cy: y0 + i * (desk.w + SEAT_GAP) + desk.w / 2, w: desk.w, d: desk.d, rot, seats: desk.seats })
  }
  lineX(iT + desk.d / 2, out ? 0 : 180)
  lineX(iB - desk.d / 2, out ? 180 : 0)
  const top = iT + desk.d + SEAT_GAP, bot = iB - desk.d - SEAT_GAP
  if (bot - top >= desk.w) {
    lineY(iL + desk.d / 2, out ? -90 : 90, top, bot)
    lineY(iR - desk.d / 2, out ? 90 : -90, top, bot)
  }
  return { desks: all, cap: all.length }
}

function buildLanes(room: Room, desk: Desk, sp: Sp): BuildResult {
  // Left & right columns sit against the side walls and FACE the wall; two center
  // columns face inward toward each other. Desks within a column are flush
  // (touching). Rotated ±90°, a desk spans `desk.d` across and `desk.w` along the run.
  const runStart = sp.front
  const usable = room.l - sp.front - sp.perim
  const step = desk.w // rotated: the desk's width runs front-to-back, flush together
  const nRows = Math.max(0, Math.floor(usable / step))

  // Columns: {x center, rotation}. rot -90 faces left (west), rot 90 faces right (east).
  const cols: { x: number; rot: number }[] = [
    { x: sp.perim + desk.d / 2, rot: -90 },          // left wall — faces the wall (chairs toward center)
    { x: room.w - sp.perim - desk.d / 2, rot: 90 },  // right wall — faces the wall
  ]
  // Inward-facing center pair, fronts meeting at the room centerline, only when it fits.
  const sideAisle = room.w / 2 - sp.perim - 2 * desk.d
  if (sideAisle >= 2) {
    cols.push({ x: room.w / 2 - desk.d / 2, rot: 90 })  // left-center — faces center (east)
    cols.push({ x: room.w / 2 + desk.d / 2, rot: -90 }) // right-center — faces center (west)
  }

  const desks: Item[] = []
  for (let r = 0; r < nRows; r++) {
    const cy = runStart + r * step + step / 2
    for (const c of cols) desks.push({ cx: c.x, cy, w: desk.w, d: desk.d, rot: c.rot, seats: desk.seats })
  }
  desks.sort((a, b) => a.cy - b.cy || a.cx - b.cx)
  return { desks, cap: desks.length }
}

function markADA(desks: Item[]) {
  if (!desks.length) return
  const n = Math.max(1, Math.ceil(desks.length * 0.05))
  const step = desks.length / n
  for (let i = 0; i < n; i++) desks[Math.min(desks.length - 1, Math.round(i * step + step / 2))].ada = true
}

// snap a moving box flush to neighbor edges (returns snapped coords per axis)
function edgeSnap(cx: number, cy: number, ww: number, hh: number, others: Box[], T: number) {
  let sx = cx, sy = cy, bestX = T, bestY = T
  const l = cx - ww / 2, r = cx + ww / 2, t = cy - hh / 2, b = cy + hh / 2
  for (const o of others) {
    if (!(b < o.t || t > o.b)) { // vertical overlap -> horizontal snaps
      let g
      g = Math.abs(r - o.l); if (g < bestX) { bestX = g; sx = o.l - ww / 2 }
      g = Math.abs(l - o.r); if (g < bestX) { bestX = g; sx = o.r + ww / 2 }
      g = Math.abs(l - o.l); if (g < bestX) { bestX = g; sx = o.l + ww / 2 }
      g = Math.abs(r - o.r); if (g < bestX) { bestX = g; sx = o.r - ww / 2 }
    }
    if (!(r < o.l || l > o.r)) { // horizontal overlap -> vertical snaps
      let g
      g = Math.abs(b - o.t); if (g < bestY) { bestY = g; sy = o.t - hh / 2 }
      g = Math.abs(t - o.b); if (g < bestY) { bestY = g; sy = o.b + hh / 2 }
      g = Math.abs(t - o.t); if (g < bestY) { bestY = g; sy = o.t + hh / 2 }
      g = Math.abs(b - o.b); if (g < bestY) { bestY = g; sy = o.b - hh / 2 }
    }
  }
  return { x: sx, y: sy, snappedX: bestX < T, snappedY: bestY < T }
}

/* ---------------- UI atoms ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  )
}

function NumInput({ value, set, min, max, step = 1, suffix }: { value: number; set: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = () => { let v = parseFloat(text); if (isNaN(v)) v = value; v = clamp(v, min, max); set(v); setText(String(v)) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: C.paper, border: `1px solid ${C.line}`, borderRadius: 5, height: 34 }}>
      <input type="number" value={text} min={min} max={max} step={step}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', padding: '0 9px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: C.ink }} />
      {suffix && <span style={{ padding: '0 9px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.faint }}>{suffix}</span>}
    </div>
  )
}

function FtIn({ ft, inch, setFt, setIn }: { ft: number; inch: number; setFt: (v: number) => void; setIn: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <NumInput value={ft} set={setFt} min={4} max={80} suffix="ft" />
      <NumInput value={inch} set={setIn} min={0} max={11} suffix="in" />
    </div>
  )
}

function Slider({ label, value, set, min, max, rec, recLabel, suffix, disabled, naNote }: { label: string; value: number; set: (v: number) => void; min: number; max: number; rec?: number | null; recLabel?: string; suffix?: string; disabled?: boolean; naNote?: string }) {
  const below = !disabled && rec != null && value < rec
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: disabled ? 0.45 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, color: C.ink }}>{label}</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: below ? C.warn : C.ink, fontWeight: 600 }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(e) => set(parseInt(e.target.value))} className="cls-range" style={disabled ? { cursor: 'not-allowed' } : undefined} />
      {disabled
        ? <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: C.faint }}>{naNote || 'not used in this arrangement'}</span>
        : rec != null && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: below ? C.warn : C.faint }}>{below ? 'below ' : 'rec '}{recLabel || `${rec}${suffix}`}</span>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7 }}>
      <div style={{ padding: '10px 13px', borderBottom: `1px solid ${C.lineSoft}` }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: "'Archivo',sans-serif" }}>{title}</h2>
      </div>
      <div style={{ padding: 13 }}>{children}</div>
    </section>
  )
}

function Btn({ onClick, children, kind = 'default', size = 'md', disabled, active }: { onClick?: () => void; children: React.ReactNode; kind?: 'default' | 'primary' | 'danger' | 'ghost'; size?: 'sm' | 'md'; disabled?: boolean; active?: boolean }) {
  const pad = size === 'sm' ? '5px 9px' : '7px 12px'
  const fs = size === 'sm' ? 12 : 13
  let s = { border: `1px solid ${C.line}`, background: C.paper, color: C.ink }
  if (kind === 'primary') s = { border: `1px solid ${C.accentDeep}`, background: C.accent, color: '#fff' }
  else if (kind === 'danger') s = { border: `1px solid ${C.line}`, background: C.paper, color: C.warn }
  else if (kind === 'ghost') s = { border: '1px solid transparent', background: 'transparent', color: C.muted }
  if (active) s = { border: `1px solid ${C.accent}`, background: C.accentSoft, color: C.accentDeep }
  return <button className="cls-btn" onClick={onClick} disabled={disabled}
    style={{ ...s, padding: pad, fontSize: fs, fontWeight: 600, borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, fontFamily: "'Public Sans',sans-serif", whiteSpace: 'nowrap' }}>{children}</button>
}

function Check({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button className="cls-btn" onClick={() => set(!on)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${on ? C.accent : C.line}`, background: on ? C.accent : C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {on && <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 6.2 L5 9 L10 3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span style={{ fontSize: 13, color: C.ink }}>{label}</span>
    </button>
  )
}

/* ---------------- plan items ---------------- */

// A task-chair plan symbol drawn in the desk's local frame, seated just in
// front of the desk's front edge (local +y). Rounded seat + curved backrest
// + short armrests — the conventional top-view chair (lightest line weight).
// A task-chair plan symbol (~18" seat) seated at the desk's front edge and
// tucked partly UNDER the worksurface, the way chairs are shown on real plans.
// The desk rect is drawn after the chairs, so the tucked part reads as hidden.
function chairSymbol(cx: number, frontEdge: number, slot: number, deskD: number, stroke: string, fill: string, w: number) {
  const seatW = clamp(Math.min(slot, 26) * 0.66, 14, 19)  // ~17" seat
  const seatD = clamp(deskD * 0.62, 15, 19)               // ~18" deep
  const tuck = seatD * 0.32                                // slides under the desk
  const y0 = frontEdge - tuck                              // seat top (under desk)
  const yBack = y0 + seatD                                 // backrest side (away from desk)
  const arm = seatW * 0.5
  return (
    <g key={'ch' + cx} style={{ pointerEvents: 'none' }}>
      {/* armrests */}
      <line x1={cx - seatW / 2 - 0.8} y1={frontEdge + seatD * 0.04} x2={cx - seatW / 2 - 0.8} y2={yBack - seatD * 0.14} stroke={stroke} strokeWidth={w} strokeLinecap="round" />
      <line x1={cx + seatW / 2 + 0.8} y1={frontEdge + seatD * 0.04} x2={cx + seatW / 2 + 0.8} y2={yBack - seatD * 0.14} stroke={stroke} strokeWidth={w} strokeLinecap="round" />
      {/* seat */}
      <rect x={cx - seatW / 2} y={y0} width={seatW} height={seatD} rx={2.6} fill={fill} stroke={stroke} strokeWidth={w} />
      {/* curved backrest hugging the far edge */}
      <path d={`M ${cx - arm} ${yBack - 0.4} Q ${cx} ${yBack + seatD * 0.4} ${cx + arm} ${yBack - 0.4}`} fill="none" stroke={stroke} strokeWidth={w * 1.2} strokeLinecap="round" />
    </g>
  )
}

function Desk({ d, sw, pal, editable, selected, index, onDown }: { d: Item; sw: number; pal: Pal; editable: boolean; selected: boolean; index: number; onDown: (index: number, e: React.PointerEvent) => void }) {
  const fill = d.ada ? pal.amberSoft : pal.deskFill
  const edge = d.ada ? pal.amber : pal.deskEdge
  const hw = d.w / 2, hh = d.d / 2
  const seats = Math.max(1, d.seats || Math.round(d.w / 26))
  const slot = d.w / seats
  const deskW = sw * 0.85   // furniture outline — medium-thin
  const chairW = sw * 0.55  // chair detail — thinnest
  return (
    <g transform={`translate(${d.cx} ${d.cy}) rotate(${d.rot})`}
      style={{ transition: editable ? 'none' : 'transform .4s cubic-bezier(.4,0,.2,1)', cursor: editable ? 'grab' : 'default' }}
      onPointerDown={editable ? (e) => onDown(index, e) : undefined}>
      {selected && <rect x={-hw - 6} y={-hh - 6} width={d.w + 12} height={d.d + 12 + d.d * 0.55} rx={pal.rx ? 4 : 1} fill="none" stroke={C.accent} strokeWidth={sw * 1.4} strokeDasharray={`${sw * 3} ${sw * 2}`} />}
      {[...Array(seats)].map((_, i) => chairSymbol(-hw + slot * (i + 0.5), hh, slot, d.d, edge, pal.chair, chairW))}
      <rect x={-hw} y={-hh} width={d.w} height={d.d} rx={pal.rx} fill={fill} stroke={selected ? C.accent : edge} strokeWidth={selected ? deskW * 1.7 : deskW} />
      {/* worktop front lip — a light secondary line gives the desk depth */}
      <line x1={-hw + 2} y1={hh - Math.min(4, d.d * 0.18)} x2={hw - 2} y2={hh - Math.min(4, d.d * 0.18)} stroke={edge} strokeWidth={sw * 0.4} opacity={0.5} />
      {d.ada && <text x={0} y={2.5} textAnchor="middle" fontSize={Math.min(11, d.d * 0.5)} fontFamily="'Public Sans',sans-serif" fontWeight="700" fill={pal.amber} style={{ pointerEvents: 'none' }}>♿</text>}
    </g>
  )
}

function Teacher({ t, sw, pal, selected, index, onDown, room }: { t: Item; sw: number; pal: Pal; selected: boolean; index: number; onDown: (index: number, e: React.PointerEvent) => void; room: Room }) {
  const cx = clamp(t.cx, effW(t) / 2, room.w - effW(t) / 2)
  const cy = clamp(t.cy, effH(t) / 2, room.l - effH(t) / 2)
  const hw = t.w / 2, hh = t.d / 2
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${t.rot})`} style={{ cursor: 'grab' }} onPointerDown={(e) => onDown(index, e)}>
      {selected && <rect x={-hw - 6} y={-hh - 6 - t.d * 0.55} width={t.w + 12} height={t.d + 12 + t.d * 0.55} rx={pal.rx ? 4 : 1} fill="none" stroke={C.accent} strokeWidth={sw * 1.4} strokeDasharray={`${sw * 3} ${sw * 2}`} />}
      {/* teacher chair sits behind the desk (local -y, facing the class) */}
      <g transform="scale(1 -1)">{chairSymbol(0, hh, t.w * 0.9, t.d, pal.sage, pal.chair, sw * 0.55)}</g>
      <rect x={-hw} y={-hh} width={t.w} height={t.d} rx={pal.rx} fill={pal.sageSoft} stroke={selected ? C.accent : pal.sage} strokeWidth={selected ? sw * 1.5 : sw * 0.85} />
      <text x={0} y={2.5} textAnchor="middle" fontSize={Math.min(9, t.d * 0.34)} fontFamily="'Public Sans',sans-serif" fontWeight="600" fill={pal.sage} style={{ pointerEvents: 'none' }}>teacher</text>
    </g>
  )
}

function Door({ dr, sw, pal, wallT, selected, index, onDown, room }: { dr: DoorT; sw: number; pal: Pal; wallT: number; selected: boolean; index: number; onDown: (index: number, e: React.PointerEvent) => void; room: Room }) {
  const len = dr.len || 36
  let tx: number, ty: number, rot: number, max: number
  if (dr.wall === 'left' || dr.wall === 'right') max = room.l; else max = room.w
  const pos = clamp(dr.pos, len / 2, Math.max(len / 2, max - len / 2))
  if (dr.wall === 'left') { tx = 0; ty = pos - len / 2; rot = 0 }
  else if (dr.wall === 'right') { tx = room.w; ty = pos + len / 2; rot = 180 }
  else if (dr.wall === 'top') { tx = pos + len / 2; ty = 0; rot = 90 }
  else { tx = pos - len / 2; ty = room.l; rot = -90 }
  const stroke = selected ? C.accent : pal.wall
  return (
    <g transform={`translate(${tx} ${ty}) rotate(${rot})`} style={{ cursor: 'grab' }} onPointerDown={(e) => onDown(index, e)}>
      {/* cut the wall poché at the opening */}
      <rect x={-wallT - 0.5} y={-0.5} width={wallT + 1} height={len + 1} fill={pal.floor} />
      {/* jamb returns (close the wall ends) */}
      <line x1={-wallT} y1={0} x2={0} y2={0} stroke={stroke} strokeWidth={sw * 0.9} />
      <line x1={-wallT} y1={len} x2={0} y2={len} stroke={stroke} strokeWidth={sw * 0.9} />
      {/* swing arc */}
      <path d={`M ${len} 0 A ${len} ${len} 0 0 1 0 ${len}`} fill="none" stroke={pal.faint} strokeWidth={sw * 0.5} />
      {/* door leaf panel, swung open into the room */}
      <rect x={0} y={-1.4} width={len} height={2} rx={0.4} fill={selected ? C.accentSoft : pal.floor} stroke={stroke} strokeWidth={sw * 0.7} />
      {selected && <circle cx={0} cy={0} r={sw * 2.2} fill={C.accent} />}
      <rect x={-9} y={-6} width={18} height={len + 12} fill="transparent" />
    </g>
  )
}

function dimLine(x1: number, y1: number, x2: number, y2: number, label: string, sw: number, vertical?: boolean, color?: string): React.ReactElement {
  const c = color || C.faint
  const t = sw * 2.2          // architectural 45° slash tick
  const lw = sw * 0.45        // dimensions are among the lightest lines
  const slash = (x: number, y: number) => <line x1={x - t} y1={y + t} x2={x + t} y2={y - t} stroke={c} strokeWidth={lw} />
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={lw} />
      {slash(x1, y1)}
      {slash(x2, y2)}
      {vertical
        ? <text x={x1 + 9} y={(y1 + y2) / 2} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill={c} transform={`rotate(90 ${x1 + 9} ${(y1 + y2) / 2})`}>{label}</text>
        : <text x={(x1 + x2) / 2} y={y1 + 12} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill={c}>{label}</text>}
    </g>
  )
}

// A running dimension string (chain): ticks at every edge in `edges`, with the
// size of each segment labelled — the architectural way to dimension repeated
// items. `cross` is the fixed coordinate of the chain line; `room*` give the
// extent so we can draw light extension lines back to the wall.
function dimChain(edges: number[], cross: number, vertical: boolean, sw: number, color: string, wallCoord: number): React.ReactElement {
  const lw = sw * 0.42, t = sw * 1.9
  const a = edges[0], b = edges[edges.length - 1]
  const els: React.ReactElement[] = []
  els.push(vertical
    ? <line key="m" x1={cross} y1={a} x2={cross} y2={b} stroke={color} strokeWidth={lw} />
    : <line key="m" x1={a} y1={cross} x2={b} y2={cross} stroke={color} strokeWidth={lw} />)
  edges.forEach((e, i) => {
    const x = vertical ? cross : e, y = vertical ? e : cross
    els.push(<line key={'t' + i} x1={x - t} y1={y + t} x2={x + t} y2={y - t} stroke={color} strokeWidth={lw} />)
    // faint extension line from the wall to the chain
    els.push(vertical
      ? <line key={'e' + i} x1={wallCoord} y1={e} x2={cross} y2={e} stroke={color} strokeWidth={lw * 0.6} opacity={0.35} />
      : <line key={'e' + i} x1={e} y1={wallCoord} x2={e} y2={cross} stroke={color} strokeWidth={lw * 0.6} opacity={0.35} />)
    if (i > 0) {
      const seg = e - edges[i - 1], mid = (e + edges[i - 1]) / 2
      if (seg < 1) return
      els.push(vertical
        ? <text key={'l' + i} x={cross - 4} y={mid} textAnchor="middle" fontSize={7} fontFamily="'IBM Plex Mono',monospace" fill={color} transform={`rotate(-90 ${cross - 4} ${mid})`}>{Math.round(seg)}</text>
        : <text key={'l' + i} x={mid} y={cross + 9} textAnchor="middle" fontSize={7} fontFamily="'IBM Plex Mono',monospace" fill={color}>{Math.round(seg)}</text>)
    }
  })
  return <g style={{ pointerEvents: 'none' }}>{els}</g>
}

type PlanProps = {
  room: Room
  desks: Item[]
  teachers: Item[]
  doors: DoorT[]
  sp: Sp
  showADA: boolean
  firstAisleX: { a: number; b: number } | null
  firstRowY: { a: number; b: number } | null
  manual: boolean
  showFrontGuide: boolean
  showDims: boolean
  sel: Sel
  onItemDown: (kind: SelKind, idx: number, e: React.PointerEvent) => void
  onBackgroundDown: () => void
  svgRef: React.RefObject<SVGSVGElement | null>
  pal: Pal
}

function Plan({ room, desks, teachers, doors, sp, showADA, firstAisleX, firstRowY, manual, showFrontGuide, showDims, sel, onItemDown, onBackgroundDown, svgRef, pal }: PlanProps) {
  const cad = pal.wallHatch != null
  const baseM = cad ? 50 : 34
  // extra room on the left & bottom for the dimension chains when measurements are on
  const ML = showDims ? baseM + 26 : baseM
  const MT = baseM
  const MR = baseM
  const MB = showDims ? baseM + 44 : baseM
  const vbW = ML + room.w + MR, vbH = MT + room.l + MB
  const sw = Math.max(1.3, room.w / 320)
  const wallT = cad ? Math.max(6, room.w / 90) : sw * 3.4
  const ft = 12
  const gridLines: React.ReactElement[] = []
  if (pal.showGrid) {
    for (let x = ft; x < room.w; x += ft) gridLines.push(<line key={'gx' + x} x1={x} y1={0} x2={x} y2={room.l} stroke={x % 60 === 0 ? pal.gridStrong : pal.grid} strokeWidth={sw * 0.4} />)
    for (let y = ft; y < room.l; y += ft) gridLines.push(<line key={'gy' + y} x1={0} y1={y} x2={room.w} y2={y} stroke={y % 60 === 0 ? pal.gridStrong : pal.grid} strokeWidth={sw * 0.4} />)
  }
  const isSel = (kind: SelKind, idx: number) => !!sel && sel.kind === kind && sel.idx === idx
  const mLbl = (v: number) => `${Math.round(v)}″`
  let mb: { minL: number; maxR: number; minT: number; maxB: number } | null = null
  // dimension-chain edges: break the top row into x-segments and the left column into y-segments
  let hEdges: number[] = [], vEdges: number[] = []
  if (showDims && desks.length) {
    const bbs = desks.map(bboxOf)
    mb = {
      minL: Math.min(...bbs.map((b) => b.l)), maxR: Math.max(...bbs.map((b) => b.r)),
      minT: Math.min(...bbs.map((b) => b.t)), maxB: Math.max(...bbs.map((b) => b.b)),
    }
    const minCy = Math.min(...desks.map((d) => d.cy))
    const xs = new Set<number>([0, room.w])
    desks.filter((d) => Math.abs(d.cy - minCy) < 6).forEach((d) => { const w = effW(d); xs.add(Math.round(d.cx - w / 2)); xs.add(Math.round(d.cx + w / 2)) })
    hEdges = [...xs].sort((a, b) => a - b)
    const minCx = Math.min(...desks.map((d) => d.cx))
    const ys = new Set<number>([0, room.l])
    desks.filter((d) => Math.abs(d.cx - minCx) < 6).forEach((d) => { const h = effH(d); ys.add(Math.round(d.cy - h / 2)); ys.add(Math.round(d.cy + h / 2)) })
    vEdges = [...ys].sort((a, b) => a - b)
  }

  return (
    <svg ref={svgRef} viewBox={`${-ML} ${-MT} ${vbW} ${vbH}`} style={{ width: '100%', height: 'auto', display: 'block', background: pal.paper, touchAction: 'none' }} preserveAspectRatio="xMidYMid meet">
      <rect x={-ML} y={-MT} width={vbW} height={vbH} fill="transparent" onPointerDown={onBackgroundDown} />
      <rect x={0} y={0} width={room.w} height={room.l} fill={pal.floor} onPointerDown={onBackgroundDown} />
      {gridLines}
      {!cad && doors.map((dr, i) => { const z = doorClear(dr, room); return <rect key={'dz' + i} x={z.l} y={z.t} width={z.r - z.l} height={z.b - z.t} fill={pal.warn} fillOpacity={0.05} stroke={pal.warn} strokeOpacity={0.28} strokeWidth={sw * 0.5} strokeDasharray={`${sw * 2} ${sw * 1.6}`} style={{ pointerEvents: 'none' }} /> })}
      {cad ? (<>
        {/* solid poché wall band between heavy black faces — the heaviest line weight */}
        <path fillRule="evenodd" fill={pal.wallFill} stroke="none" style={{ pointerEvents: 'none' }}
          d={`M ${-wallT} ${-wallT} H ${room.w + wallT} V ${room.l + wallT} H ${-wallT} Z M 0 0 H ${room.w} V ${room.l} H 0 Z`} />
        <rect x={-wallT} y={-wallT} width={room.w + 2 * wallT} height={room.l + 2 * wallT} fill="none" stroke={pal.wall} strokeWidth={sw * 1.05} />
        <rect x={0} y={0} width={room.w} height={room.l} fill="none" stroke={pal.wall} strokeWidth={sw * 1.05} />
      </>) : (
        <rect x={-wallT / 2} y={-wallT / 2} width={room.w + wallT} height={room.l + wallT} fill="none" stroke={pal.wall} strokeWidth={wallT} />
      )}
      {/* markerboard mounted on the front wall */}
      <g style={{ pointerEvents: 'none' }}>
        <line x1={room.w * 0.27} y1={1.5} x2={room.w * 0.73} y2={1.5} stroke={pal.wall} strokeWidth={sw * 1.4} strokeLinecap="round" />
        <line x1={room.w * 0.27} y1={3.6} x2={room.w * 0.73} y2={3.6} stroke={pal.faint} strokeWidth={sw * 0.45} />
        <text x={room.w / 2} y={-wallT / 2 - 5} textAnchor="middle" fontSize={8.5} letterSpacing={1} fontFamily="'IBM Plex Mono',monospace" fill={pal.faint}>MARKERBOARD</text>
      </g>

      {doors.map((dr, i) => <Door key={'dr' + i} dr={dr} sw={sw} pal={pal} wallT={wallT} selected={isSel('door', i)} index={i} onDown={(idx, e) => onItemDown('door', idx, e)} room={room} />)}
      {teachers.map((t, i) => <Teacher key={'tc' + i} t={t} sw={sw} pal={pal} selected={isSel('teacher', i)} index={i} onDown={(idx, e) => onItemDown('teacher', idx, e)} room={room} />)}

      {showFrontGuide && sp.front > 6 && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={0} y={0} width={room.w} height={sp.front} fill={pal.accent} opacity={0.04} />
          <line x1={0} y1={sp.front} x2={room.w} y2={sp.front} stroke={pal.accent} strokeWidth={sw * 0.6} strokeDasharray={`${sw * 3} ${sw * 2}`} opacity={0.55} />
          <text x={6} y={sp.front - 4} fontSize={8.5} fontFamily="'Public Sans',sans-serif" fill={pal.accent} opacity={0.85}>front clearance {Math.round(sp.front)}″</text>
        </g>
      )}

      {showADA && desks.filter((d) => d.ada && d.rot === 0).map((d, i) => (
        <rect key={'ada' + i} x={d.cx - 15} y={d.cy - d.d / 2 - 48} width={30} height={48} fill="none" stroke={pal.amber} strokeWidth={sw * 0.6} strokeDasharray={`${sw * 2.4} ${sw * 1.6}`} opacity={0.6} />
      ))}

      {desks.map((d, i) => <Desk key={'dk' + i} d={d} sw={sw} pal={pal} editable={manual} selected={isSel('desk', i)} index={i} onDown={(idx, e) => onItemDown('desk', idx, e)} />)}

      {showDims && firstAisleX != null && (
        <g style={{ pointerEvents: 'none' }}>
          <line x1={firstAisleX.a} y1={sp.front - 9} x2={firstAisleX.b} y2={sp.front - 9} stroke={pal.accent} strokeWidth={sw * 0.8} />
          <line x1={firstAisleX.a} y1={sp.front - 13} x2={firstAisleX.a} y2={sp.front - 5} stroke={pal.accent} strokeWidth={sw * 0.8} />
          <line x1={firstAisleX.b} y1={sp.front - 13} x2={firstAisleX.b} y2={sp.front - 5} stroke={pal.accent} strokeWidth={sw * 0.8} />
          <text x={(firstAisleX.a + firstAisleX.b) / 2} y={sp.front - 14} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fontWeight="600" fill={sp.aisle < 36 ? pal.warn : pal.accent}>aisle {Math.round(firstAisleX.b - firstAisleX.a)}″</text>
        </g>
      )}

      {showDims && mb && (
        <g>
          {mb.minT > 4 && dimLine(room.w * 0.16, 0, room.w * 0.16, mb.minT, mLbl(mb.minT), sw, true, pal.accent)}
          {mb.minL > 4 && dimLine(0, room.l * 0.5, mb.minL, room.l * 0.5, mLbl(mb.minL), sw, false, pal.accent)}
          {room.w - mb.maxR > 4 && dimLine(mb.maxR, room.l * 0.5, room.w, room.l * 0.5, mLbl(room.w - mb.maxR), sw, false, pal.accent)}
          {room.l - mb.maxB > 4 && dimLine(room.w * 0.5, mb.maxB, room.w * 0.5, room.l, mLbl(room.l - mb.maxB), sw, true, pal.accent)}
          {firstRowY && dimLine(room.w * 0.88, firstRowY.a, room.w * 0.88, firstRowY.b, mLbl(firstRowY.b - firstRowY.a), sw, true, pal.accent)}
        </g>
      )}

      {/* overall room dimensions with extension lines */}
      <g style={{ pointerEvents: 'none' }}>
        <line x1={0} y1={room.l + wallT + 2} x2={0} y2={room.l + 19} stroke={pal.faint} strokeWidth={sw * 0.4} />
        <line x1={room.w} y1={room.l + wallT + 2} x2={room.w} y2={room.l + 19} stroke={pal.faint} strokeWidth={sw * 0.4} />
        {dimLine(0, room.l + 18, room.w, room.l + 18, fmtFtIn(room.w), sw, false, pal.faint)}
        <line x1={room.w + wallT + 2} y1={0} x2={room.w + 19} y2={0} stroke={pal.faint} strokeWidth={sw * 0.4} />
        <line x1={room.w + wallT + 2} y1={room.l} x2={room.w + 19} y2={room.l} stroke={pal.faint} strokeWidth={sw * 0.4} />
        {dimLine(room.w + 18, 0, room.w + 18, room.l, fmtFtIn(room.l), sw, true, pal.faint)}
      </g>

      {/* dimension strings — break the layout into every desk / gap / aisle / margin (inches) */}
      {showDims && hEdges.length > 1 && dimChain(hEdges, room.l + 40, false, sw, pal.faint, room.l)}
      {showDims && vEdges.length > 1 && dimChain(vEdges, -28, true, sw, pal.faint, 0)}

      {/* graphic scale bar (true to the drawing regardless of display size) */}
      {cad && (
        <g style={{ pointerEvents: 'none' }} transform={`translate(0 ${room.l + (showDims ? 64 : 33)})`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={i * 24} y={0} width={24} height={sw * 2.2} fill={i % 2 ? pal.floor : pal.wall} stroke={pal.wall} strokeWidth={sw * 0.4} />
          ))}
          <text x={0} y={sw * 2.2 + 9} fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill={pal.faint}>0</text>
          <text x={120} y={sw * 2.2 + 9} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill={pal.faint}>10 ft</text>
        </g>
      )}
    </svg>
  )
}

function fmtFtIn(inches: number) { const f = Math.floor(inches / 12); const i = Math.round(inches - f * 12); return i ? `${f}′ ${i}″` : `${f}′` }

function MiniPlan({ room, desks, teachers, pal = PAL_CAD }: { room: Room; desks: Item[]; teachers?: Item[]; pal?: Pal }) {
  const w = 132, h = 92, pad = 6
  const s = Math.min((w - pad * 2) / room.w, (h - pad * 2) / room.l)
  const ox = (w - room.w * s) / 2, oy = (h - room.l * s) / 2
  const box = (d: Item, fill: string, edge: string, key: string) => {
    const dw = effW(d) * s, dh = effH(d) * s
    return <rect key={key} x={ox + d.cx * s - dw / 2} y={oy + d.cy * s - dh / 2} width={Math.max(1.2, dw)} height={Math.max(1.2, dh)} rx={pal.rx ? 0.6 : 0} fill={fill} stroke={edge} strokeWidth={0.5} />
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block', background: pal.paper }}>
      <rect x={ox} y={oy} width={room.w * s} height={room.l * s} fill={pal.floor} stroke={pal.wall} strokeWidth={1.2} />
      {(teachers || []).map((t, i) => box(t, pal.sageSoft, pal.sage, 't' + i))}
      {desks.map((d, i) => box(d, d.ada ? pal.amberSoft : pal.deskFill, d.ada ? pal.amber : pal.deskEdge, 'd' + i))}
    </svg>
  )
}

/* ---------------- app ---------------- */

const STORE_KEY = 'cls:layouts:v2'

export default function ClassroomPlannerPage() {
  const [roomWft, setRoomWft] = useState(30)
  const [roomWin, setRoomWin] = useState(0)
  const [roomLft, setRoomLft] = useState(24)
  const [roomLin, setRoomLin] = useState(0)
  const [deskW, setDeskW] = useState(24)
  const [deskD, setDeskD] = useState(18)
  const [deskSeats, setDeskSeats] = useState(1)
  const [target, setTarget] = useState(28)
  const [fillMax, setFillMax] = useState(false)
  const [showADA, setShowADA] = useState(true)
  const [layoutId, setLayoutId] = useState('rows')
  const [aisle, setAisle] = useState(36)
  const [rowGap, setRowGap] = useState(30)
  const [front, setFront] = useState(60)
  const [perim, setPerim] = useState(30)

  const room: Room = { w: roomWft * 12 + roomWin, l: roomLft * 12 + roomLin }
  const desk: Desk = { w: deskW, d: deskD, seats: deskSeats }
  const sp: Sp = { aisle, rowGap, front, perim }
  const layout: LayoutDef = LAYOUTS.find((l) => l.id === layoutId) ?? LAYOUTS[0]
  const ap = spacingApplies(layout)
  // The circulation route to check against the 36" ADA minimum: the aisle where
  // one exists, otherwise the open central space left between the wall desks.
  const adaRouteVal = ap.aisle
    ? aisle
    : layout.kind === 'lanes'
      ? room.w / 2 - perim - 2 * desk.d
      : Math.min(room.w - 2 * perim - 2 * desk.d, room.l - front - perim - 2 * desk.d)
  const adaRouteLabel = ap.aisle ? 'ADA aisle' : layout.kind === 'lanes' ? 'side aisles' : 'center route'

  const [manual, setManual] = useState(false)
  const [studentDesks, setStudentDesks] = useState<Item[]>([])
  const [teachers, setTeachers] = useState<Item[]>([{ cx: 304, cy: 42, w: 48, d: 24, rot: 0 }])
  const [doors, setDoors] = useState<DoorT[]>([{ wall: 'left', pos: 234, len: 36 }])
  const [sel, setSel] = useState<Sel>(null)
  const [snap, setSnap] = useState(true)
  const [showDims, setShowDims] = useState(true)
  const [cad, setCad] = useState(true)
  const pal: Pal = cad ? PAL_CAD : PAL_COLOR

  // Starter for the Video Production room (D131): rectangle, side + center
  // columns of single desks, teacher station at front. Dimensions are an
  // estimate — adjust Room width/length to the architect's exact figures.
  const loadD131 = () => {
    setManual(false)
    setRoomWft(30); setRoomWin(0); setRoomLft(26); setRoomLin(0)
    setDeskW(30); setDeskD(24); setDeskSeats(1)
    setLayoutId('sides_center')
    setFillMax(false); setTarget(28)
    setAisle(36); setRowGap(30); setFront(60); setPerim(4)
    setTeachers([{ cx: 180, cy: 42, w: 48, d: 24, rot: 0 }])
    setDoors([{ wall: 'left', pos: 30, len: 36 }, { wall: 'right', pos: 288, len: 36 }])
    setSel(null)
  }

  const { autoDesks, cap, firstAisleX, firstRowY } = useMemo(() => {
    let res: BuildResult
    if (layout.kind === 'grid') res = buildGrid(room, desk, sp, layout.cCols ?? 1, layout.cRows ?? 1)
    else if (layout.kind === 'perim') res = buildPerimeter(room, desk, sp, layout.facing ?? 'out')
    else if (layout.kind === 'lanes') res = buildLanes(room, desk, sp)
    else res = buildHorseshoe(room, desk, sp, layout.rings ?? 1)
    const zones = doors.map((dr) => doorClear(dr, room))
    const dk = clearOfDoors(res.desks, zones).map((d) => ({ ...d }))
    const capF = dk.length
    const shown = fillMax ? dk : dk.slice(0, Math.min(target, capF))
    if (showADA) markADA(shown)
    let fa: { a: number; b: number } | null = null
    let fry: { a: number; b: number } | null = null
    if (layout.kind === 'grid' && shown.length) {
      const minY = Math.min(...shown.map((x) => x.cy))
      const topRow = shown.filter((d) => Math.abs(d.cy - minY) < 1).sort((a, b) => a.cx - b.cx)
      for (let i = 1; i < topRow.length; i++) {
        const gap = (topRow[i].cx - topRow[i].w / 2) - (topRow[i - 1].cx + topRow[i - 1].w / 2)
        if (gap > INTRA + 4) { fa = { a: topRow[i - 1].cx + topRow[i - 1].w / 2, b: topRow[i].cx - topRow[i].w / 2 }; break }
      }
      const rowsCy = [...new Set(shown.map((d) => Math.round(d.cy)))].sort((a, b) => a - b)
      if (rowsCy.length >= 2) {
        const r1b = Math.max(...shown.filter((d) => Math.round(d.cy) === rowsCy[0]).map((d) => bboxOf(d).b))
        const r2t = Math.min(...shown.filter((d) => Math.round(d.cy) === rowsCy[1]).map((d) => bboxOf(d).t))
        if (r2t - r1b > 1) fry = { a: r1b, b: r2t }
      }
    }
    return { autoDesks: shown, cap: capF, firstAisleX: fa, firstRowY: fry }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomWft, roomWin, roomLft, roomLin, deskW, deskD, deskSeats, target, fillMax, showADA, layoutId, aisle, rowGap, front, perim, doors])

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ kind: SelKind; idx: number; dx?: number; dy?: number } | null>(null)
  const snapRef = useRef(snap); snapRef.current = snap
  const roomRef = useRef(room); roomRef.current = room
  const teachersRef = useRef(teachers); teachersRef.current = teachers
  const frontRef = useRef(front); frontRef.current = front

  const desks = manual ? studentDesks : autoDesks
  const seedFromAuto = () => setStudentDesks(autoDesks.map((d) => ({ ...d })))
  const enterManual = () => { seedFromAuto(); setSel(null); setManual(true) }

  const exportImage = () => {
    const svg = svgRef.current
    if (!svg || typeof window === 'undefined') return
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const vb = svg.viewBox.baseVal
    const vbW = vb && vb.width ? vb.width : room.w + 68
    const vbH = vb && vb.height ? vb.height : room.l + 68
    const scale = Math.min(3, Math.max(1, 1600 / vbW)) // crisp output ~1600px wide
    const outW = Math.round(vbW * scale)
    const outH = Math.round(vbH * scale)
    clone.setAttribute('width', String(outW))
    clone.setAttribute('height', String(outH))
    const xml = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); return }
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, outW, outH)
      ctx.drawImage(img, 0, 0, outW, outH)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return
        const base = (manual ? 'custom' : layout.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        const dl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = dl
        a.download = `classroom-${base || 'layout'}-${desks.length}-desks.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(dl)
      }, 'image/png')
    }
    img.onerror = () => URL.revokeObjectURL(url)
    img.src = url
  }

  function clientToInches(cx: number, cy: number) {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy
    const ctm = svg.getScreenCTM(); if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function onItemDown(kind: SelKind, idx: number, e: React.PointerEvent) {
    e.stopPropagation()
    if (kind === 'desk' && !manual) return
    const { x, y } = clientToInches(e.clientX, e.clientY)
    if (kind === 'door') dragRef.current = { kind, idx }
    else { const it = (kind === 'desk' ? studentDesks : teachers)[idx]; dragRef.current = { kind, idx, dx: x - it.cx, dy: y - it.cy } }
    setSel({ kind, idx })
  }
  const onBackgroundDown = () => setSel(null)

  useEffect(() => {
    function move(e: PointerEvent) {
      const drag = dragRef.current; if (!drag) return
      const { x, y } = clientToInches(e.clientX, e.clientY)
      const rm = roomRef.current
      if (drag.kind === 'desk') {
        setStudentDesks((prev) => {
          const next = prev.slice(); const d = next[drag.idx]; if (!d) return prev
          const ww = effW(d), hh = effH(d)
          let nx = x - (drag.dx ?? 0), ny = y - (drag.dy ?? 0)
          if (snapRef.current) {
            const others: Box[] = []
            next.forEach((o, i) => { if (i !== drag.idx) others.push(bboxOf(o)) })
            teachersRef.current.forEach((o) => others.push(bboxOf(o)))
            const es = edgeSnap(nx, ny, ww, hh, others, 7)
            nx = es.snappedX ? es.x : Math.round(nx / 6) * 6
            ny = es.snappedY ? es.y : Math.round(ny / 6) * 6
          }
          next[drag.idx] = { ...d, cx: clamp(nx, ww / 2, rm.w - ww / 2), cy: clamp(ny, hh / 2, rm.l - hh / 2) }
          return next
        })
      } else if (drag.kind === 'teacher') {
        setTeachers((prev) => {
          const next = prev.slice(); const d = next[drag.idx]; if (!d) return prev
          const ww = effW(d), hh = effH(d)
          let nx = x - (drag.dx ?? 0), ny = y - (drag.dy ?? 0)
          if (snapRef.current) { nx = Math.round(nx / 6) * 6; ny = Math.round(ny / 6) * 6 }
          next[drag.idx] = { ...d, cx: clamp(nx, ww / 2, rm.w - ww / 2), cy: clamp(ny, hh / 2, rm.l - hh / 2) }
          return next
        })
      } else if (drag.kind === 'door') {
        setDoors((prev) => {
          const next = prev.slice(); const dr = next[drag.idx]; if (!dr) return prev
          const px = clamp(x, 0, rm.w), py = clamp(y, 0, rm.l)
          const dist: Record<string, number> = { left: px, right: rm.w - px, top: py, bottom: rm.l - py }
          let wall: Wall = 'left', best = Infinity
          for (const k in dist) if (dist[k] < best) { best = dist[k]; wall = k as Wall }
          const len = dr.len || 36
          let pos = (wall === 'left' || wall === 'right') ? py : px
          if (snapRef.current) pos = Math.round(pos / 6) * 6
          const mx = (wall === 'left' || wall === 'right') ? rm.l : rm.w
          next[drag.idx] = { ...dr, wall, pos: clamp(pos, len / 2, mx - len / 2) }
          return next
        })
      }
    }
    function up() { dragRef.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  // contextual actions
  const canRotate = !!sel && ((sel.kind === 'desk' && manual) || sel.kind === 'teacher')
  const canAda = !!sel && sel.kind === 'desk' && manual
  const canDelete = !!sel && (sel.kind === 'teacher' || sel.kind === 'door' || (sel.kind === 'desk' && manual))

  const rotateSel = () => {
    if (!sel) return
    if (sel.kind === 'desk' && manual) setStudentDesks((p) => p.map((d, i) => i === sel.idx ? { ...d, rot: (d.rot + 90) % 360 } : d))
    else if (sel.kind === 'teacher') setTeachers((p) => p.map((d, i) => i === sel.idx ? { ...d, rot: (d.rot + 90) % 360 } : d))
  }
  const toggleAdaSel = () => { if (canAda && sel) setStudentDesks((p) => p.map((d, i) => i === sel.idx ? { ...d, ada: !d.ada } : d)) }
  const deleteSel = () => {
    if (!sel) return
    if (sel.kind === 'desk' && manual) setStudentDesks((p) => p.filter((_, i) => i !== sel.idx))
    else if (sel.kind === 'teacher') setTeachers((p) => p.filter((_, i) => i !== sel.idx))
    else if (sel.kind === 'door') setDoors((p) => p.filter((_, i) => i !== sel.idx))
    setSel(null)
  }
  const addDesk = () => setStudentDesks((prev) => { setSel({ kind: 'desk', idx: prev.length }); return [...prev, { cx: roomRef.current.w / 2, cy: roomRef.current.l / 2, w: deskW, d: deskD, rot: 0, seats: deskSeats }] })
  const addTeacher = () => setTeachers((prev) => { setSel({ kind: 'teacher', idx: prev.length }); return [...prev, { cx: roomRef.current.w / 2, cy: Math.max(18, frontRef.current - 22), w: 48, d: 24, rot: 0 }] })
  const addDoor = () => setDoors((prev) => { setSel({ kind: 'door', idx: prev.length }); return [...prev, { wall: 'bottom', pos: roomRef.current.w / 2, len: 36 }] })

  const canDup = !!sel && ((sel.kind === 'desk' && manual) || sel.kind === 'teacher')
  const canSeats = !!sel && sel.kind === 'desk' && manual
  const selSeats = canSeats && sel ? Math.max(1, studentDesks[sel.idx]?.seats || Math.round((studentDesks[sel.idx]?.w || 24) / 26)) : 0
  const cycleSeats = () => { if (canSeats && sel) setStudentDesks((p) => p.map((d, i) => i === sel.idx ? { ...d, seats: ((Math.max(1, d.seats || 1)) % 4) + 1 } : d)) }
  const dupSel = () => {
    if (!sel) return
    if (sel.kind === 'desk' && manual) setStudentDesks((p) => { const it = { ...p[sel.idx], cx: p[sel.idx].cx + 12, cy: p[sel.idx].cy + 12 }; setSel({ kind: 'desk', idx: p.length }); return [...p, it] })
    else if (sel.kind === 'teacher') setTeachers((p) => { const it = { ...p[sel.idx], cx: p[sel.idx].cx + 12, cy: p[sel.idx].cy + 12 }; setSel({ kind: 'teacher', idx: p.length }); return [...p, it] })
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      const tag = ((e.target as HTMLElement | null)?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (!sel) return
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotateSel() }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel() }
      else if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, manual])

  /* saved layouts */
  const [hasStore, setHasStore] = useState(false)
  const [saved, setSaved] = useState<Saved[]>([])
  const [nameInput, setNameInput] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    setHasStore(true)
    ;(async () => {
      try { const r = await Store.get(STORE_KEY); if (r && r.value) setSaved(JSON.parse(r.value)) } catch { /* ignore */ }
    })()
  }, [])
  const persist = async (next: Saved[]) => { setSaved(next); if (!hasStore) return; try { await Store.set(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ } }

  const placed = desks.length
  const adaCount = desks.filter((d) => d.ada).length
  const areaSqft = (room.w * room.l) / 144
  const perStudent = placed ? (areaSqft / placed).toFixed(1) : '—'

  const saveCurrent = () => {
    const name = nameInput.trim() || `${manual ? 'Custom' : layout.name} · ${placed} desks`
    const snapshot: Saved = {
      id: Date.now().toString(36), name, createdAt: Date.now(), count: placed,
      roomWft, roomWin, roomLft, roomLin, deskW, deskD, deskSeats, layoutId, target, fillMax, showADA,
      aisle, rowGap, front, perim, manual,
      studentDesks: manual ? studentDesks.map((d) => ({ ...d })) : null,
      teachers: teachers.map((t) => ({ ...t })), doors: doors.map((d) => ({ ...d })),
    }
    persist([snapshot, ...saved]); setNameInput('')
  }
  const loadSnap = (s: Saved) => {
    setRoomWft(s.roomWft); setRoomWin(s.roomWin || 0); setRoomLft(s.roomLft); setRoomLin(s.roomLin || 0)
    setDeskW(s.deskW); setDeskD(s.deskD); setDeskSeats(s.deskSeats || 1); setLayoutId(s.layoutId); setTarget(s.target); setFillMax(s.fillMax); setShowADA(s.showADA)
    setAisle(s.aisle); setRowGap(s.rowGap); setFront(s.front); setPerim(s.perim)
    setTeachers((s.teachers || []).map((t) => ({ ...t }))); setDoors((s.doors || []).map((d) => ({ ...d })))
    setSel(null)
    if (s.manual && s.studentDesks) { setStudentDesks(s.studentDesks.map((d) => ({ ...d }))); setManual(true) } else setManual(false)
  }
  const delSnap = (id: string) => persist(saved.filter((s) => s.id !== id))
  const startRename = (s: Saved) => { setRenamingId(s.id); setRenameText(s.name) }
  const commitRename = () => { if (renamingId == null) return; persist(saved.map((s) => s.id === renamingId ? { ...s, name: renameText.trim() || s.name } : s)); setRenamingId(null) }

  const warnings: string[] = []
  if (!manual) {
    if (!fillMax && target > cap) warnings.push(`Only ${cap} desks fit at these settings — ${target - cap} short. Tighten spacing, shrink desks, or lower the count.`)
    if (ap.aisle && aisle < 36) warnings.push("Aisles under 36″ don't meet the ADA wheelchair-route width.")
    if (!ap.aisle && adaRouteVal < 36) warnings.push('The open route between desks is under 36″ — below the ADA wheelchair-route width.')
    if (ap.rowGap && rowGap < 24) warnings.push('Under 24″ between rows is tight to walk through.')
    if (ap.front && front < 48) warnings.push('Under 48″ at the front leaves little teaching space.')
    if (ap.perim && perim < 18) warnings.push('Perimeter under 18″ makes wall seats hard to reach.')
  }

  return (
    <div style={{ background: C.shell, minHeight: '100vh', color: C.ink, fontFamily: "'Public Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .cls-root * { box-sizing: border-box; }
        .cls-root input[type=number]::-webkit-inner-spin-button { opacity:.4; }
        .cls-range { -webkit-appearance:none; appearance:none; width:100%; height:3px; border-radius:3px; background:${C.line}; outline:none; }
        .cls-range::-webkit-slider-thumb { -webkit-appearance:none; width:15px; height:15px; border-radius:50%; background:${C.accent}; cursor:pointer; border:2px solid #fff; box-shadow:0 0 0 1px ${C.line}; }
        .cls-range::-moz-range-thumb { width:13px; height:13px; border-radius:50%; background:${C.accent}; cursor:pointer; border:2px solid #fff; }
        .cls-btn:focus-visible, .cls-root input:focus-visible { outline:2px solid ${C.accent}; outline-offset:1px; }
        .cls-main { display:grid; grid-template-columns: 286px 1fr; gap:16px; padding:16px; max-width:1280px; margin:0 auto; align-items:start; }
        @media (max-width: 900px){ .cls-main { grid-template-columns:1fr; } }
        .cls-saved { display:grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr)); gap:10px; }
        @media (prefers-reduced-motion: reduce){ .cls-root g { transition:none !important; } }
      `}</style>

      <div className="cls-root">
      <header style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <svg width="22" height="22" viewBox="0 0 22 22"><rect x="1.5" y="1.5" width="19" height="19" rx="2" fill="none" stroke={C.accent} strokeWidth="1.6" /><line x1="1.5" y1="8" x2="20.5" y2="8" stroke={C.accent} strokeWidth="1.2" /><line x1="8" y1="8" x2="8" y2="20.5" stroke={C.accent} strokeWidth="1.2" /><rect x="11" y="11" width="6" height="6" rx="1" fill={C.accentSoft} stroke={C.accent} strokeWidth="1" /></svg>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: '-.01em' }}>Classroom Planner</span>
          <span style={{ fontSize: 12.5, color: C.faint }}>room layout & spacing</span>
        </div>
      </header>

      <div className="cls-main">
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel title="Room">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Width"><FtIn ft={roomWft} inch={roomWin} setFt={setRoomWft} setIn={setRoomWin} /></Field>
              <Field label="Length"><FtIn ft={roomLft} inch={roomLin} setFt={setRoomLft} setIn={setRoomLin} /></Field>
            </div>
            <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.faint }}>{Math.round(areaSqft)} sq ft · length runs front → back</div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}` }}>
              <Btn size="sm" onClick={loadD131}>Load D131 (Video Production)</Btn>
            </div>
          </Panel>

          <Panel title="Desk">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 11 }}>
              {DESK_PRESETS.map((p) => {
                const on = deskW === p.w && deskD === p.d
                return <button key={p.name} className="cls-btn" onClick={() => { setDeskW(p.w); setDeskD(p.d); setDeskSeats(p.seats) }}
                  style={{ cursor: 'pointer', border: `1px solid ${on ? C.accent : C.line}`, background: on ? C.accentSoft : C.paper, color: on ? C.accentDeep : C.muted, borderRadius: 5, padding: '4px 9px', fontSize: 12, fontWeight: 500 }}>{p.name}</button>
              })}
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              <Field label="Width"><NumInput value={deskW} set={setDeskW} min={12} max={72} suffix="in" /></Field>
              <Field label="Depth"><NumInput value={deskD} set={setDeskD} min={12} max={48} suffix="in" /></Field>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>Chairs per desk</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} className="cls-btn" onClick={() => setDeskSeats(n)}
                    style={{ cursor: 'pointer', width: 30, height: 28, border: `1px solid ${deskSeats === n ? C.accent : C.line}`, background: deskSeats === n ? C.accentSoft : C.paper, color: deskSeats === n ? C.accentDeep : C.muted, borderRadius: 5, fontSize: 13, fontWeight: 600 }}>{n}</button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Arrangement">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {LAYOUTS.map((l) => {
                const on = l.id === layoutId && !manual
                return <button key={l.id} className="cls-btn" onClick={() => { setManual(false); setLayoutId(l.id) }}
                  style={{ cursor: 'pointer', textAlign: 'left', border: `1px solid ${on ? C.accent : C.line}`, background: on ? C.accentSoft : C.paper, borderRadius: 6, padding: '8px 9px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: on ? C.accentDeep : C.ink }}>{l.name}</div>
                  <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, lineHeight: 1.3 }}>{l.blurb}</div>
                </button>
              })}
            </div>
          </Panel>

          <Panel title="Desk count">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ flex: 1, opacity: fillMax ? 0.4 : 1, pointerEvents: fillMax ? 'none' : 'auto' }}>
                <Field label="Target"><NumInput value={target} set={setTarget} min={1} max={120} /></Field>
              </div>
              <div style={{ paddingBottom: 8 }}><Check on={fillMax} set={setFillMax} label="Fill the room" /></div>
            </div>
          </Panel>

          <Panel title="Spacing">
            {manual && <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 11, padding: '7px 9px', background: C.accentSoft, border: `1px solid ${C.line}`, borderRadius: 5 }}>These shape the <b>auto</b> layout. You&apos;re arranging by hand — drag desks to move them, or switch back to auto.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Slider label="Aisle width" value={aisle} set={setAisle} min={0} max={60} rec={36} recLabel="≥ 36″ (ADA route)" suffix="″" disabled={!ap.aisle} naNote={layout.kind === 'u' ? 'only used with 2+ rings' : layout.kind === 'lanes' ? 'auto — set by room width' : 'no walking aisle in this arrangement'} />
              <Slider label="Between rows" value={rowGap} set={setRowGap} min={0} max={60} rec={30} recLabel="≈ 30″ (3 ft)" suffix="″" disabled={!ap.rowGap} naNote="no front-to-back rows in this arrangement" />
              <Slider label="Front clearance" value={front} set={setFront} min={0} max={144} rec={60} recLabel="60–120″ board to row 1" suffix="″" />
              <Slider label="Perimeter" value={perim} set={setPerim} min={0} max={60} rec={36} recLabel="≈ 36″ at the back" suffix="″" />
            </div>
          </Panel>
        </aside>

        <main style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, overflow: 'hidden' }}>
            <Metric value={`${placed}`} label={manual || fillMax ? 'desks placed' : `of ${target} placed`} flag={!manual && !fillMax && target > cap} />
            <Metric value={manual ? '—' : `${cap}`} label={manual ? 'manual' : 'max capacity'} />
            <Metric value={perStudent} label="sq ft / student" />
            <Metric value={`${adaCount}`} label="accessible" tone={C.amber} />
            <Metric value={manual ? 'manual' : (adaRouteVal >= 36 ? 'pass' : 'tight')} label={manual ? 'spacing' : adaRouteLabel} tone={manual ? C.muted : (adaRouteVal >= 36 ? C.ok : C.warn)} last />
          </div>

          <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderBottom: `1px solid ${C.lineSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 700, fontSize: 14 }}>{manual ? 'Custom arrangement' : layout.name}</span>
                <Check on={showADA} set={setShowADA} label="Accessible seats" />
                <Check on={showDims} set={setShowDims} label="Measurements" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: 5, overflow: 'hidden' }}>
                  <button className="cls-btn" onClick={() => setCad(true)} style={{ cursor: 'pointer', border: 'none', padding: '5px 10px', fontSize: 12, fontWeight: 600, fontFamily: "'Public Sans',sans-serif", background: cad ? C.accent : C.paper, color: cad ? '#fff' : C.muted }}>Drafting</button>
                  <button className="cls-btn" onClick={() => setCad(false)} style={{ cursor: 'pointer', border: 'none', borderLeft: `1px solid ${C.line}`, padding: '5px 10px', fontSize: 12, fontWeight: 600, fontFamily: "'Public Sans',sans-serif", background: !cad ? C.accent : C.paper, color: !cad ? '#fff' : C.muted }}>Color</button>
                </div>
                <Btn size="sm" onClick={exportImage}>⤓ Export PNG</Btn>
                <Btn kind={manual ? 'primary' : 'default'} size="sm" onClick={() => (manual ? setManual(false) : enterManual())}>{manual ? '← Back to auto' : 'Manual arrange'}</Btn>
              </div>
            </div>

            {/* fixtures + edit toolbar (always available) */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '9px 12px', borderBottom: `1px solid ${C.lineSoft}`, background: C.accentSoft }}>
              {manual && <Btn kind="primary" size="sm" onClick={addDesk}>+ Desk</Btn>}
              <Btn size="sm" onClick={addTeacher}>+ Teacher desk</Btn>
              <Btn size="sm" onClick={addDoor}>+ Door</Btn>
              <span style={{ width: 1, height: 18, background: C.line, margin: '0 3px' }} />
              <Btn size="sm" onClick={rotateSel} disabled={!canRotate}>⟳ Rotate</Btn>
              <Btn size="sm" onClick={dupSel} disabled={!canDup}>⧉ Duplicate</Btn>
              <Btn size="sm" onClick={toggleAdaSel} disabled={!canAda}>♿ Accessible</Btn>
              <Btn size="sm" onClick={cycleSeats} disabled={!canSeats}>Chairs {canSeats ? selSeats : ''}</Btn>
              <Btn kind="danger" size="sm" onClick={deleteSel} disabled={!canDelete}>✕ Delete</Btn>
              <span style={{ width: 1, height: 18, background: C.line, margin: '0 3px' }} />
              <Btn size="sm" active={snap} onClick={() => setSnap((v) => !v)}>Snap {snap ? 'on' : 'off'}</Btn>
              {manual && <Btn size="sm" onClick={() => { seedFromAuto(); setSel(null) }}>↺ Reset desks</Btn>}
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.faint }}>drag · R rotate · Del remove</span>
            </div>

            <div style={{ padding: 12 }}>
              <Plan room={room} desks={desks} teachers={teachers} doors={doors} sp={sp} showADA={showADA} firstAisleX={manual ? null : firstAisleX} firstRowY={manual ? null : firstRowY}
                manual={manual} showFrontGuide={!manual && ap.front && !cad} showDims={showDims} sel={sel} onItemDown={onItemDown} onBackgroundDown={onBackgroundDown} svgRef={svgRef} pal={pal} />
              <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', marginTop: 9, fontSize: 11, color: C.muted }}>
                <Legend color={pal.deskFill} edge={pal.deskEdge} label={`Desk ${deskW}″ × ${deskD}″`} />
                <Legend color={pal.amberSoft} edge={pal.amber} label="Accessible (30×48 clear floor)" />
                <Legend color={pal.sageSoft} edge={pal.sage} label="Teacher desk" />
              </div>
            </div>
          </section>

          <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, padding: '11px 12px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Name this layout…"
                onKeyDown={(e) => { if (e.key === 'Enter') saveCurrent() }}
                style={{ flex: 1, minWidth: 160, height: 34, border: `1px solid ${C.line}`, borderRadius: 5, padding: '0 11px', fontSize: 13, fontFamily: "'Public Sans',sans-serif", color: C.ink, outline: 'none' }} />
              <Btn kind="primary" onClick={saveCurrent}>Save layout</Btn>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: C.faint }}>{hasStore ? 'Saved layouts are kept in this browser across sessions.' : 'Saved for this session only — persistent storage isn’t available here.'}</div>
          </section>

          <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 13px', borderBottom: `1px solid ${C.lineSoft}` }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: "'Archivo',sans-serif" }}>Saved layouts</h2>
              <span style={{ fontSize: 12, color: C.faint, fontFamily: "'IBM Plex Mono',monospace" }}>{saved.length}</span>
            </div>
            <div style={{ padding: 13 }}>
              {saved.length === 0 ? (
                <div style={{ fontSize: 13, color: C.faint, padding: '10px 2px' }}>No saved layouts yet. Build one and hit <b style={{ color: C.muted }}>Save layout</b> to keep it here.</div>
              ) : (
                <div className="cls-saved">
                  {saved.map((s) => {
                    const sroom = { w: s.roomWft * 12 + (s.roomWin || 0), l: s.roomLft * 12 + (s.roomLin || 0) }
                    return (
                      <div key={s.id} style={{ border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', background: C.paper }}>
                        <div style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                          <MiniPlan room={sroom} desks={s.manual && s.studentDesks ? s.studentDesks : previewDesks(s)} teachers={s.teachers} />
                        </div>
                        <div style={{ padding: '8px 9px' }}>
                          {renamingId === s.id ? (
                            <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)} onBlur={commitRename}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                              style={{ width: '100%', border: `1px solid ${C.accent}`, borderRadius: 4, padding: '3px 6px', fontSize: 12.5, fontFamily: "'Public Sans',sans-serif" }} />
                          ) : (
                            <div onDoubleClick={() => startRename(s)} title="Double-click to rename" style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                          )}
                          <div style={{ fontSize: 10.5, color: C.faint, fontFamily: "'IBM Plex Mono',monospace", marginTop: 3 }}>{s.count} desks · {new Date(s.createdAt).toLocaleDateString()}</div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                            <Btn size="sm" onClick={() => loadSnap(s)}>Load</Btn>
                            <Btn size="sm" kind="ghost" onClick={() => startRename(s)}>Rename</Btn>
                            <span style={{ flex: 1 }} />
                            <Btn size="sm" kind="danger" onClick={() => delSnap(s.id)}>Delete</Btn>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          {warnings.length > 0 && (
            <div style={{ background: '#FBF1EE', border: `1px solid ${C.warn}33`, borderRadius: 7, padding: '11px 13px' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.warn, marginBottom: 4, fontFamily: "'Archivo',sans-serif" }}>Spacing notes</div>
              <ul style={{ margin: 0, paddingLeft: 17, color: C.ink, fontSize: 13, lineHeight: 1.5 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          <details style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, padding: '11px 13px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: "'Archivo',sans-serif" }}>Where the spacing numbers come from</summary>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginTop: 8 }}>
              <p style={{ margin: '0 0 6px' }}><b style={{ color: C.ink }}>36″ aisles</b> — the ADA minimum continuous clear width for an accessible route; at least one 36″ path should reach every seating area.</p>
              <p style={{ margin: '0 0 6px' }}><b style={{ color: C.ink }}>~30″ between rows</b> — common guidance for traditional classrooms; 36–48″ feels more comfortable.</p>
              <p style={{ margin: '0 0 6px' }}><b style={{ color: C.ink }}>Front clearance</b> — universities often spec ~10 ft from the board to row 1; K-12 rooms typically use less. 5 ft is a reasonable default.</p>
              <p style={{ margin: '0 0 6px' }}><b style={{ color: C.ink }}>Accessible seats</b> — about 5% of seating (at least one), spread around the room, each with a 30″×48″ clear floor space.</p>
              <p style={{ margin: 0, fontSize: 12, color: C.faint }}>Planning defaults, not a code review. Local fire and building codes set the legal minimums — confirm capacity and egress with your facilities team.</p>
            </div>
          </details>
        </main>
      </div>
      </div>
    </div>
  )
}

function previewDesks(s: Saved): Item[] {
  const room = { w: s.roomWft * 12 + (s.roomWin || 0), l: s.roomLft * 12 + (s.roomLin || 0) }
  const desk = { w: s.deskW, d: s.deskD, seats: s.deskSeats || 1 }
  const sp = { aisle: s.aisle, rowGap: s.rowGap, front: s.front, perim: s.perim }
  const lay = LAYOUTS.find((l) => l.id === s.layoutId) || LAYOUTS[0]
  const res = lay.kind === 'grid' ? buildGrid(room, desk, sp, lay.cCols ?? 1, lay.cRows ?? 1)
    : lay.kind === 'perim' ? buildPerimeter(room, desk, sp, lay.facing ?? 'out')
      : lay.kind === 'lanes' ? buildLanes(room, desk, sp)
        : buildHorseshoe(room, desk, sp, lay.rings ?? 1)
  const zones = (s.doors || []).map((dr) => doorClear(dr, room))
  const dk = clearOfDoors(res.desks, zones)
  return s.fillMax ? dk : dk.slice(0, Math.min(s.target, dk.length))
}

function Metric({ value, label, tone, flag, last }: { value: string; label: string; tone?: string; flag?: boolean; last?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '10px 13px', borderRight: last ? 'none' : `1px solid ${C.lineSoft}`, minWidth: 70 }}>
      <div style={{ fontFamily: "'Archivo',sans-serif", fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: flag ? C.warn : (tone || C.ink) }}>{value}</div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{label}</div>
    </div>
  )
}

function Legend({ color, edge, label }: { color: string; edge: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 13, height: 11, borderRadius: 2, background: color, border: `1px solid ${edge}`, display: 'inline-block' }} />
      {label}
    </span>
  )
}
