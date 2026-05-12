'use client'

import { useEffect, useState, useCallback, Suspense, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'

const PRIORITIES = ['low', 'normal', 'high', 'day of'] as const

type ProductionOption = { id: string; production_number: number; title: string }

function SubmitTaskInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('t')?.trim() || ''

  const [loadingMeta, setLoadingMeta] = useState(true)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [productions, setProductions] = useState<ProductionOption[]>([])

  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<string>('normal')
  const [dueDate, setDueDate] = useState('')
  const [productionId, setProductionId] = useState('')
  const [needsEquipment, setNeedsEquipment] = useState(false)
  const [purchaseRequest, setPurchaseRequest] = useState(false)
  const [purchaseRequestLink, setPurchaseRequestLink] = useState('')
  const [hideFromSignage, setHideFromSignage] = useState(false)
  const [recurring, setRecurring] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadMeta = useCallback(async () => {
    if (!token) {
      setMetaError('This page needs a valid link (missing token).')
      setLoadingMeta(false)
      return
    }
    setLoadingMeta(true)
    setMetaError(null)
    try {
      const res = await fetch(`/api/task-intake/meta?t=${encodeURIComponent(token)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMetaError(typeof data.error === 'string' ? data.error : 'This link is not valid.')
        setProductions([])
        return
      }
      setProductions(Array.isArray(data.productions) ? data.productions : [])
    } catch {
      setMetaError('Could not load form. Check your connection and try again.')
    } finally {
      setLoadingMeta(false)
    }
  }, [token])

  useEffect(() => { loadMeta() }, [loadMeta])

  const submit = async () => {
    setSubmitError(null)
    if (!token) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/task-intake/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          t: token,
          submitter_name: submitterName,
          submitter_email: submitterEmail,
          title,
          description: description || null,
          priority,
          due_date: dueDate || null,
          production_id: productionId || null,
          needs_equipment: needsEquipment,
          purchase_request: purchaseRequest,
          purchase_request_link: purchaseRequest ? (purchaseRequestLink.trim() || null) : null,
          hide_from_signage: hideFromSignage,
          recurring: recurring || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(typeof data.error === 'string' ? data.error : 'Submit failed')
        return
      }
      setDone(true)
    } catch {
      setSubmitError('Submit failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const cardBg = '#0f1829'
  const border = 'rgba(255,255,255,0.08)'
  const text = '#f0f4ff'
  const muted = '#94a3b8'
  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${border}`,
    background: '#0a1220',
    color: text,
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0f1e',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '2rem 1rem 3rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: cardBg,
        border: `0.5px solid ${border}`,
        borderRadius: '16px',
        padding: '2rem 1.75rem',
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: text, margin: '0 0 6px' }}>Submit a task</h1>
        <p style={{ fontSize: '13px', color: muted, margin: '0 0 1.25rem', lineHeight: 1.45 }}>
          Use the link you were given. Your request is sent to CSDtv staff and appears in their task list.
        </p>

        {loadingMeta && <p style={{ color: muted }}>Loading…</p>}
        {!loadingMeta && metaError && (
          <p style={{ color: '#f87171', fontSize: '14px', margin: 0 }}>{metaError}</p>
        )}
        {!loadingMeta && !metaError && done && (
          <p style={{ color: '#34d399', fontSize: '15px', fontWeight: 600, margin: 0 }}>
            Thank you — your task was submitted. Staff have been notified by email.
          </p>
        )}
        {!loadingMeta && !metaError && !done && (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>Your name *</label>
              <input value={submitterName} onChange={e => setSubmitterName(e.target.value)} style={inputStyle} autoComplete="name" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>Your email *</label>
              <input type="email" value={submitterEmail} onChange={e => setSubmitterEmail(e.target.value)} style={inputStyle} autoComplete="email" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>Task title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="Short summary" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>Details</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' as const, minHeight: '100px' }}
                placeholder="What should staff know?"
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
                  {PRIORITIES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>Due date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>Related production (optional)</label>
              <select value={productionId} onChange={e => setProductionId(e.target.value)} style={inputStyle}>
                <option value="">None</option>
                {productions.map(p => (
                  <option key={p.id} value={p.id}>#{p.production_number} {p.title}</option>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'pointer', fontSize: '13px', color: text }}>
              <input type="checkbox" checked={needsEquipment} onChange={e => setNeedsEquipment(e.target.checked)} style={{ accentColor: '#5ba3e0' }} />
              Needs equipment pulled
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'pointer', fontSize: '13px', color: text }}>
              <input type="checkbox" checked={purchaseRequest} onChange={e => setPurchaseRequest(e.target.checked)} style={{ accentColor: '#5ba3e0' }} />
              Purchase request
            </label>
            {purchaseRequest && (
              <div style={{ marginBottom: '12px' }}>
                <input
                  value={purchaseRequestLink}
                  onChange={e => setPurchaseRequestLink(e.target.value)}
                  style={inputStyle}
                  placeholder="https://… link to item or cart"
                />
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'pointer', fontSize: '13px', color: text }}>
              <input type="checkbox" checked={hideFromSignage} onChange={e => setHideFromSignage(e.target.checked)} style={{ accentColor: '#5ba3e0' }} />
              Hide from task signage
            </label>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: muted, marginBottom: '6px' }}>Repeat</label>
              <select value={recurring} onChange={e => setRecurring(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}>
                <option value="">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {submitError && <p style={{ color: '#f87171', fontSize: '13px', margin: '0 0 12px' }}>{submitError}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                border: 'none',
                background: submitting ? '#334155' : '#5ba3e0',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 700,
                cursor: submitting ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit task'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function SubmitFallback() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <p style={{ color: '#94a3b8' }}>Loading…</p>
    </div>
  )
}

export default function SubmitTaskPage() {
  return (
    <Suspense fallback={<SubmitFallback />}>
      <SubmitTaskInner />
    </Suspense>
  )
}
