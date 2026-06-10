'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import SignageDateInput from '@/components/SignageDateInput'

const colors = {
  bg: '#f8f9fc',
  cardBg: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  line: '#d3d6dd',
  text: '#1a1f36',
  muted: '#6b7280',
  info: '#185fa5',
  inputBg: '#fff',
}

const emptyForm = {
  submitter_name: '',
  submitter_email: '',
  title: '',
  start_date: '',
  end_date: '',
  requested_note: '',
}

export default function CicSignageSubmitPage() {
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  const [termSchool, setTermSchool] = useState(false)
  const [termDistrict, setTermDistrict] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)
  const previewRevoke = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    if (previewRevoke.current) URL.revokeObjectURL(previewRevoke.current)
  }, [])

  const onImageChange = (file: File | null) => {
    if (previewRevoke.current) {
      URL.revokeObjectURL(previewRevoke.current)
      previewRevoke.current = null
    }
    setVideoFile(null)
    setImageFile(file)
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    previewRevoke.current = url
    setPreviewUrl(url)
  }

  const onVideoChange = (file: File | null) => {
    if (previewRevoke.current) {
      URL.revokeObjectURL(previewRevoke.current)
      previewRevoke.current = null
    }
    setImageFile(null)
    setPreviewUrl(null)
    setVideoFile(file)
  }

  const validateForm = useCallback((): string | null => {
    if (!form.submitter_name.trim()) return 'Name is required.'
    if (!form.submitter_email.trim()) return 'Email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.submitter_email.trim())) return 'Enter a valid email address.'
    if (!form.start_date || !form.end_date) return 'Start and end dates are required.'
    if (form.start_date > form.end_date) return 'Start date must be on or before the end date.'
    if (!imageFile && !videoFile) return 'Choose an image or video to upload.'
    if (imageFile && videoFile) return 'Submit either an image or a video, not both.'
    return null
  }, [form, imageFile, videoFile])

  const submit = async () => {
    if (!imageFile && !videoFile) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const fd = new FormData()
      fd.set('submitter_name', form.submitter_name.trim())
      fd.set('submitter_email', form.submitter_email.trim())
      fd.set('title', form.title.trim())
      fd.set('start_date', form.start_date)
      fd.set('end_date', form.end_date)
      fd.set('requested_note', form.requested_note.trim())
      fd.set('terms_accepted', 'true')
      if (imageFile) fd.set('image', imageFile)
      if (videoFile) fd.set('video', videoFile)

      const res = await fetch('/api/signage/submit', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Could not submit. Please try again.')
        setShowTerms(false)
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

  const openTerms = () => {
    const err = validateForm()
    if (err) { setSubmitError(err); return }
    setSubmitError('')
    setTermSchool(false)
    setTermDistrict(false)
    setShowTerms(true)
  }

  const lbl: React.CSSProperties = { fontSize: 12, color: colors.muted, margin: '0 0 5px' }
  const input: React.CSSProperties = {
    height: 34,
    border: `1px solid ${colors.line}`,
    borderRadius: 8,
    background: colors.inputBg,
    color: colors.text,
    padding: '0 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }
  const btnPrimary: React.CSSProperties = {
    fontSize: 13,
    padding: '7px 13px',
    borderRadius: 8,
    border: `1px solid ${colors.info}`,
    background: '#fff',
    color: colors.info,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 500,
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {success ? (
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 16, color: colors.text, margin: 0, lineHeight: 1.5 }}>
              Thanks! Your submission is in the review queue. You&apos;ll get an email when it&apos;s been reviewed.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px', color: colors.text }}>Submit to Innovation Center signage</h1>
            <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 14px', lineHeight: 1.6 }}>
              Every image is reviewed before it goes live. Best size 1920 × 1080 landscape. JPG, PNG, or WebP up to 10 MB.
              Optional short MP4 video up to 25 MB.
            </p>

            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={lbl}>Your name</p>
                  <input value={form.submitter_name} onChange={e => setForm(f => ({ ...f, submitter_name: e.target.value }))} style={input} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={lbl}>Email</p>
                  <input type="email" value={form.submitter_email} onChange={e => setForm(f => ({ ...f, submitter_email: e.target.value }))} style={input} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <p style={lbl}>Title or caption</p>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={input} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <p style={lbl}>Image</p>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
                  style={{
                    border: `1px dashed #c4c8d0`,
                    borderRadius: 8,
                    padding: 18,
                    textAlign: 'center',
                    color: colors.muted,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }} />
                  ) : videoFile ? (
                    <span>Video: {videoFile.name}</span>
                  ) : (
                    <>
                      <span style={{ display: 'block', fontSize: 20, marginBottom: 4 }}>↑</span>
                      Drop an image or browse
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,video/mp4"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0] ?? null
                    if (file?.type.startsWith('video/') || file?.name.toLowerCase().endsWith('.mp4')) onVideoChange(file)
                    else onImageChange(file)
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <p style={lbl}>Where / when note</p>
                <textarea
                  value={form.requested_note}
                  onChange={e => setForm(f => ({ ...f, requested_note: e.target.value }))}
                  rows={2}
                  style={{ ...input, height: 'auto', padding: '8px 10px', resize: 'vertical' }}
                  placeholder="e.g. Culinary hallway, during open house week"
                />
              </div>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <p style={lbl}>Show from</p>
                  <SignageDateInput value={form.start_date} defaultToToday onChange={v => setForm(f => ({ ...f, start_date: v }))} style={input} />
                </div>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <p style={lbl}>Show until</p>
                  <SignageDateInput value={form.end_date} onChange={v => setForm(f => ({ ...f, end_date: v }))} style={input} min={form.start_date || undefined} />
                </div>
              </div>

              {submitError && !showTerms && (
                <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 12px' }}>{submitError}</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={openTerms} disabled={submitting} style={btnPrimary}>
                  I agree and submit
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showTerms && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="terms-title" style={{ background: colors.cardBg, borderRadius: 12, padding: '20px 22px', maxWidth: 440, width: '100%', border: `1px solid ${colors.border}` }}>
            <h2 id="terms-title" style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: colors.text }}>Before you submit</h2>
            <label style={{ display: 'flex', gap: 7, marginBottom: 8, fontSize: 13, cursor: 'pointer', color: colors.text, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={termSchool} onChange={e => setTermSchool(e.target.checked)} style={{ marginTop: 2 }} />
              <span>This image is appropriate for a school and district audience.</span>
            </label>
            <label style={{ display: 'flex', gap: 7, marginBottom: 16, fontSize: 13, cursor: 'pointer', color: colors.text, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={termDistrict} onChange={e => setTermDistrict(e.target.checked)} style={{ marginTop: 2 }} />
              <span>This content is applicable to the Canyons School District.</span>
            </label>
            {submitError && <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 12px' }}>{submitError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                style={{ fontSize: 13, padding: '7px 13px', borderRadius: 8, border: `1px solid ${colors.line}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || !termSchool || !termDistrict}
                style={{
                  ...btnPrimary,
                  opacity: termSchool && termDistrict ? 1 : 0.5,
                  cursor: termSchool && termDistrict ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? 'Submitting…' : 'I agree and submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
