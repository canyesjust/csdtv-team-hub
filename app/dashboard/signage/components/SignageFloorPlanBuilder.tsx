'use client'

// Zone map for a location. The boxes are your AREAS (a building has ~10 zones,
// not 150 rooms), auto-arranged into a grid so it works with zero setup — drag
// to roughly match the real building if you like. Each area shows the screens
// assigned to it, with live status. Reuses data you already maintain; no drawing
// every room. Scoped to the active location + floor.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useSignage } from './SignageProvider'
import { useSignageAdminStyles } from './SignageAdmin'
import { useTheme } from '@/lib/theme'

type Area = { id: string; name: string; floor: number | null; plan_x: number | null; plan_y: number | null; plan_w: number | null; plan_h: number | null }
type ScreenLite = { id: string; name: string; area_id: string | null; floor: number | null; ablesign_screen_id: number | null; ablesign_online: boolean | null }
type Pos = { x: number; y: number; w: number; h: number }
type Drag =
  | { kind: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'resize'; id: string; startX: number; startY: number; origW: number; origH: number }
  | null

const AREA_COLORS = ['#1e6cb5', '#0f9d58', '#e0a23f', '#db4437', '#8e44ad', '#16a085', '#d4537e', '#6366f1']
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export default function SignageFloorPlanBuilder() {
  const supabase = useMemo(() => createClient(), [])
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const { activeSiteId } = useSignage()

  const [areas, setAreas] = useState<Area[]>([])
  const [screens, setScreens] = useState<ScreenLite[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [floor, setFloor] = useState(1)

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag>(null)
  const areasRef = useRef<Area[]>([])
  areasRef.current = areas

  const load = useCallback(async () => {
    if (!activeSiteId) { setAreas([]); setScreens([]); setLoading(false); return }
    setLoading(true)
    const [aRes, sRes] = await Promise.all([
      supabase.from('signage_areas').select('id, name, floor, plan_x, plan_y, plan_w, plan_h').eq('site_id', activeSiteId).order('sort_order'),
      supabase.from('signage_screens').select('id, name, area_id, floor, ablesign_screen_id, ablesign_online').eq('site_id', activeSiteId),
    ])
    setAreas((aRes.data as Area[]) || [])
    setScreens((sRes.data as ScreenLite[]) || [])
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void load() }, [load])

  const floors = useMemo(() => {
    const set = new Set<number>([1])
    areas.forEach(a => set.add(a.floor ?? 1))
    screens.forEach(sc => set.add(sc.floor ?? 1))
    return Array.from(set).sort((a, b) => a - b)
  }, [areas, screens])

  useEffect(() => { if (!floors.includes(floor)) setFloor(floors[0] ?? 1) }, [floors, floor])

  const floorAreas = areas.filter(a => (a.floor ?? 1) === floor)
  const screensByArea = useMemo(() => {
    const m = new Map<string, ScreenLite[]>()
    screens.forEach(sc => { if (sc.area_id) { const l = m.get(sc.area_id) ?? []; l.push(sc); m.set(sc.area_id, l) } })
    return m
  }, [screens])
  const unassigned = screens.filter(sc => !sc.area_id && (sc.floor ?? 1) === floor)

  // Auto-grid the areas that have no saved position, so it looks organized with zero setup.
  const gridSlots = useMemo(() => {
    const un = floorAreas.filter(a => a.plan_x == null)
    const n = Math.max(1, un.length)
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
    const rows = Math.max(1, Math.ceil(n / cols))
    const gap = 3
    const cw = (100 - gap) / cols
    const ch = (100 - gap) / rows
    const map = new Map<string, Pos>()
    un.forEach((a, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      map.set(a.id, { x: gap + c * cw, y: gap + r * ch, w: cw - gap, h: ch - gap })
    })
    return map
  }, [floorAreas])

  const posOf = useCallback((a: Area): Pos => {
    if (a.plan_x != null && a.plan_y != null && a.plan_w != null && a.plan_h != null) {
      return { x: a.plan_x, y: a.plan_y, w: a.plan_w, h: a.plan_h }
    }
    return gridSlots.get(a.id) ?? { x: 8, y: 8, w: 34, h: 26 }
  }, [gridSlots])

  // Drag / resize area boxes, persisted on release.
  useEffect(() => {
    if (!editing) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      const canvas = canvasRef.current
      if (!d || !canvas) return
      const rect = canvas.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / rect.width) * 100
      const py = ((e.clientY - rect.top) / rect.height) * 100
      if (d.kind === 'move') {
        const dx = px - d.startX
        const dy = py - d.startY
        setAreas(prev => prev.map(a => a.id === d.id ? { ...a, plan_x: clamp(d.origX + dx, 0, 100 - (a.plan_w ?? 20)), plan_y: clamp(d.origY + dy, 0, 100 - (a.plan_h ?? 15)) } : a))
      } else {
        const dx = px - d.startX
        const dy = py - d.startY
        setAreas(prev => prev.map(a => a.id === d.id ? { ...a, plan_w: clamp(d.origW + dx, 12, 100 - (a.plan_x ?? 0)), plan_h: clamp(d.origH + dy, 10, 100 - (a.plan_y ?? 0)) } : a))
      }
    }
    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      if (!d) return
      const a = areasRef.current.find(x => x.id === d.id)
      if (a) void supabase.from('signage_areas').update({ plan_x: a.plan_x, plan_y: a.plan_y, plan_w: a.plan_w, plan_h: a.plan_h }).eq('id', a.id)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [editing, supabase])

  const materialize = (a: Area): Area => {
    if (a.plan_x != null) return a
    const p = posOf(a)
    const next = { ...a, plan_x: p.x, plan_y: p.y, plan_w: p.w, plan_h: p.h }
    setAreas(prev => prev.map(x => x.id === a.id ? next : x))
    return next
  }
  const canvasPct = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { px: ((e.clientX - rect.left) / rect.width) * 100, py: ((e.clientY - rect.top) / rect.height) * 100 }
  }
  const startMove = (e: React.PointerEvent, area: Area) => {
    if (!editing) return
    e.stopPropagation()
    const a = materialize(area)
    const { px, py } = canvasPct(e)
    dragRef.current = { kind: 'move', id: a.id, startX: px, startY: py, origX: a.plan_x!, origY: a.plan_y! }
  }
  const startResize = (e: React.PointerEvent, area: Area) => {
    if (!editing) return
    e.stopPropagation()
    const a = materialize(area)
    const { px, py } = canvasPct(e)
    dragRef.current = { kind: 'resize', id: a.id, startX: px, startY: py, origW: a.plan_w!, origH: a.plan_h! }
  }
  const resetLayout = async () => {
    if (!activeSiteId) return
    setAreas(prev => prev.map(a => (a.floor ?? 1) === floor ? { ...a, plan_x: null, plan_y: null, plan_w: null, plan_h: null } : a))
    await supabase.from('signage_areas').update({ plan_x: null, plan_y: null, plan_w: null, plan_h: null }).eq('site_id', activeSiteId).eq('floor', floor)
  }

  if (!activeSiteId) return <div style={{ ...s.card, color: s.muted }}>Pick a location to see its zone map.</div>
  if (loading) return <div style={{ ...s.card, color: s.muted, textAlign: 'center' }}>Loading…</div>

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {floors.map(f => (
            <button key={f} type="button" onClick={() => setFloor(f)} style={{ ...s.seg(f === floor) }}>Floor {f}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {editing && <button type="button" onClick={() => void resetLayout()} style={s.btn}>Auto-arrange</button>}
          <button type="button" onClick={() => setEditing(v => !v)} style={editing ? s.btnPrimary : s.btn}>
            {editing ? 'Done' : 'Arrange'}
          </button>
        </div>
      </div>

      {!floorAreas.length ? (
        <div style={{ ...s.card, color: s.muted, textAlign: 'center', padding: 28 }}>
          No areas on this floor yet. Create zones on the{' '}
          <Link href="/dashboard/signage/areas" style={{ color: s.text, fontWeight: 500 }}>Areas page</Link>, then arrange them here.
        </div>
      ) : (
        <div
          ref={canvasRef}
          style={{
            position: 'relative', width: '100%', aspectRatio: '3 / 2',
            background: 'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(120,140,170,0.10) 39px, rgba(120,140,170,0.10) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(120,140,170,0.10) 39px, rgba(120,140,170,0.10) 40px), var(--surface-2, #fff)',
            border: `1px solid ${s.border}`, borderRadius: 12, overflow: 'hidden', touchAction: 'none',
          }}
        >
          {floorAreas.map((a, i) => {
            const p = posOf(a)
            const col = AREA_COLORS[i % AREA_COLORS.length]
            const list = screensByArea.get(a.id) ?? []
            return (
              <div
                key={a.id}
                onPointerDown={e => startMove(e, a)}
                style={{
                  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%`,
                  background: `${col}18`, border: `2px solid ${col}`, borderRadius: 10, boxSizing: 'border-box',
                  padding: 8, overflow: 'hidden', cursor: editing ? 'grab' : 'default', userSelect: 'none',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, overflow: 'hidden' }}>
                  {list.length === 0 && <span style={{ fontSize: 11, color: s.muted }}>No screens</span>}
                  {list.map(sc => {
                    const online = sc.ablesign_screen_id ? sc.ablesign_online : null
                    const dot = online === true ? '#22c55e' : online === false ? '#ef4444' : '#94a3b8'
                    return (
                      <span key={sc.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.9)', border: `1px solid ${s.border}`, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 500, color: '#1a1f36', maxWidth: '100%' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: 'none' }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sc.name}</span>
                      </span>
                    )
                  })}
                </div>
                {editing && (
                  <span onPointerDown={e => startResize(e, a)} style={{ position: 'absolute', right: -6, bottom: -6, width: 14, height: 14, borderRadius: 4, background: col, border: '2px solid #fff', cursor: 'nwse-resize' }} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <div style={{ ...s.card, padding: 12 }}>
          <div style={{ fontSize: 12, color: s.muted, marginBottom: 8 }}>
            Not in an area yet (assign each to an area on the{' '}
            <Link href="/dashboard/signage/screens" style={{ color: s.text, fontWeight: 500 }}>Screens page</Link> and it moves into the map):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unassigned.map(sc => {
              const online = sc.ablesign_screen_id ? sc.ablesign_online : null
              const dot = online === true ? '#22c55e' : online === false ? '#ef4444' : '#94a3b8'
              return (
                <span key={sc.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: `1px solid ${s.border}`, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot }} />{sc.name}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
