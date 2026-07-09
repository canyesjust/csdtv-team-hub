'use client'

import { useEffect } from 'react'

// Route error boundary for wall-mounted signage screens. These TVs run
// untouched for months, so a render/runtime error must self-recover without a
// human. We try the React `reset()` a few seconds in, then hard-reload as a
// last resort if reset() didn't clear the fault. Dependency-free by design.
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const resetTimer = setTimeout(() => {
      try {
        reset()
      } catch {
        /* fall through to the hard reload below */
      }
    }, 4000)
    const reloadTimer = setTimeout(() => {
      if (typeof window !== 'undefined') window.location.reload()
    }, 15000)
    return () => {
      clearTimeout(resetTimer)
      clearTimeout(reloadTimer)
    }
  }, [reset])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#e5e7eb',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 600 }}>Display will resume shortly</div>
      <div style={{ marginTop: 8, fontSize: 15, opacity: 0.6 }}>Reconnecting…</div>
    </div>
  )
}
