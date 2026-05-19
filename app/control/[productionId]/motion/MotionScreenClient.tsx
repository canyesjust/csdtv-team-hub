'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import MotionScreenView from './MotionScreenView'
import type { MotionScreenBundle } from '@/lib/board-meetings/types'

type Props = {
  productionId: string
  initialBundle: MotionScreenBundle
}

export default function MotionScreenClient({ productionId, initialBundle }: Props) {
  const router = useRouter()
  const [bundle, setBundle] = useState<MotionScreenBundle>(initialBundle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createBrowserClient()

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/motion/bundle`, { cache: 'no-store' })
    if (res.ok) setBundle(await res.json())
  }, [productionId])

  useEffect(() => {
    const meetingId = initialBundle.meeting.id
    const channel = supabase
      .channel(`motion-screen-${meetingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${meetingId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_motion_votes' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_attendance', filter: `board_meeting_id=eq.${meetingId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${meetingId}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [initialBundle.meeting.id, refresh, supabase])

  const onAction = useCallback(async (action: string, body?: unknown) => {
    setBusy(true)
    setError(null)
    try {
      const motionId = bundle.active_motion?.id || bundle.parent_motion?.id
      const url = motionId
        ? `/api/board-meetings/${productionId}/motion/${motionId}/${action}`
        : `/api/board-meetings/${productionId}/motion/${action}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `Action failed (${res.status})`)
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }, [productionId, bundle.active_motion?.id, bundle.parent_motion?.id, refresh])

  const onMinimize = useCallback(() => {
    router.push(`/control/${productionId}`)
  }, [router, productionId])

  const onPushResult = useCallback(async () => {
    const motionId = bundle.active_motion?.id
    if (!motionId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motion/${motionId}/push-result`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text() || 'Push failed')
      router.push(`/control/${productionId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Push failed')
      setBusy(false)
    }
  }, [productionId, bundle.active_motion?.id, router])

  return (
    <MotionScreenView
      bundle={bundle}
      busy={busy}
      error={error}
      onAction={onAction}
      onMinimize={onMinimize}
      onPushResult={onPushResult}
    />
  )
}
