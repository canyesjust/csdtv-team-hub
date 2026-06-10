'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FilePickButton from '@/components/FilePickButton'
import SignageDateInput from '@/components/SignageDateInput'

const colors = {
  bg: '#f8f9fc',
  cardBg: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  text: '#1a1f36',
  muted: '#6b7280',
  primary: '#162844',
  accent: '#1e3649',
  danger: '#ef4444',
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
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: colors.text, margin: '0 0 8px' }}>Canyons Innovation Center</h1>
          <p style={{ fontSize: '15px', color: colors.muted, margin: 0 }}>Digital signage submission</p>
        </div>

        {success ? (
          <div style={{ background: colors.cardBg, border: `0.5px solid ${colors.border}`, borderRadius: '16px', padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: '17px', color: colors.text, margin: 0, lineHeight: 1.5 }}>
              Thanks! Your submission is in the review queue. You&apos;ll get an email when it&apos;s been reviewed.
            </p>
          </div>
        ) : (
          <div style={{ background: colors.cardBg, border: `0.5px solid ${colors.border}`, borderRadius: '16px', padding: '24px' }}>
            <ul style={{ margin: '0 0 20px', paddingLeft: '20px', color: colors.muted, fontSize: '15px', lineHeight: 1.6 }}>
              <li>Best size: 1920 × 1080 landscape (JPG, PNG, or WebP, up to 10 MB)</li>
              <li>Images are fit on black — no cropping</li>
              <li>Optional short MP4 video (up to 25 MB)</li>
              <li>Describe where and when you&apos;d like it shown — an approver sets final placement</li>
            </ul>

            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Name *</span>
                <input value={form.submitter_name} onChange={e => setForm(f => ({ ...f, submitter_name: e.target.value }))} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Email *</span>
                <input type="email" value={form.submitter_email} onChange={e => setForm(f => ({ ...f, submitter_email: e.target.value }))} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Title</span>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Show from *</span>
                  <SignageDateInput value={form.start_date} defaultToToday onChange={v => setForm(f => ({ ...f, start_date: v }))} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Show until *</span>
                  <SignageDateInput value={form.end_date} onChange={v => setForm(f => ({ ...f, end_date: v }))} style={inputStyle} min={form.start_date || undefined} />
                </label>
              </div>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Where / when note</span>
                <textarea value={form.requested_note} onChange={e => setForm(f => ({ ...f, requested_note: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} placeholder="e.g. Culinary hallway, during open house week" />
              </label>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: 6 }}>Image</span>
                <FilePickButton accept="image/png,image/jpeg,image/webp" label="Choose image" changeLabel="Change image" fullWidth onChange={onImageChange} />
              </div>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: 6 }}>Or video (MP4)</span>
                <FilePickButton accept="video/mp4" label="Choose video" changeLabel="Change video" fullWidth onChange={onVideoChange} />
              </div>
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Preview" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', background: '#000', borderRadius: 10 }} />
              )}
              {videoFile && <p style={{ fontSize: 14, color: colors.muted, margin: 0 }}>Video: {videoFile.name}</p>}
            </div>

            {submitError && <p style={{ fontSize: 14, color: colors.danger, marginTop: 16 }}>{submitError}</p>}

            <button
              type="button"
              onClick={() => {
                const err = validateForm()
                if (err) { setSubmitError(err); return }
                setSubmitError('')
                setTermSchool(false)
                setTermDistrict(false)
                setShowTerms(true)
              }}
              disabled={submitting}
              style={{ width: '100%', marginTop: 20, minHeight: 44, background: colors.primary, color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Submit
            </button>
          </div>
        )}
      </div>

      {showTerms && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
          <div role="dialog" aria-modal="true" style={{ background: colors.cardBg, borderRadius: 16, padding: 24, maxWidth: 440, width: '100%' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Before you submit</h2>
            <label style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 15, cursor: 'pointer' }}>
              <input type="checkbox" checked={termSchool} onChange={e => setTermSchool(e.target.checked)} />
              <span>This content is appropriate for a school and district audience.</span>
            </label>
            <label style={{ display: 'flex', gap: 10, marginBottom: 20, fontSize: 15, cursor: 'pointer' }}>
              <input type="checkbox" checked={termDistrict} onChange={e => setTermDistrict(e.target.checked)} />
              <span>This content is applicable to Canyons School District.</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowTerms(false)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: `0.5px solid ${colors.border}`, background: 'transparent', fontFamily: 'inherit', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={() => void submit()} disabled={submitting || !termSchool || !termDistrict} style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: 'none', background: termSchool && termDistrict ? colors.primary : '#cbd5e1', color: '#fff', fontFamily: 'inherit', fontWeight: 600, cursor: termSchool && termDistrict ? 'pointer' : 'not-allowed' }}>{submitting ? 'Submitting…' : 'I Agree & Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
