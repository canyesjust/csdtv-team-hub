'use client'

import { useState, type CSSProperties } from 'react'

const colors = {
  bg: '#f8f9fc',
  cardBg: '#ffffff',
  line: '#d3d6dd',
  text: '#1a1f36',
  muted: '#6b7280',
  info: '#185fa5',
}

// Shown by the /obs server layout when the visitor has not unlocked the site. On
// success the access cookie is set and we reload so the layout re-renders the real page.
export default function ObsPasswordPrompt() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/obs/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        window.location.reload()
        return
      }
      setError(typeof d?.error === 'string' ? d.error : 'Could not verify the password.')
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const input: CSSProperties = {
    width: '100%', height: 44, border: `1px solid ${colors.line}`, borderRadius: 10,
    padding: '0 14px', fontSize: 15, color: colors.text, background: colors.cardBg,
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ background: colors.bg, minHeight: '100vh', color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480, background: colors.cardBg, border: `1px solid ${colors.line}`, borderRadius: 16, padding: '32px 28px', boxShadow: '0 10px 40px rgba(15,25,45,0.06)' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>CSDtv OBS Assets</h1>
        <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.55, color: colors.muted }}>
          This page hosts the CSDtv OBS controller, commercials, and scene files for approved broadcast operators.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.55, color: colors.muted }}>
          Need access? Ask Justin for the password.
        </p>

        <form onSubmit={submit} style={{ marginTop: 22 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter the access password"
            autoFocus
            style={input}
          />
          {error && (
            <p style={{ margin: '10px 0 0', fontSize: 13.5, fontWeight: 600, color: '#a4161a' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={busy || !password.trim()}
            style={{ marginTop: 16, width: '100%', height: 46, borderRadius: 10, border: `1px solid ${colors.info}`, background: colors.info, color: '#ffffff', fontSize: 15, fontWeight: 700, cursor: busy || !password.trim() ? 'default' : 'pointer', opacity: busy || !password.trim() ? 0.6 : 1 }}
          >
            {busy ? 'Checking...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
