'use client'

import { useEffect, useRef, useState } from 'react'

/** Faithful, scaled live preview of a real board output view (preroll/live/dais/overlay). */
export default function BoardPreview({ channel, view, label }: { channel: number | null; view: 'preroll' | 'live' | 'dais' | 'overlay'; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.26)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      requestAnimationFrame(() => setScale(w / 1280))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div>
      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div ref={ref} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(255,255,255,.14)', background: '#000' }}>
        {channel ? (
          <iframe src={`/board/${channel}/${view}`} title={label} scrolling="no"
            style={{ position: 'absolute', top: 0, left: 0, width: 1280, height: 720, border: 0, transformOrigin: 'top left', transform: `scale(${scale})`, pointerEvents: 'none' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#64748b', textAlign: 'center', padding: 8 }}>No board channel assigned</div>
        )}
      </div>
    </div>
  )
}
