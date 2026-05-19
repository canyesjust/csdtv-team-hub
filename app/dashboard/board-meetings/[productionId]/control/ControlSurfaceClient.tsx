'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'
import ControlSurfaceView from './ControlSurfaceView'
import type { ControlBundle } from './control-surface-types'

export default function ControlSurfaceClient({ productionId }: { productionId: string }) {
  const supabase = createClient()
  const [bundle, setBundle] = useState<ControlBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const text = 'var(--text-primary)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/control`)
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load control data', 'error')
      setLoading(false)
      return
    }
    setBundle(body)
    setLoading(false)
  }, [productionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!bundle?.board_meeting?.id) return
    const channel = supabase
      .channel(`broadcast-${bundle.board_meeting.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_timers', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_attendance', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_playlists', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bundle?.board_meeting?.id, supabase, load])

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/control/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) toast(data.error || 'Action failed', 'error')
      else await load()
    } finally {
      setBusy(false)
    }
  }

  const assignedIds = useMemo(
    () => new Set((bundle?.channel_assignments || []).map(a => a.output_channel_id)),
    [bundle?.channel_assignments],
  )

  const toggleChannel = async (channelId: string) => {
    setBusy(true)
    try {
      const method = assignedIds.has(channelId) ? 'DELETE' : 'POST'
      const res = await fetch(`/api/board-meetings/${productionId}/channels`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_channel_id: channelId }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast(d.error || 'Channel update failed', 'error')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="control-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader />
      </div>
    )
  }

  if (!bundle) return <p style={{ color: muted, padding: 16 }}>Board meeting not found.</p>

  const currentId = bundle.broadcast_state?.current_agenda_item_id
  const currentItem = bundle.items.find(i => i.id === currentId)
  const status = bundle.board_meeting.broadcast_status
  const mode = bundle.broadcast_state?.mode || 'normal'
  const canControl = bundle.board_meeting.agenda_locked && status !== 'archived' && status !== 'cancelled'
  const broadcastable = bundle.items.filter(i => i.is_broadcastable)

  const btn: React.CSSProperties = {
    fontSize: '14px',
    padding: '12px 16px',
    minHeight: '48px',
    borderRadius: '10px',
    border: `0.5px solid ${border}`,
    background: cardBg,
    color: text,
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
    opacity: busy ? 0.6 : 1,
  }
  const primaryBtn: React.CSSProperties = { ...btn, background: '#1e6cb5', color: '#fff', border: 'none' }
  const dangerBtn: React.CSSProperties = { ...btn, background: '#8b1a1a', color: '#fff', border: 'none' }

  return (
    <ControlSurfaceView
      productionId={productionId}
      bundle={bundle}
      busy={busy}
      canControl={canControl}
      currentId={currentId}
      currentItem={currentItem}
      status={status}
      mode={mode}
      broadcastable={broadcastable}
      assignedIds={assignedIds}
      btn={btn}
      primaryBtn={primaryBtn}
      dangerBtn={dangerBtn}
      post={post}
      toggleChannel={toggleChannel}
      onUpdated={load}
    />
  )
}
