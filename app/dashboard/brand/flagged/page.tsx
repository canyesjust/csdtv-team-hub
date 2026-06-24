'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type FlaggedLogo = { code: string; schoolName: string; category: string; name: string; preview: string | null; formats: string[] }

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }))
}

export default function FlaggedLogosPage() {
  const router = useRouter()
  const [access, setAccess] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [logos, setLogos] = useState<FlaggedLogo[]>([])
  const [reviewConfigured, setReviewConfigured] = useState(false)
  const [reviewKey, setReviewKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/team', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (String(d?.team?.role || '').toLowerCase() === 'manager') setAccess('ok')
        else { setAccess('denied'); router.replace('/dashboard') }
      })
      .catch(() => { if (!cancelled) { setAccess('denied'); router.replace('/dashboard') } })
    return () => { cancelled = true }
  }, [router])

  const loadFlagged = useCallback(async () => {
    const res = await fetch('/api/brand/flagged', { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    setLogos(Array.isArray(d?.logos) ? (d.logos as FlaggedLogo[]) : [])
    setReviewConfigured(Boolean(d?.reviewConfigured))
    setReviewKey(typeof d?.reviewKey === 'string' ? d.reviewKey : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (access !== 'ok') return
    loadFlagged()
  }, [access, loadFlagged])

  const copyReviewLink = async () => {
    if (!reviewKey) return
    const url = `${window.location.origin}/brand?review=${encodeURIComponent(reviewKey)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      notify('Could not copy. The link is in the box below.', 'error')
    }
  }

  const deleteAll = async () => {
    if (logos.length === 0) return
    if (!window.confirm(`Permanently delete all ${logos.length} flagged logo${logos.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/brand/flagged', { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Delete failed', 'error')
      else { notify(`Deleted ${d?.deleted ?? 0} logo${d?.deleted === 1 ? '' : 's'}`, 'success'); await loadFlagged() }
    } catch {
      notify('Delete failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (access !== 'ok') return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Checking access...</div>

  const reviewUrl = reviewKey ? `${typeof window !== 'undefined' ? window.location.origin : ''}/brand?review=${encodeURIComponent(reviewKey)}` : ''

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 56px', color: 'var(--text-primary)' }}>
      <Link href="/dashboard/brand" style={{ fontSize: 13, fontWeight: 700, color: '#185fa5', textDecoration: 'none' }}>{'←'} Brand library</Link>

      <header style={{ margin: '14px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Flagged for deletion</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
          Share the review link so someone can mark old logos. Marked logos appear here for you to delete in bulk. Nothing is removed until you confirm.
        </p>
      </header>

      <section style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--surface-2)', padding: 16, marginBottom: 22 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800 }}>Review link</h2>
        {reviewConfigured && reviewKey ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={copyReviewLink} style={{ height: 36, borderRadius: 8, border: '1px solid #185fa5', background: '#185fa5', color: '#fff', fontSize: 13, fontWeight: 700, padding: '0 16px', cursor: 'pointer' }}>
                {copied ? 'Copied' : 'Copy review link'}
              </button>
              <code style={{ flex: 1, minWidth: 220, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reviewUrl}</code>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>Anyone with this link can mark logos as old (no login). They cannot delete or upload.</p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#b42318' }}>
            The review link is not set up yet. Add a <code>BRAND_REVIEW_KEY</code> environment variable in Vercel (any random string), redeploy, and the shareable link will appear here.
          </p>
        )}
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{loading ? 'Flagged logos' : `Flagged logos (${logos.length})`}</h2>
        <button type="button" disabled={busy || logos.length === 0} onClick={deleteAll}
          style={{ height: 36, borderRadius: 8, border: '1px solid #b42318', background: logos.length === 0 ? 'transparent' : '#b42318', color: logos.length === 0 ? 'var(--text-muted)' : '#fff', fontSize: 13, fontWeight: 700, padding: '0 16px', cursor: busy || logos.length === 0 ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Deleting...' : `Delete all flagged${logos.length ? ` (${logos.length})` : ''}`}
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: '30px 0', textAlign: 'center' }}>Loading...</p>
      ) : logos.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: '30px 0', textAlign: 'center', fontStyle: 'italic' }}>Nothing is flagged. Share the review link to get started.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {logos.map((l) => (
            <div key={`${l.code}-${l.category}-${l.name}`} style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--surface-2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 120, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: '1px solid var(--border-subtle)' }}>
                {l.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.preview} alt={l.name} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No preview</span>
                )}
              </div>
              <div style={{ padding: 12 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{l.schoolName}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{l.category} · {l.name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{l.formats.map((f) => f.toUpperCase()).join(', ')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
