'use client'

import type { BoardOutputDebugInfo } from '@/app/board/hooks/useBoardChannelState'

export default function BoardOutputDebugStrip({
  info,
  pollMs,
}: {
  info: BoardOutputDebugInfo
  pollMs?: number
}) {
  const age =
    info.lastUpdateMs == null ? '—' : `${Math.max(0, Math.round((Date.now() - info.lastUpdateMs) / 100) / 10)}s ago`

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
      <div>Poll: {pollMs ?? '—'}ms</div>
      <div>
        Last: {info.lastUpdate ?? '—'} ({age})
      </div>
    </div>
  )
}
