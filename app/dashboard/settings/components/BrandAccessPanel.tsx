'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants'

type Status = { configured: boolean; source: 'database' | 'environment' | 'none'; updatedAt: string | null }

export default function BrandAccessPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/brand/access-config', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setStatus(d as Status)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (pw.length < MIN_PASSWORD_LENGTH) { toast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'error'); return }
    if (pw !== pw2) { toast('Passwords do not match', 'error'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/brand/access-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast(typeof d?.error === 'string' ? d.error : 'Could not save password', 'error'); return }
      setPw(''); setPw2('')
      toast('Brand library password updated. Everyone will need to re-enter it.', 'success')
      await load()
    } catch {
      toast('Could not save password', 'error')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    if (!(await confirmDialog({
      message: 'Remove the brand library password? The public site becomes open to anyone (unless a fallback environment password is set).',
      tone: 'danger',
      confirmLabel: 'Remove password',
    }))) return
    setSaving(true)
    try {
      const r = await fetch('/api/brand/access-config', { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast(typeof d?.error === 'string' ? d.error : 'Could not remove password', 'error'); return }
      toast('Brand library password removed', 'success')
      await load()
    } catch {
      toast('Could not remove password', 'error')
    } finally {
      setSaving(false)
    }
  }

  const input: CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', width: '200px', boxSizing: 'border-box', minHeight: '44px' }

  const statusLine = (() => {
    if (!status) return 'Loading...'
    if (status.configured && status.source === 'database') {
      const when = status.updatedAt ? ` (last changed ${new Date(status.updatedAt).toLocaleDateString()})` : ''
      return `On — a password is set here${when}. Visitors must enter it; signed-in staff and review links skip it.`
    }
    if (status.configured && status.source === 'environment') {
      return 'On — using the BRAND_SITE_PASSWORD environment variable. Set a password below to manage it here without a redeploy.'
    }
    return 'Off — the brand library is currently public. Set a password below to restrict access.'
  })()

  const on = !!status?.configured
  const dbManaged = status?.source === 'database'

  return (
    <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px' }}>
      <h2 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 6px' }}>Brand library access</h2>
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Controls the shared password for the public brand library at <strong>/brand</strong>. {statusLine}
      </p>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>{on ? 'New password' : 'Password'}</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} style={input} />
        </div>
        <div>
          <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Confirm</p>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" style={input} />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !pw || pw !== pw2}
          style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: pw && pw === pw2 ? 'var(--brand-primary)' : 'var(--surface-2)', color: pw && pw === pw2 ? '#fff' : muted, border: 'none', cursor: saving || !pw || pw !== pw2 ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}
        >
          {saving ? 'Saving...' : on ? 'Change password' : 'Set password'}
        </button>
        {dbManaged && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            style={{ fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: 'transparent', color: '#ef4444', border: `0.5px solid ${border}`, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}
          >
            Remove password
          </button>
        )}
      </div>
      <p style={{ fontSize: '12.5px', color: muted, margin: '12px 0 0', lineHeight: 1.5 }}>
        Changing the password immediately signs everyone out of the brand library, so they will need the new password on their next visit.
      </p>
    </div>
  )
}
