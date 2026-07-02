'use client'

import { useEffect, type CSSProperties } from 'react'

const BARS = 'linear-gradient(90deg, #c4c4c4 0 14.28%, #c9c21f 0 28.57%, #1fc4c9 0 42.85%, #1fbf3a 0 57.14%, #c22fb0 0 71.42%, #c23030 0 85.71%, #2f45c2 0 100%)'

// Shared branded error UI (broadcast "technical difficulties" theme to match the 404).
// Reports the error to /api/report-error on mount (which logs it and emails an admin),
// then offers a retry. Used by app/error.tsx and app/global-error.tsx.
export default function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  useEffect(() => {
    try {
      fetch('/api/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          message: error?.message || 'Client error',
          stack: error?.stack || null,
          digest: error?.digest || null,
          url: typeof window !== 'undefined' ? window.location.href : null,
        }),
      }).catch(() => {})
    } catch {
      /* ignore */
    }
  }, [error])

  const btn: CSSProperties = { padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block', border: 'none' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, background: BARS, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', background: 'rgba(9,13,22,0.86)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '26px 24px 24px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#ffffff', background: '#c23030', borderRadius: 999, padding: '4px 12px' }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: '#ffffff', display: 'inline-block' }} />TECHNICAL DIFFICULTIES
        </span>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, letterSpacing: '0.22em', color: '#fbae42', marginTop: 18 }}>PLEASE STAND BY</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginTop: 12 }}>Something went wrong</div>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: '#c7ccd6', margin: '10px 0 0' }}>
          This one is not cooperating. The team has been notified automatically. Give it another take, or head back to the studio.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
          {reset && (
            <button type="button" onClick={reset} style={{ ...btn, background: '#2791d0', color: '#ffffff' }}>Try again</button>
          )}
          <a href="/" style={{ ...btn, background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#ffffff' }}>Back to the studio</a>
        </div>
        {error?.digest && (
          <p style={{ margin: '18px 0 0', fontSize: 11.5, color: '#8b93a1', fontFamily: 'ui-monospace, monospace' }}>Reference: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
