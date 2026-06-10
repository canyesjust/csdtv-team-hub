'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import {
  AbleSignStatusDot,
  AbleSignSyncAllButton,
  type AbleSignScreenFields,
} from '../components/AbleSignControls'
import { SignagePageShell, useSignageAdminStyles } from '../components/SignageAdmin'
import Link from 'next/link'

type Screen = AbleSignScreenFields & {
  name: string
  code: string
  building: string | null
  floor: number | null
  active: boolean
}

function floorLabel(floor: number | null) {
  if (floor == null) return 'Unassigned floor'
  return `Floor ${floor}`
}

function buildingLabel(building: string | null) {
  return building?.trim() || 'Unassigned building'
}

export default function SignageFloorPlanPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [screens, setScreens] = useState<Screen[]>([])

  const loadScreens = useCallback(async () => {
    const { data } = await supabase
      .from('signage_screens')
      .select('id, code, name, building, floor, active, ablesign_screen_id, ablesign_webapp_id, ablesign_synced_at, ablesign_online, ablesign_heartbeat_at')
      .order('building')
      .order('floor')
      .order('name')
    setScreens(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadScreens() }, [loadScreens])

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Screen[]>>()
    for (const sc of screens) {
      const b = buildingLabel(sc.building)
      const f = floorLabel(sc.floor)
      if (!map.has(b)) map.set(b, new Map())
      const floors = map.get(b)!
      if (!floors.has(f)) floors.set(f, [])
      floors.get(f)!.push(sc)
    }
    return [...map.entries()].map(([building, floors]) => ({
      building,
      floors: [...floors.entries()].map(([floor, items]) => ({ floor, items })),
    }))
  }, [screens])

  const linkedIds = screens.filter(sc => sc.ablesign_screen_id).map(sc => sc.id)

  const refreshHealth = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/signage/ablesign/health', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Health refresh failed')
      toast(`Updated ${data.updated ?? 0} screen(s)`, 'success')
      await loadScreens()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Health refresh failed', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <SignagePageShell title="Floor plan">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <button type="button" onClick={() => void refreshHealth()} style={s.btnPrimary} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh online status'}
        </button>
        <AbleSignSyncAllButton screenIds={linkedIds} onDone={() => void loadScreens()} />
        <span style={{ fontSize: 13, color: s.muted }}>
          Green = online · Red = offline · Gray = not linked or unknown
        </span>
      </div>

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading floor plan…</div>
      ) : !screens.length ? (
        <div style={{ color: s.muted, padding: 16 }}>No screens yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {grouped.map(group => (
            <div key={group.building} style={s.card}>
              <h3 style={s.h3}>{group.building}</h3>
              {group.floors.map(floor => (
                <div key={`${group.building}-${floor.floor}`} style={{ marginBottom: 18 }}>
                  <p style={{ ...s.lbl, marginBottom: 10, fontWeight: 600, color: s.text }}>{floor.floor}</p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {floor.items.map(sc => {
                      const online = sc.ablesign_screen_id ? sc.ablesign_online : null
                      const markerBg = online == null
                        ? (theme === 'dark' ? '#13203a' : '#eef0f3')
                        : online
                          ? (theme === 'dark' ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.12)')
                          : (theme === 'dark' ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)')
                      const markerBorder = online == null
                        ? s.border
                        : online
                          ? 'rgba(34,197,94,0.45)'
                          : 'rgba(239,68,68,0.45)'

                      return (
                        <Link
                          key={sc.id}
                          href="/dashboard/signage/screens"
                          style={{
                            textDecoration: 'none',
                            color: 'inherit',
                            background: markerBg,
                            border: `1px solid ${markerBorder}`,
                            borderRadius: 12,
                            padding: '12px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            minHeight: 88,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AbleSignStatusDot online={online} size={12} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: s.text }}>{sc.name}</span>
                          </div>
                          <span style={{ fontSize: 12, color: s.muted }}>
                            {sc.ablesign_screen_id ? `AbleSign #${sc.ablesign_screen_id}` : 'Not linked'}
                          </span>
                          {!sc.active && <span style={{ fontSize: 11, color: s.muted }}>Inactive</span>}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ ...s.card, marginTop: 20 }}>
        <h3 style={s.h3}>All screens</h3>
        <table style={s.tbl}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Building</th>
              <th style={s.th}>Floor</th>
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {screens.map(sc => (
              <tr key={sc.id}>
                <td style={s.td}>
                  <Link href="/dashboard/signage/screens" style={{ color: s.text, textDecoration: 'none', fontWeight: 500 }}>
                    {sc.name}
                  </Link>
                </td>
                <td style={s.tdMuted}>{buildingLabel(sc.building)}</td>
                <td style={s.tdMuted}>{floorLabel(sc.floor)}</td>
                <td style={s.td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AbleSignStatusDot online={sc.ablesign_screen_id ? sc.ablesign_online : null} />
                    {sc.ablesign_screen_id
                      ? (sc.ablesign_online ? 'Online' : 'Offline')
                      : 'Not linked'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SignagePageShell>
  )
}
