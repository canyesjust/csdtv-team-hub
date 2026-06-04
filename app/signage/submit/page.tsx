'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const colors = {
  bg: '#f8f9fc',
  cardBg: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  text: '#1a1f36',
  muted: '#6b7280',
  primary: '#1e6cb5',
  warning: '#b45309',
  success: '#22c55e',
  danger: '#ef4444',
}

const emptyForm = {
  submitter_name: '',
  submitter_email: '',
  department: '',
  caption: '',
  start_date: '',
  end_date: '',
  notes: '',
}

export default function SignageSubmitPage() {
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [portraitWarning, setPortraitWarning] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [termSchool, setTermSchool] = useState(false)
  const [termDistrict, setTermDistrict] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)
  const previewRevoke = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewRevoke.current) URL.revokeObjectURL(previewRevoke.current)
    }
  }, [])

  const onImageChange = (file: File | null) => {
    if (previewRevoke.current) {
      URL.revokeObjectURL(previewRevoke.current)
      previewRevoke.current = null
    }
    setImageFile(file)
    setPortraitWarning(false)
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    previewRevoke.current = url
    setPreviewUrl(url)
    const img = new window.Image()
    img.onload = () => {
      if (img.naturalHeight > img.naturalWidth) setPortraitWarning(true)
    }
    img.src = url
  }

  const validateForm = useCallback((): string | null => {
    if (!form.submitter_name.trim()) return 'Name is required.'
    if (!form.submitter_email.trim()) return 'Email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.submitter_email.trim())) {
      return 'Enter a valid email address.'
    }
    if (!form.start_date || !form.end_date) return 'Start and end dates are required.'
    if (form.start_date > form.end_date) return 'Start date must be on or before the end date.'
    if (!imageFile) return 'Choose an image to upload.'
    return null
  }, [form, imageFile])

  const openTerms = () => {
    const err = validateForm()
    if (err) {
      setSubmitError(err)
      return
    }
    setSubmitError('')
    setTermSchool(false)
    setTermDistrict(false)
    setShowTerms(true)
  }

  const submit = async () => {
    if (!imageFile) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const fd = new FormData()
      fd.set('submitter_name', form.submitter_name.trim())
      fd.set('submitter_email', form.submitter_email.trim())
      fd.set('department', form.department.trim())
      fd.set('caption', form.caption.trim())
      fd.set('start_date', form.start_date)
      fd.set('end_date', form.end_date)
      fd.set('notes', form.notes.trim())
      fd.set('terms_accepted', 'true')
      fd.set('image', imageFile)

      const res = await fetch('/api/signage-submissions', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Could not submit. Please try again.')
        setShowTerms(false)
        setSubmitting(false)
        return
      }
      setShowTerms(false)
      setSuccess(true)
    } catch {
      setSubmitError('Network error — please try again.')
      setShowTerms(false)
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setForm(emptyForm)
    onImageChange(null)
    setSuccess(false)
    setSubmitError('')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#f8f9fc',
    border: `0.5px solid ${colors.border}`,
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '15px',
    color: colors.text,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: colors.text, margin: '0 0 8px' }}>CSDtv Office Signage</h1>
          <p style={{ fontSize: '15px', color: colors.muted, margin: 0 }}>Image submission</p>
        </div>

        {success ? (
          <div style={{ background: colors.cardBg, border: `0.5px solid ${colors.border}`, borderRadius: '16px', padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: '17px', color: colors.text, margin: '0 0 12px', lineHeight: 1.5 }}>
              Thanks. Your image was submitted for review. You&apos;ll get an email when it&apos;s been reviewed.
            </p>
            <button
              type="button"
              onClick={resetForm}
              style={{
                marginTop: '8px',
                background: 'transparent',
                border: 'none',
                color: colors.primary,
                fontSize: '15px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                minHeight: '44px',
              }}
            >
              Submit another
            </button>
          </div>
        ) : (
          <div style={{ background: colors.cardBg, border: `0.5px solid ${colors.border}`, borderRadius: '16px', padding: '24px' }}>
            <div style={{ fontSize: '15px', color: colors.text, lineHeight: 1.6, marginBottom: '20px' }}>
              <p style={{ margin: '0 0 12px' }}>
                Submit an image to run on the CSDtv office digital signage. Every image is reviewed before it goes live.
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', color: colors.muted }}>
                <li>Size: 1920 × 1080 pixels (16:9 landscape) works best. Other sizes get fit onto a black background, no cropping.</li>
                <li>Format: JPG, PNG, or WebP, up to 10 MB.</li>
                <li>Keep any text large enough to read from across a room.</li>
                <li>Choose the start and end dates for how long it should run.</li>
              </ul>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>Name *</span>
                <input
                  value={form.submitter_name}
                  onChange={e => setForm(f => ({ ...f, submitter_name: e.target.value }))}
                  style={inputStyle}
                  autoComplete="name"
                />
              </label>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>Email *</span>
                <input
                  type="email"
                  value={form.submitter_email}
                  onChange={e => setForm(f => ({ ...f, submitter_email: e.target.value }))}
                  style={inputStyle}
                  autoComplete="email"
                />
              </label>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>Department or school</span>
                <input
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>Caption</span>
                <input
                  value={form.caption}
                  onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>Start date *</span>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>End date *</span>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
              </div>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>Notes (optional)</span>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' as const }}
                />
              </label>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>Image *</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={e => onImageChange(e.target.files?.[0] ?? null)}
                  style={{ fontSize: '14px', color: colors.muted }}
                />
              </label>
              {previewUrl && (
                <div>
                  <img
                    src={previewUrl}
                    alt="Preview"
                    style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', background: '#000', borderRadius: '10px' }}
                  />
                  {portraitWarning && (
                    <p style={{ fontSize: '14px', color: colors.warning, margin: '10px 0 0', lineHeight: 1.5 }}>
                      This looks like a portrait image. It will run with black bars on each side. A 1920 × 1080 landscape image fills the screen best.
                    </p>
                  )}
                </div>
              )}
            </div>

            {submitError && (
              <p style={{ fontSize: '14px', color: colors.danger, margin: '16px 0 0' }}>{submitError}</p>
            )}

            <button
              type="button"
              onClick={openTerms}
              disabled={submitting}
              style={{
                width: '100%',
                marginTop: '20px',
                minHeight: '44px',
                background: colors.primary,
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              Submit
            </button>
          </div>
        )}
      </div>

      {showTerms && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 50,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: colors.cardBg,
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '440px',
              width: '100%',
              border: `0.5px solid ${colors.border}`,
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>Before you submit</h2>
            <p style={{ fontSize: '14px', color: colors.muted, margin: '0 0 16px' }}>
              Recommended size: 1920 × 1080 px (16:9 landscape).
            </p>
            <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px', fontSize: '15px', color: colors.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={termSchool} onChange={e => setTermSchool(e.target.checked)} style={{ marginTop: '4px' }} />
              <span>This image is appropriate for a school and district audience.</span>
            </label>
            <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '20px', fontSize: '15px', color: colors.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={termDistrict} onChange={e => setTermDistrict(e.target.checked)} style={{ marginTop: '4px' }} />
              <span>This content is applicable to the Canyons School District office.</span>
            </label>
            {submitError && (
              <p style={{ fontSize: '14px', color: colors.danger, margin: '0 0 12px' }}>{submitError}</p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' as const }}>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                disabled={submitting}
                style={{
                  minHeight: '44px',
                  padding: '0 18px',
                  borderRadius: '10px',
                  border: `0.5px solid ${colors.border}`,
                  background: 'transparent',
                  color: colors.muted,
                  fontFamily: 'inherit',
                  fontSize: '15px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || !termSchool || !termDistrict}
                style={{
                  minHeight: '44px',
                  padding: '0 18px',
                  borderRadius: '10px',
                  border: 'none',
                  background: termSchool && termDistrict ? colors.primary : '#cbd5e1',
                  color: '#fff',
                  fontFamily: 'inherit',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: submitting || !termSchool || !termDistrict ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Submitting…' : 'I Agree & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
