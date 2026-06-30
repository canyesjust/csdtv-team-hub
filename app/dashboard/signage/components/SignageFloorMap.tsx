'use client'

// Interactive floor-plan map for CIC signage screens.
//
// Two modes:
//   - "manage": view screens on the plan, colored by area, with live online
//     status. Toggle "Edit positions" to drag markers (or place unplaced ones)
//     and the new x/y is saved to signage_screens (pos_x/pos_y, as % of image).
//   - "select": used inside the content targeting picker. Click a marker to
//     toggle that screen, or an area in the legend to toggle the whole area.
//     Reads/writes the same TargetingValue the picker already uses.
//
// Positions are percentages (0-100) of the floor image, so they scale with it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import type { TargetingValue } from './SignageAdmin'
import { useSignage } from './SignageProvider'

type MapScreen = {
  id: string
  code: string
  name: string
  area_id: string | null
  building: string | null
  floor: number | null
  active: boolean
  pos_x: number | null
  pos_y: number | null
  ablesign_screen_id: number | null
  ablesign_online: boolean | null
}

type MapArea = { id: string; name: string; floor: number | null }

// Floor-plan backgrounds, keyed by signage_screens.floor.
const FLOOR_BACKGROUNDS: { floor: number; label: string; src: string }[] = [
  { floor: 1, label: 'First floor', src: '/signage/cic-floor-1.webp' },
  { floor: 2, label: 'Second floor', src: '/signage/cic-floor-2.webp' },
]

const AREA_COLORS = [
  '#3b82f6', '#a855f7', '#f59e0b', '#22c55e', '#ec4899',
  '#14b8a6', '#ef4444', '#6366f1', '#84cc16', '#f97316',
]

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

function onlineState(sc: MapScreen): boolean | null {
  return sc.ablesign_screen_id ? sc.ablesign_online : null
}

type Props =
  | { mode: 'manage'; reloadSignal?: number; value?: undefined; onChange?: undefined }
  | { mode: 'select'; value: TargetingValue; onChange: (v: TargetingValue) => void; reloadSignal?: undefined }

