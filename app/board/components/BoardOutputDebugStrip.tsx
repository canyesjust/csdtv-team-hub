'use client'

import type { BoardOutputDebugInfo } from '@/app/board/hooks/useBoardChannelState'
import { POLL_REALTIME_FALLBACK_MS, POLL_WAKE_MS } from '@/lib/board-meetings/output-polling'

function formatAge(ms: number | null): string {
  if (ms == null) return '—'
  return `${Math.max(0, Math.round((Date.now() - ms) / 100) / 10)}s ago`
}

export default function BoardOutputDebugStrip({
  info,
  pollMs,
}: {
  info: BoardOutputDebugInfo
  pollMs?: number
}) {
  // The realtime fallback only applies while the meeting is active (fast intervals).
  // Idle/off channels use the server interval (>= POLL_WAKE_MS) even when Realtime is
  // connected, so don't advertise the 1.5s fallback there.
  const isActivePoll = typeof pollMs === 'number' && pollMs < POLL_WAKE_MS
  const usingFallback = info.realtime === 'connected' && isActivePoll
  const effectivePoll = usingFallback ? POLL_REALTIME_FALLBACK_MS : (pollMs ?? '—')

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 9999,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.82)',
        color: '#cbd5e1',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        lineHeight: 1.45,
        pointerEvents: 'none',
      }}
    >
      <div>Realtime: {info.realtime}</div>
      <div>Poll: {effectivePoll}ms{usingFallback ? ' (fallback)' : ''}</div>
      <div>Broadcasts: {info.broadcastCount}</div>
      <div>Last broadcast: {formatAge(info.lastBroadcastMs)}</div>
      <div>Last poll: {formatAge(info.lastPollMs)}</div>
    </div>
  )
}
