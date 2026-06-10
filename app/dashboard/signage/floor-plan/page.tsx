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
import SignageFloorMap from '../components/SignageFloorMap'
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
  const [reloadKey, setReloadKey] = useState(0)

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

  const linkedIds = screens.filter(sc => sc.ablesign_screen_id).map(sc => sc.id)

  const refreshHealth = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/signage/ablesign/health', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Health refresh failed')
      toast(`Updated ${data.updated ?? 0} screen(s)`, 'success')
      await loadScreens()
      setReloadKey(k => k + 1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Health refresh failed', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <SignagePageShell title="Floor plan" subtitle="Place screens on the building map">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <button type="button" onClick={() => void refreshHealth()} style={s.btnPrimary} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh online status'}
        </button>
        <AbleSignSyncAllButton screenIds={linkedIds} onDone={() => void loadScreens()} />
        <span style={{ fontSize: 13, color: s.muted }}>
          Green = online · Red = offline · Gray = not linked or unknown
        </span>
      </div>

      <SignageFloorMap mode="manage" reloadSignal={reloadKey} />

      <div style={{ ...s.card, marginTop: 20 }}>
        <h3 style={s.h3}>All screens</h3>
        {loading ? (
          <div style={{ color: s.muted, padding: 8 }}>Loading…</div>
        ) : !screens.length ? (
          <div style={{ color: s.muted, padding: 8 }}>No screens yet.</div>
        ) : (
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
        )}
      </div>
    </SignagePageShell>
  )
}
