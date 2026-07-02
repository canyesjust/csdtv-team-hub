import Link from 'next/link'

const BARS = 'linear-gradient(90deg, #c4c4c4 0 14.28%, #c9c21f 0 28.57%, #1fc4c9 0 42.85%, #1fbf3a 0 57.14%, #c22fb0 0 71.42%, #c23030 0 85.71%, #2f45c2 0 100%)'

// Branded, broadcast-themed 404 (CSDtv is a TV crew, so it looks like a station's
// color-bars "no signal" test pattern).
export default function NotFound() {
  const btn = { padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-block' } as const
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, background: BARS, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 430, width: '100%', textAlign: 'center', background: 'rgba(9,13,22,0.86)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '26px 24px 24px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#ffffff', background: '#c23030', borderRadius: 999, padding: '4px 12px' }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: '#ffffff', display: 'inline-block' }} />NO SIGNAL
        </span>
        <div style={{ fontSize: 62, fontWeight: 800, color: '#ffffff', lineHeight: 1, marginTop: 16, letterSpacing: '0.02em' }}>404</div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, letterSpacing: '0.22em', color: '#fbae42', marginTop: 8 }}>PLEASE STAND BY</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', marginTop: 16 }}>This page is off the air</div>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: '#c7ccd6', margin: '8px 0 0' }}>We couldn&rsquo;t find that take. It may have ended up on the cutting room floor.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
          <Link href="/" style={{ ...btn, background: '#2791d0', color: '#ffffff' }}>Back to the studio</Link>
          <Link href="/brand" style={{ ...btn, background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#ffffff' }}>Brand library</Link>
        </div>
      </div>
    </div>
  )
}
