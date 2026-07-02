'use client'

// In-app schematic floor-plan builder. Instead of an uploaded floor-plan image,
// you sketch the floor with simple labeled boxes (rooms/zones) and drop your
// screens onto them. Everything is stored as percentages of the canvas so it
// scales with the display. Scoped to the active location.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { useSignage } from './SignageProvider'
import { useSignageAdminStyles } from './SignageAdmin'
import { useTheme } from '@/lib/theme'

type Room = { id: string; site_id: string; floor: number; label: string; area_id: string | null; x: number; y: number; w: number; h: number; sort_order: number }
type MapScreen = { id: string; name: string; floor: number | null; pos_x: number | null; pos_y: number | null; ablesign_screen_id: number | null; ablesign_online: boolean | null }

// Colors used to group rooms by their Area (a zone that contains many rooms).
const AREA_COLORS = ['#1e6cb5', '#0f9d58', '#e0a23f', '#db4437', '#8e44ad', '#16a085', '#d4537e', '#6366f1']

type Drag =
  | { kind: 'room-move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'room-resize'; id: string; startX: number; startY: number; origW: number; origH: number }
  | { kind: 'screen'; id: string }
  | null

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export default function SignageFloorPlanBuilder() {
  const supabase = useMemo(() => createClient(), [])
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const { activeSiteId, areas } = useSignage()

  // Stable color per area so a whole zone (e.g. "Computer Science Area") reads as one group.
  const areaColor = useMemo(() => {
    const m = new Map<string, string>()
    areas.forEach((a, i) => m.set(a.id, AREA_COLORS[i % AREA_COLORS.length]))
    return m
  }, [areas])
  const areaName = (id: string | null) => areas.find(a => a.id === id)?.name ?? null

  const [rooms, setRooms] = useState<Room[]>([])
  const [screens, setScreens] = useState<MapScreen[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [floor, setFloor] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag>(null)
  const roomsRef = useRef<Room[]>([])
  const screensRef = useRef<MapScreen[]>([])
  roomsRef.current = rooms
  screensRef.current = screens

  const load = useCallback(async () => {
    if (!activeSiteId) { setRooms([]); setScreens([]); setLoading(false); return }
    setLoading(true)
    const [rRes, sRes] = await Promise.all([
      supabase.from('signage_floor_rooms').select('*').eq('site_id', activeSiteId).order('sort_order'),
      supabase.from('signage_screens').select('id, name, floor, pos_x, pos_y, ablesign_screen_id, ablesign_online').eq('site_id', activeSiteId),
    ])
    setRooms((rRes.data as Room[]) || [])
    setScreens((sRes.data as MapScreen[]) || [])
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void load() }, [load])

  const floors = useMemo(() => {
    const set = new Set<number>([1])
    rooms.forEach(r => set.add(r.floor))
    screens.forEach(sc => { if (sc.floor != null) set.add(sc.floor) })
    return Array.from(set).sort((a, b) => a - b)
  }, [rooms, screens])

  useEffect(() => { if (!floors.includes(floor)) setFloor(floors[0] ?? 1) }, [floors, floor])

  const floorRooms = rooms.filter(r => r.floor === floor)
  const floorScreens = screens.filter(sc => (sc.floor ?? 1) === floor)

  // Drag move/resize (rooms) and reposition (screens), persisted on release.
  useEffect(() => {
    if (!editing) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      const canvas = canvasRef.current
      if (!d || !canvas) return
      const rect = canvas.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / rect.width) * 100
      const py = ((e.clientY - rect.top) / rect.height) * 100
      if (d.kind === 'room-move') {
        const dx = px - d.startX
        const dy = py - d.startY
        setRooms(prev => prev.map(r => r.id === d.id ? { ...r, x: clamp(d.origX + dx, 0, 100 - r.w), y: clamp(d.origY + dy, 0, 100 - r.h) } : r))
      } else if (d.kind === 'room-resize') {
        const dx = px - d.startX
        const dy = py - d.startY
        setRooms(prev => prev.map(r => r.id === d.id ? { ...r, w: clamp(d.origW + dx, 8, 100 - r.x), h: clamp(d.origH + dy, 6, 100 - r.y) } : r))
      } else if (d.kind === 'screen') {
        setScreens(prev => prev.map(sc => sc.id === d.id ? { ...sc, pos_x: clamp(px, 0, 100), pos_y: clamp(py, 0, 100) } : sc))
      }
    }
    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      if (!d) return
      if (d.kind === 'room-move' || d.kind === 'room-resize') {
        const r = roomsRef.current.find(x => x.id === d.id)
        if (r) void supabase.from('signage_floor_rooms').update({ x: r.x, y: r.y, w: r.w, h: r.h, updated_at: new Date().toISOString() }).eq('id', r.id)
      } else if (d.kind === 'screen') {
        const sc = screensRef.current.find(x => x.id === d.id)
        if (sc) void supabase.from('signage_screens').update({ pos_x: sc.pos_x, pos_y: sc.pos_y }).eq('id', sc.id)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [editing, supabase])

  const canvasPercent = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { px: ((e.clientX - rect.left) / rect.width) * 100, py: ((e.clientY - rect.top) / rect.height) * 100 }
  }

  const startRoomMove = (e: React.PointerEvent, r: Room) => {
    if (!editing) return
    e.stopPropagation()
    const { px, py } = canvasPercent(e)
    dragRef.current = { kind: 'room-move', id: r.id, startX: px, startY: py, origX: r.x, origY: r.y }
    setSelected(r.id)
  }
  const startRoomResize = (e: React.PointerEvent, r: Room) => {
    if (!editing) return
    e.stopPropagation()
    const { px, py } = canvasPercent(e)
    dragRef.current = { kind: 'room-resize', id: r.id, startX: px, startY: py, origW: r.w, origH: r.h }
    setSelected(r.id)
  }
  const startScreen = (e: React.PointerEvent, sc: MapScreen) => {
    if (!editing) return
    e.stopPropagation()
    dragRef.current = { kind: 'screen', id: sc.id }
    if (sc.pos_x == null) {
      const { px, py } = canvasPercent(e)
      setScreens(prev => prev.map(x => x.id === sc.id ? { ...x, pos_x: px, pos_y: py } : x))
    }
  }

  const addRoom = async () => {
    if (!activeSiteId) return
    const { data, error } = await supabase
      .from('signage_floor_rooms')
      .insert({ site_id: activeSiteId, floor, label: 'Room', x: 35, y: 35, w: 24, h: 18, sort_order: rooms.length })
      .select('*')
      .single()
    if (error) { toast(error.message, 'error'); return }
    if (data) { setRooms(prev => [...prev, data as Room]); setSelected((data as Room).id) }
  }

  const setLabel = (id: string, label: string) => setRooms(prev => prev.map(r => r.id === id ? { ...r, label } : r))
  const saveLabel = (id: string) => {
    const r = roomsRef.current.find(x => x.id === id)
    if (r) void supabase.from('signage_floor_rooms').update({ label: r.label }).eq('id', id)
  }
  const deleteRoom = async (id: string) => {
    await supabase.from('signage_floor_rooms').delete().eq('id', id)
    setRooms(prev => prev.filter(r => r.id !== id))
    setSelected(null)
  }
  const setRoomArea = (id: string, area_id: string | null) => {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, area_id } : r))
    void supabase.from('signage_floor_rooms').update({ area_id }).eq('id', id)
  }
  const addFloor = () => {
    const next = (floors[floors.length - 1] ?? 0) + 1
    setFloor(next)
    setEditing(true)
  }

  const selectedRoom = floorRooms.find(r => r.id === selected) ?? null
  const unplaced = floorScreens.filter(sc => sc.pos_x == null)

  if (!activeSiteId) {
    return <div style={{ ...s.card, color: s.muted }}>Pick a location to build its floor plan.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {floors.map(f => (
            <button key={f} type="button" onClick={() => setFloor(f)} style={{ ...s.seg(f === floor) }}>Floor {f}</button>
          ))}
          <button type="button" onClick={addFloor} style={s.btn} title="Add a floor">+ Floor</button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {editing && <button type="button" onClick={() => void addRoom()} style={s.btn}>+ Room</button>}
          <button
            type="button"
            onClick={() => { setEditing(v => !v); setSelected(null) }}
            style={{ ...(editing ? s.btnPrimary : s.btn) }}
          >
            {editing ? 'Done editing' : 'Edit layout'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ ...s.card, color: s.muted, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          <div
            ref={canvasRef}
            onPointerDown={() => setSelected(null)}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '3 / 2',
              background: 'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(120,140,170,0.10) 39px, rgba(120,140,170,0.10) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(120,140,170,0.10) 39px, rgba(120,140,170,0.10) 40px), var(--surface-2, #fff)',
              border: `1px solid ${s.border}`,
              borderRadius: 12,
              overflow: 'hidden',
              touchAction: 'none',
              cursor: editing ? 'default' : 'default',
            }}
          >
            {floorRooms.map((r, i) => {
              const isSel = selected === r.id
              const col = r.area_id ? (areaColor.get(r.area_id) ?? '#1e6cb5') : '#7c8aa0'
              return (
                <div
                  key={r.id}
                  onPointerDown={e => startRoomMove(e, r)}
                  style={{
                    position: 'absolute',
                    left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`,
                    background: `${col}22`,
                    border: `2px solid ${isSel ? '#2a7fb8' : col}`,
                    borderRadius: 8,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                    color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, textAlign: 'center',
                    padding: 4, boxSizing: 'border-box', overflow: 'hidden',
                    cursor: editing ? 'grab' : 'default', userSelect: 'none',
                  }}
                >
                  <span style={{ pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{r.label || `Room ${i + 1}`}</span>
                  {r.area_id && areaName(r.area_id) && (
                    <span style={{ pointerEvents: 'none', fontSize: 10, fontWeight: 500, color: col, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{areaName(r.area_id)}</span>
                  )}
                  {editing && isSel && (
                    <span
                      onPointerDown={e => startRoomResize(e, r)}
                      style={{ position: 'absolute', right: -6, bottom: -6, width: 14, height: 14, borderRadius: 4, background: '#2a7fb8', border: '2px solid #fff', cursor: 'nwse-resize' }}
                    />
                  )}
                </div>
              )
            })}

            {floorScreens.filter(sc => sc.pos_x != null).map(sc => {
              const online = sc.ablesign_screen_id ? sc.ablesign_online : null
              const dot = online === true ? '#22c55e' : online === false ? '#ef4444' : '#94a3b8'
              return (
                <div
                  key={sc.id}
                  onPointerDown={e => startScreen(e, sc)}
                  style={{ position: 'absolute', left: `${sc.pos_x}%`, top: `${sc.pos_y}%`, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: editing ? 'grab' : 'default', userSelect: 'none' }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: dot, border: '3px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }} />
                  <span style={{ pointerEvents: 'none', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', background: 'rgba(255,255,255,0.85)', borderRadius: 4, padding: '0 4px', whiteSpace: 'nowrap' }}>{sc.name}</span>
                </div>
              )
            })}

            {!floorRooms.length && !floorScreens.some(sc => sc.pos_x != null) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.muted, fontSize: 14, textAlign: 'center', padding: 20 }}>
                {editing ? 'Add rooms with “+ Room”, then drag your screens on from below.' : 'Empty floor. Click “Edit layout” to sketch it.'}
              </div>
            )}
          </div>

          {editing && selectedRoom && (
            <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: s.muted }}>Room label</span>
              <input
                value={selectedRoom.label}
                onChange={e => setLabel(selectedRoom.id, e.target.value)}
                onBlur={() => saveLabel(selectedRoom.id)}
                style={{ ...s.input, flex: 1, minWidth: 140 }}
              />
              <span style={{ fontSize: 12, color: s.muted }}>Area</span>
              <select
                value={selectedRoom.area_id ?? ''}
                onChange={e => setRoomArea(selectedRoom.id, e.target.value || null)}
                style={{ ...s.input, minWidth: 150, width: 'auto' }}
              >
                <option value="">No area</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button type="button" onClick={() => void deleteRoom(selectedRoom.id)} style={{ ...s.btn, color: '#ef4444', borderColor: '#ef4444' }}>Delete room</button>
            </div>
          )}

          {editing && unplaced.length > 0 && (
            <div style={{ ...s.card, padding: 12 }}>
              <div style={{ fontSize: 12, color: s.muted, marginBottom: 8 }}>Drag a screen onto the plan to place it:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {unplaced.map(sc => (
                  <span
                    key={sc.id}
                    onPointerDown={e => startScreen(e, sc)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: `1px solid ${s.border}`, background: 'var(--surface-2, #fff)', cursor: 'grab', fontSize: 13, userSelect: 'none' }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8' }} />{sc.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
