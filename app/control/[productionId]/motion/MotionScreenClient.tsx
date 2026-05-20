'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import MotionScreenView from './MotionScreenView'
import type { MotionScreenBundle, VoteValue } from '@/lib/board-meetings/motion-types'
import {
  applyVoiceVoteDefaults,
  applyVoteToBundle,
} from '@/lib/board-meetings/motion-screen-optimistic'

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

/** Actions that update local state immediately; no global busy lock. */
const INSTANT_ACTIONS = new Set([
  'record-vote',
  'set-mover',
  'set-seconder',
  'set-text',
  'set-vote-type',
])

/** Optimistic actions that should not refetch the full bundle after success. */
const SKIP_SUCCESS_REFRESH = new Set([...INSTANT_ACTIONS, 'open-vote', 'open-discussion'])

/** POST in background — UI already updated optimistically. */
const FIRE_AND_FORGET_ACTIONS = SKIP_SUCCESS_REFRESH

const LOCAL_SUPPRESS_MS = 5000

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

  const bundleRef = useRef(bundle)
  bundleRef.current = bundle

  const suppressRefreshUntilRef = useRef(0)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bundleForView: MotionScreenBundle = {
    ...bundle,
    suggested_motion_text: pendingMotionText ?? bundle.suggested_motion_text,
  }

  const markLocalMutation = useCallback((action?: string) => {
    const ms = action === 'record-vote' ? LOCAL_SUPPRESS_MS : 1200
    suppressRefreshUntilRef.current = Date.now() + ms
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motion/bundle`, { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as MotionScreenBundle
        setBundle(data)
      }
    } catch {
      // swallow
    }
  }, [productionId])

  const refreshInBackground = useCallback(() => {
    void refresh()
  }, [refresh])

  const refreshDebounced = useCallback(() => {
    if (Date.now() < suppressRefreshUntilRef.current) return
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      void refresh()
    }, 400)
  }, [refresh])

  useEffect(() => {
    if (!bundleRef.current.active_motion) {
      setPendingMotionText(null)
    }
  }, [bundle.current_agenda_item_id])

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )

    const meetingId = initialBundle.meeting.id
    const channel = supabase
      .channel(`motion-screen-${meetingId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${meetingId}` },
        refreshDebounced,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${meetingId}` },
        refreshDebounced,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [initialBundle.meeting.id, refreshDebounced])

  const applyOptimistic = useCallback(
    (action: string, body?: unknown) => {
      const b = bundleRef.current
      if (action === 'record-vote') {
        const { person_id, vote } = body as { person_id: string; vote: VoteValue }
        setBundle(applyVoteToBundle(b, person_id, vote))
        return
      }
      if (action === 'set-mover') {
        const personId = (body as { person_id?: string | null }).person_id ?? null
        const name = personId ? b.voting_members.find(m => m.id === personId)?.display_name ?? null : null
        setBundle({
          ...b,
          active_motion: b.active_motion
            ? { ...b.active_motion, mover_id: personId, mover_name: name }
            : null,
        })
        return
      }
      if (action === 'set-seconder') {
        const personId = (body as { person_id?: string | null }).person_id ?? null
        const name = personId ? b.voting_members.find(m => m.id === personId)?.display_name ?? null : null
        setBundle({
          ...b,
          active_motion: b.active_motion
            ? { ...b.active_motion, seconder_id: personId, seconder_name: name }
            : null,
        })
        return
      }
      if (action === 'set-text') {
        const text = (body as { text?: string }).text ?? ''
        setBundle({
          ...b,
          active_motion: b.active_motion ? { ...b.active_motion, text } : null,
        })
        return
      }
      if (action === 'set-vote-type') {
        const voteType = (body as { vote_type?: 'voice' | 'roll_call' }).vote_type ?? 'voice'
        setBundle({
          ...b,
          active_motion: b.active_motion ? { ...b.active_motion, vote_type: voteType } : null,
        })
        return
      }
      if (action === 'open-vote') {
        setBundle(applyVoiceVoteDefaults(b))
        return
      }
      if (action === 'open-discussion' && b.active_motion) {
        setBundle({
          ...b,
          active_motion: { ...b.active_motion, status: 'open_for_discussion' },
        })
      }
    },
    [],
  )

  const postActionInBackground = useCallback(
    (url: string, payload: unknown, action: string) => {
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      })
        .then(async res => {
          if (!res.ok) {
            setError(await readApiError(res))
            refreshInBackground()
            return
          }
          if (action === 'open') {
            setPendingMotionText(null)
            refreshInBackground()
          } else if (!SKIP_SUCCESS_REFRESH.has(action)) {
            refreshInBackground()
          }
        })
        .catch(() => {
          setError('Action failed')
          refreshInBackground()
        })
    },
    [refreshInBackground],
  )

  const onAction = useCallback(
    async (action: string, body?: unknown) => {
      const instant = INSTANT_ACTIONS.has(action)
      const fireAndForget = FIRE_AND_FORGET_ACTIONS.has(action)
      if (!instant) {
        setBusy(true)
      }
      setError(null)

      try {
        const activeId = bundleRef.current.active_motion?.id
        const motionId = activeId || bundleRef.current.parent_motion?.id || ''

        if (action === 'set-text' && !activeId) {
          const text = (body as { text?: string } | undefined)?.text ?? ''
          setPendingMotionText(text)
          return
        }

        markLocalMutation(action)
        if (instant || action === 'open-vote' || action === 'open-discussion') {
          applyOptimistic(action, body)
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

        if (fireAndForget) {
          postActionInBackground(url, payload, action)
          return
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload !== undefined ? JSON.stringify(payload) : undefined,
        })

        if (!res.ok) throw new Error(await readApiError(res))

        if (action === 'open') {
          setPendingMotionText(null)
          refreshInBackground()
        } else if (!SKIP_SUCCESS_REFRESH.has(action)) {
          refreshInBackground()
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed')
        refreshInBackground()
      } finally {
        if (!instant) {
          setBusy(false)
        }
      }
    },
    [
      productionId,
      pendingMotionText,
      markLocalMutation,
      applyOptimistic,
      refreshInBackground,
      postActionInBackground,
    ],
  )

  const onMinimize = useCallback(() => {
    router.push(`/control/${productionId}`)
  }, [router, productionId])

  const onPushResult = useCallback(async () => {
    const motionId = bundleRef.current.active_motion?.id
    if (!motionId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motion/${motionId}/push-result`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await readApiError(res))
      router.push(`/control/${productionId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Push failed')
      setBusy(false)
    }
  }, [productionId, router])

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