export default function SignageFloorMap(props: Props) {
  const { mode } = props
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { activeSiteId } = useSignage()
  const [screens, setScreens] = useState<MapScreen[]>([])
  const [areas, setAreas] = useState<MapArea[]>([])
  const [loading, setLoading] = useState(true)
  const [pickedFloor, setPickedFloor] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [toPlaceId, setToPlaceId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const reloadSignal = props.mode === 'manage' ? props.reloadSignal : undefined
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Scope to the active location so switching sites shows that site's screens.
      if (!activeSiteId) { setScreens([]); setAreas([]); setLoading(false); return }
      setLoading(true)
      const [scRes, arRes] = await Promise.all([
        supabase
          .from('signage_screens')
          .select('id, code, name, area_id, building, floor, active, pos_x, pos_y, ablesign_screen_id, ablesign_online')
          .eq('site_id', activeSiteId)
          .order('name'),
        supabase.from('signage_areas').select('id, name, floor').eq('site_id', activeSiteId).order('sort_order'),
      ])
      if (cancelled) return
      setScreens((scRes.data as MapScreen[]) || [])
      setAreas((arRes.data as MapArea[]) || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, reloadSignal, activeSiteId])

  const areaColor = useMemo(() => {
    const m = new Map<string, string>()
    areas.forEach((a, i) => m.set(a.id, AREA_COLORS[i % AREA_COLORS.length]))
    return m
  }, [areas])

  // Active floor: user's pick, else the first floor that actually has screens.
  const defaultFloor = useMemo(
    () => FLOOR_BACKGROUNDS.find(f => screens.some(s => s.floor === f.floor))?.floor ?? FLOOR_BACKGROUNDS[0].floor,
    [screens],
  )
  const activeFloor = pickedFloor ?? defaultFloor

  const bg = FLOOR_BACKGROUNDS.find(f => f.floor === activeFloor)
  const floorScreens = useMemo(() => screens.filter(s => s.floor === activeFloor), [screens, activeFloor])
  const placed = floorScreens.filter(s => s.pos_x != null && s.pos_y != null)
  const unplaced = floorScreens.filter(s => s.pos_x == null || s.pos_y == null)
  const unmappedCount = screens.filter(s => !FLOOR_BACKGROUNDS.some(f => f.floor === s.floor)).length

  // ---- selection helpers (select mode) ----
  const val = props.mode === 'select' ? props.value : null
  const isScreenSelected = (id: string) => !!val && val.target_screen_ids.includes(id)
  const isAreaSelected = (id: string) => !!val && val.target_area_ids.includes(id)

  function toggleScreen(id: string) {
    if (props.mode !== 'select') return
    const set = new Set(props.value.target_screen_ids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    props.onChange({ all_screens: false, target_area_ids: props.value.target_area_ids, target_screen_ids: [...set] })
  }
  function toggleArea(id: string) {
    if (props.mode !== 'select') return
    const set = new Set(props.value.target_area_ids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    props.onChange({ all_screens: false, target_area_ids: [...set], target_screen_ids: props.value.target_screen_ids })
  }

  // ---- placement (manage + editing) ----
  const persistPos = useCallback(async (id: string, x: number, y: number) => {
    setScreens(prev => prev.map(s => s.id === id ? { ...s, pos_x: x, pos_y: y } : s))
    const { error } = await supabase.from('signage_screens').update({ pos_x: x, pos_y: y }).eq('id', id)
    if (error) toast('Could not save screen position', 'error')
  }, [supabase])

  function pctFromEvent(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 50, y: 50 }
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    }
  }

  // Drag a placed marker while editing.
  useEffect(() => {
    if (!draggingId) return
    const onMove = (e: PointerEvent) => {
      const { x, y } = pctFromEvent(e.clientX, e.clientY)
      setScreens(prev => prev.map(s => s.id === draggingId ? { ...s, pos_x: x, pos_y: y } : s))
    }
    const onUp = (e: PointerEvent) => {
      const { x, y } = pctFromEvent(e.clientX, e.clientY)
      void persistPos(draggingId, x, y)
      setDraggingId(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [draggingId, persistPos])

  // Click on the plan to drop the armed (tray) screen while editing.
  function onPlanClick(e: React.MouseEvent) {
    if (mode !== 'manage' || !editing || !toPlaceId) return
    const { x, y } = pctFromEvent(e.clientX, e.clientY)
    void persistPos(toPlaceId, x, y)
    setToPlaceId(null)
  }

  function onMarkerActivate(sc: MapScreen) {
    if (mode === 'select') { toggleScreen(sc.id); return }
    if (editing) return // editing handled by drag
    // view: jump to the screens admin (where it can be edited / linked)
    router.push('/dashboard/signage/screens')
  }

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const surface1 = 'var(--surface-1)'
  const surface2 = 'var(--surface-2)'

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 13, padding: '6px 14px', borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer',
    border: `1px solid ${active ? 'var(--brand-primary)' : border}`,
    background: active ? 'var(--brand-primary)' : 'transparent',
    color: active ? '#fff' : muted, fontWeight: active ? 600 : 400,
  })

  if (loading) return <div style={{ color: muted, padding: 16 }}>Loading floor plan…</div>

  return (
    <div>
      {/* Controls row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {FLOOR_BACKGROUNDS.map(f => {
          const count = screens.filter(s => s.floor === f.floor).length
          return (
            <button key={f.floor} type="button" onClick={() => { setPickedFloor(f.floor); setToPlaceId(null) }} style={tabBtn(activeFloor === f.floor)}>
              {f.label}{count ? ` (${count})` : ''}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        {mode === 'manage' && (
          <button
            type="button"
            onClick={() => { setEditing(v => !v); setToPlaceId(null) }}
            style={{ ...tabBtn(editing), border: `1px solid ${editing ? 'var(--status-warning)' : border}`, background: editing ? 'var(--status-warning)' : 'transparent', color: editing ? '#1a1f36' : muted }}
          >
            {editing ? '✓ Done editing' : '✎ Edit positions'}
          </button>
        )}
        {mode === 'select' && (
          <button
            type="button"
            onClick={() => props.onChange({ all_screens: !props.value.all_screens, target_area_ids: [], target_screen_ids: [] })}
            style={tabBtn(props.value.all_screens)}
          >
            {props.value.all_screens ? '✓ ' : ''}All screens
          </button>
        )}
      </div>

      {/* Editing hint */}
      {mode === 'manage' && editing && (
        <p style={{ fontSize: 12.5, color: muted, margin: '0 0 10px' }}>
          {toPlaceId
            ? 'Now click the spot on the plan to drop this screen.'
            : 'Drag a placed marker to move it. To place a screen from the tray below, click it, then click its spot on the plan.'}
        </p>
      )}

      {/* The map */}
      {!bg ? (
        <div style={{ color: muted, padding: 16 }}>No floor-plan image for this floor.</div>
      ) : (
        <div
          ref={containerRef}
          onClick={onPlanClick}
          style={{
            position: 'relative', width: '100%', maxWidth: 1000, margin: '0 auto',
            border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden',
            background: '#fff', cursor: editing && toPlaceId ? 'crosshair' : 'default',
            userSelect: 'none', touchAction: 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bg.src} alt={`${bg.label} plan`} style={{ display: 'block', width: '100%', height: 'auto' }} draggable={false} />

          {placed.map(sc => {
            const online = onlineState(sc)
            const ring = online == null ? '#94a3b8' : online ? '#22c55e' : '#ef4444'
            const fill = sc.area_id ? (areaColor.get(sc.area_id) || '#64748b') : '#64748b'
            const selected = isScreenSelected(sc.id)
            const viaArea = mode === 'select' && sc.area_id != null && isAreaSelected(sc.area_id)
            const active = selected || viaArea
            return (
              <div
                key={sc.id}
                onPointerDown={(e) => { if (mode === 'manage' && editing) { e.stopPropagation(); setDraggingId(sc.id) } }}
                onClick={(e) => { e.stopPropagation(); onMarkerActivate(sc) }}
                onMouseEnter={() => setHoverId(sc.id)}
                onMouseLeave={() => setHoverId(h => h === sc.id ? null : h)}
                title={`${sc.name} (${sc.code})`}
                style={{
                  position: 'absolute', left: `${sc.pos_x}%`, top: `${sc.pos_y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: active ? 22 : 18, height: active ? 22 : 18, borderRadius: '50%',
                  background: fill, border: `3px solid ${active ? '#0f172a' : ring}`,
                  boxShadow: active ? '0 0 0 3px rgba(15,23,42,0.25), 0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.4)',
                  cursor: mode === 'manage' && editing ? 'grab' : 'pointer',
                  zIndex: hoverId === sc.id ? 5 : 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {active && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                {/* status dot */}
                <span style={{ position: 'absolute', right: -2, bottom: -2, width: 7, height: 7, borderRadius: '50%', background: ring, border: '1px solid #fff' }} />
                {hoverId === sc.id && (
                  <div style={{
                    position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap', background: 'rgba(15,23,42,0.94)', color: '#fff',
                    fontSize: 11.5, padding: '4px 8px', borderRadius: 6, pointerEvents: 'none', zIndex: 10,
                  }}>
                    {sc.name} · {sc.code}{online == null ? '' : online ? ' · online' : ' · offline'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tray of unplaced screens (manage + editing) */}
      {mode === 'manage' && editing && unplaced.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, border: `1px dashed ${border}`, borderRadius: 10, background: surface2 }}>
          <p style={{ fontSize: 12, color: muted, margin: '0 0 8px', fontWeight: 600 }}>
            Not placed on this floor ({unplaced.length}) — click one, then click its spot on the plan:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unplaced.map(sc => (
              <button
                key={sc.id} type="button" onClick={() => setToPlaceId(toPlaceId === sc.id ? null : sc.id)}
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer',
                  border: `1px solid ${toPlaceId === sc.id ? 'var(--brand-primary)' : border}`,
                  background: toPlaceId === sc.id ? 'var(--brand-primary)' : surface1,
                  color: toPlaceId === sc.id ? '#fff' : text,
                }}
              >
                {sc.name} ({sc.code})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Area legend (doubles as area selector in select mode) */}
      {areas.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, color: muted, margin: '0 0 6px' }}>
            {mode === 'select' ? 'Areas (click to target a whole area):' : 'Areas:'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {areas.map(a => {
              const selectable = mode === 'select'
              const on = selectable && isAreaSelected(a.id)
              return (
                <button
                  key={a.id} type="button" disabled={!selectable}
                  onClick={() => selectable && toggleArea(a.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                    padding: '4px 10px', borderRadius: 999, fontFamily: 'inherit',
                    cursor: selectable ? 'pointer' : 'default',
                    border: `1px solid ${on ? 'var(--brand-primary)' : border}`,
                    background: on ? 'var(--brand-primary)' : surface1,
                    color: on ? '#fff' : text,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: areaColor.get(a.id), flex: 'none' }} />
                  {on ? '✓ ' : ''}{a.name}
                </button>
              )
            })}
          </div>
          <p style={{ fontSize: 11, color: muted, margin: '8px 0 0' }}>
            Marker fill = area · ring/dot = online (green), offline (red), not linked (gray).
            {unmappedCount > 0 ? ` ${unmappedCount} screen(s) have no mapped floor.` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
