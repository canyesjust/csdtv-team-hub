'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getVoteResultRemainingSeconds, isVoteResultActive } from '@/lib/board-meetings/motion-control'
import { toast } from '@/lib/toast'

type MotionSummary = {
  id: string
  motion_text: string
  status: string
}

type BroadcastState = {
  active_motion_id?: string | null
  active_vote_result_motion_id?: string | null
  vote_result_started_at?: string | null
  vote_result_duration_seconds?: number | null
} | null

export default function MotionAndVoteCard({
  productionId,
  broadcastState,
  disabled,
  onUpdated,
}: {
  productionId: string
  broadcastState: BroadcastState
  disabled?: boolean
  onUpdated: () => void
}) {
  const [motions, setMotions] = useState<MotionSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const loadMotions = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/motions`)
    const body = await res.json()
    if (res.ok) setMotions(body.motions || [])
  }, [productionId])

  useEffect(() => { loadMotions() }, [loadMotions])

  useEffect(() => {
    loadMotions()
  }, [broadcastState?.active_motion_id, broadcastState?.active_vote_result_motion_id, loadMotions])

  useEffect(() => {
    if (!isVoteResultActive(broadcastState || {})) return
    const t = setInterval(() => setTick(n => n + 1), 500)
    return () => clearInterval(t)
  }, [broadcastState, tick])

  const activeMotion = useMemo(() => {
    const id = broadcastState?.active_motion_id
    if (id) return motions.find(m => m.id === id)
    return motions.find(m => ['open_for_discussion', 'voting'].includes(m.status))
  }, [broadcastState?.active_motion_id, motions])

  const resultRemaining = useMemo(
    () => getVoteResultRemainingSeconds(broadcastState || {}),
    [broadcastState, tick],
  )

  const showResult = isVoteResultActive(broadcastState || {})

  const post = async (path: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motion/${path}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Action failed', 'error')
        return
      }
      onUpdated()
      await loadMotions()
    } finally {
      setBusy(false)
    }
  }

  if (showResult) {
    return (
      <div className="cs-card cs-motion-card cs-motion-card--success">
        <p className="cs-eyebrow">Motion &amp; vote</p>
        <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--semantic-success-text)' }}>
          Result on overlay · {resultRemaining}s
        </p>
        <div className="control-btn-row">
          <button type="button" className="cs-touchbtn" disabled={disabled || busy} onClick={() => post('result/hold')}>
            Hold
          </button>
          <button
            type="button"
            className="cs-touchbtn cs-touchbtn-danger"
            disabled={disabled || busy}
            onClick={() => post('result/dismiss')}
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  if (activeMotion) {
    return (
      <div className="cs-card cs-motion-card cs-motion-card--warning">
        <p className="cs-eyebrow">Motion &amp; vote</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="cs-pulse-dot" aria-hidden />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--semantic-warning-text)' }}>
            Motion in progress
          </p>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {activeMotion.motion_text.slice(0, 120)}
          {activeMotion.motion_text.length > 120 ? '…' : ''}
        </p>
        <Link
          href={`/control/${productionId}/motion`}
          className="cs-touchbtn cs-touchbtn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          Continue motion →
        </Link>
      </div>
    )
  }

  return (
    <div className="cs-card cs-motion-card cs-motion-card--info">
      <p className="cs-eyebrow">Motion &amp; vote</p>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-muted)' }}>
        Open the motion screen to make a motion, run a vote, and push results to the overlay.
      </p>
      <Link
        href={`/control/${productionId}/motion`}
        className="cs-touchbtn cs-touchbtn-primary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          textDecoration: 'none',
          pointerEvents: disabled ? 'none' : undefined,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        Open motion screen →
      </Link>
    </div>
  )
}
