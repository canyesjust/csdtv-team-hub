'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import MotionScreenView from './MotionScreenView'
import type { MotionScreenBundle } from '@/lib/board-meetings/motion-types'

type Props = {
  productionId: string
  initialBundle: MotionScreenBundle
}

export default function MotionScreenClient({ productionId, initialBundle }: Props) {
  const router = useRouter()
  const [bundle, setBundle] = useState<MotionScreenBundle>(initialBundle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motion/bundle`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setBundle(data)
      }
    } catch {
      // swallow
    }
  }, [productionId])

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const meetingId = initialBundle.meeting.id
    const channel = supabase
      .channel(`motion-screen-${meetingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${meetingId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_motion_votes' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_attendance', filter: `board_meeting_id=eq.${meetingId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${meetingId}` }, refresh)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [initialBundle.meeting.id, refresh])

  const onAction = useCallback(async (action: string, body?: unknown) => {
    setBusy(true)
    setError(null)
    try {
      const motionId = bundle.active_motion?.id || bundle.parent_motion?.id || ''

      let url: string
      if (action === 'open') {
        url = `/api/board-meetings/${productionId}/motion/open`
      } else if (action === 'result-hold') {
        url = `/api/board-meetings/${productionId}/motion/result/hold`
      } else if (action === 'result-dismiss') {
        url = `/api/board-meetings/${productionId}/motion/result/dismiss`
      } else if (motionId) {
        url = `/api/board-meetings/${productionId}/motion/${motionId}/${action}`
      } else {
        throw new Error('No active motion for action: ' + action)
      }

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
