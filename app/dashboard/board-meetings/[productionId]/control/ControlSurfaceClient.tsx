'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'
import ControlSurfaceView from './ControlSurfaceView'
import { dispatchControlSurfaceAction } from '@/lib/board-meetings/control-surface-actions'
import type { ControlBundle, ResultOverlayState } from '@/lib/board-meetings/types'

const MOTION_ACTIONS = new Set([
  'open',
  'set-mover',
  'set-seconder',
  'set-text',
  'set-vote-type',
  'open-vote',
  'record-vote',
  'push-result',
  'withdraw',
  'propose-substitute',
])

export default function ControlSurfaceClient({ productionId }: { productionId: string }) {
  const supabase = createClient()
  const [bundle, setBundle] = useState<ControlBundle | null>(null)
  const [resultOverlay, setResultOverlay] = useState<ResultOverlayState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [attendanceOpen, setAttendanceOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/control`)
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load control data', 'error')
      setLoading(false)
      return
    }
    setBundle(body)
    setResultOverlay(body.result_overlay ?? null)
    setLoading(false)
  }, [productionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!resultOverlay?.active || resultOverlay.held) return
    const interval = setInterval(() => {
      setResultOverlay(prev => {
        if (!prev || !prev.active || prev.held) return prev
        const newRemaining = Math.max(0, prev.seconds_remaining - 1)
        if (newRemaining === 0) {
          return { ...prev, seconds_remaining: 0 }
        }
        return { ...prev, seconds_remaining: newRemaining }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [resultOverlay?.active, resultOverlay?.held])

  const motionIds = useMemo(() => {
    const ids = new Set<string>()
    const activeId = bundle?.motion_lifecycle?.active_motion?.id
    const parentId = bundle?.motion_lifecycle?.parent_motion?.id
    if (activeId) ids.add(activeId)
    if (parentId) ids.add(parentId)
    if (resultOverlay?.motion_id) ids.add(resultOverlay.motion_id)
    return [...ids]
  }, [
    bundle?.motion_lifecycle?.active_motion?.id,
    bundle?.motion_lifecycle?.parent_motion?.id,
    resultOverlay?.motion_id,
  ])

  useEffect(() => {
    if (!bundle?.board_meeting?.id) return
    const meetingId = bundle.board_meeting.id

    let channel = supabase.channel(`control-surface-${meetingId}`)

    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${meetingId}` },
      () => { load() },
    )

    channel = channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_timers', filter: `board_meeting_id=eq.${meetingId}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${meetingId}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_attendance', filter: `board_meeting_id=eq.${meetingId}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_playlists', filter: `board_meeting_id=eq.${meetingId}` },
        () => { load() },
      )

    for (const motionId of motionIds) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_motion_votes', filter: `motion_id=eq.${motionId}` },
        () => { load() },
      )
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bundle?.board_meeting?.id, supabase, load, motionIds])

  const assignedIds = useMemo(
    () => new Set((bundle?.channel_assignments || []).map(a => a.output_channel_id)),
    [bundle?.channel_assignments],
  )

  const postControl = async (path: string, body?: Record<string, unknown>) => {
    const res = await fetch(`/api/board-meetings/${productionId}/control/${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json()
    if (!res.ok) {
      toast(data.error || 'Action failed', 'error')
      return false
    }
    return true
  }

  const postMotion = async (path: string, body?: Record<string, unknown>) => {
    const res = await fetch(`/api/board-meetings/${productionId}/motion/${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json()
    if (!res.ok) {
      toast(data.error || 'Action failed', 'error')
      return false
    }
    return true
  }

  const onAction = async (action: string, body?: unknown) => {
    if (action === 'open-attendance') {
      setAttendanceOpen(true)
      return
    }

    setBusy(true)
    try {
      const payload = body as Record<string, unknown> | undefined

      if (action === 'hold-result') {
        const res = await dispatchControlSurfaceAction(productionId, 'hold-result')
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          toast((d as { error?: string }).error || 'Action failed', 'error')
        } else {
          setResultOverlay(prev =>
            prev?.active
              ? { ...prev, held: true, seconds_remaining: prev.total_duration }
              : prev,
          )
          await load()
        }
        return
      }

      if (action === 'dismiss-result') {
        const res = await dispatchControlSurfaceAction(productionId, 'dismiss-result')
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          toast((d as { error?: string }).error || 'Action failed', 'error')
        } else {
          setResultOverlay(null)
          await load()
        }
        return
      }

      if (MOTION_ACTIONS.has(action) || action.startsWith('motion/')) {
        const path = action.startsWith('motion/') ? action.slice('motion/'.length) : action
        if (await postMotion(path, payload)) await load()
        return
      }

      if (action === 'clear-qr') {
        if (await postControl('dismiss-qr')) await load()
        return
      }

      if (action === 'toggle-channel') {
        const channelId = payload?.output_channel_id as string
        const method = assignedIds.has(channelId) ? 'DELETE' : 'POST'
        const res = await fetch(`/api/board-meetings/${productionId}/channels`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ output_channel_id: channelId }),
        })
        if (!res.ok) {
          const d = await res.json()
          toast(d.error || 'Channel update failed', 'error')
        } else await load()
        return
      }

      if (action.startsWith('playlist-')) {
        const playlistAction = action.replace('playlist-', '')
        const res = await fetch(`/api/board-meetings/${productionId}/playlist/${playlistAction}`, {
          method: 'POST',
          headers: payload ? { 'Content-Type': 'application/json' } : undefined,
          body: payload ? JSON.stringify(payload) : undefined,
        })
        if (!res.ok) {
          const d = await res.json()
          toast(d.error || 'Playlist action failed', 'error')
        } else await load()
        return
      }

      if (await postControl(action, payload)) await load()
    } finally {
      setBusy(false)
    }
  }

  const viewBundle = useMemo(
    () => (bundle ? { ...bundle, result_overlay: resultOverlay } : null),
    [bundle, resultOverlay],
  )

  if (loading) {
    return (
      <div className="control-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader />
      </div>
    )
  }

  if (!viewBundle) return <p style={{ color: 'var(--text-muted)', padding: 16 }}>Board meeting not found.</p>

  const status = viewBundle.broadcast_state?.status || viewBundle.board_meeting.broadcast_status
  const canControl = viewBundle.board_meeting.agenda_locked && status !== 'archived' && status !== 'cancelled'

  return (
    <ControlSurfaceView
      productionId={productionId}
      bundle={viewBundle}
      busy={busy}
      canControl={canControl}
      onAction={onAction}
      attendanceOpen={attendanceOpen}
      onAttendanceOpenChange={setAttendanceOpen}
    />
  )
}
