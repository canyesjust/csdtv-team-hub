'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import MotionScreenView from './MotionScreenView'
import type { MotionScreenBundle } from '@/lib/board-meetings/motion-types'

async function readApiError(res: Response): Promise<string> {
  const txt = await res.text()
  try {
    const parsed = JSON.parse(txt) as { error?: string }
    if (parsed.error) return parsed.error
  } catch {
    // not JSON
  }
  return txt || `Request failed (${res.status})`
}

type Props = {
  productionId: string
  initialBundle: MotionScreenBundle
}

export default function MotionScreenClient({ productionId, initialBundle }: Props) {
  const router = useRouter()
  const [bundle, setBundle] = useState<MotionScreenBundle>(initialBundle)
  const [pendingMotionText, setPendingMotionText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bundleForView: MotionScreenBundle = {
    ...bundle,
    suggested_motion_text: pendingMotionText ?? bundle.suggested_motion_text,
  }

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

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshDebounced = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      void refresh()
    }, 200)
  }, [refresh])

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const meetingId = initialBundle.meeting.id
    const channel = supabase
      .channel(`motion-screen-${meetingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${meetingId}` }, refreshDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_motion_votes' }, refreshDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${meetingId}` }, refreshDebounced)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [initialBundle.meeting.id, refreshDebounced])

  const onAction = useCallback(async (action: string, body?: unknown) => {
    setBusy(true)
    setError(null)
    try {
      const activeId = bundle.active_motion?.id
      const motionId = activeId || bundle.parent_motion?.id || ''

      if (action === 'set-text' && !activeId) {
        const text = (body as { text?: string } | undefined)?.text ?? ''
        setPendingMotionText(text)
        return
      }

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

      const payload =
        action === 'open' && pendingMotionText
          ? { ...(body as Record<string, unknown>), motion_text: pendingMotionText }
          : body

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      })
      if (!res.ok) throw new Error(await readApiError(res))
      if (action === 'open' || action === 'set-text') setPendingMotionText(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }, [productionId, bundle.active_motion?.id, bundle.parent_motion?.id, pendingMotionText, refresh])

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
      if (!res.ok) throw new Error(await readApiError(res))
      router.push(`/control/${productionId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Push failed')
      setBusy(false)
    }
  }, [productionId, bundle.active_motion?.id, router])

  return (
    <MotionScreenView
      bundle={bundleForView}
      busy={busy}
      error={error}
      onAction={onAction}
      onMinimize={onMinimize}
      onPushResult={onPushResult}
    />
  )
}
