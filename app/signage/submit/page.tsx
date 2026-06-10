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

type Area = { id: string; name: string; site_name: string | null; screen_count: number }

export default function CicSignageSubmitPage() {
  const [areas, setAreas] = useState<Area[]>([])
  const [areaId, setAreaId] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [wantVisitor, setWantVisitor] = useState(false)
  const [wantAnnouncement, setWantAnnouncement] = useState(false)
  const [wantImage, setWantImage] = useState(false)

  const [visitorName, setVisitorName] = useState('')
  const [visitorNote, setVisitorNote] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [annTitle, setAnnTitle] = useState('')
  const [annSubtitle, setAnnSubtitle] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const [showTerms, setShowTerms] = useState(false)
  const [termSchool, setTermSchool] = useState(false)
  const [termDistrict, setTermDistrict] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)
  const previewRevoke = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/signage/public-areas').then(r => r.json()).then(d => setAreas(d.areas || [])).catch(() => {})
    return () => { if (previewRevoke.current) URL.revokeObjectURL(previewRevoke.current) }
  }, [])

  const selectedArea = areas.find(a => a.id === areaId)

  const onFileChange = (file: File | null) => {
    if (previewRevoke.current) { URL.revokeObjectURL(previewRevoke.current); previewRevoke.current = null }
    if (!file) { setImageFile(null); setVideoFile(null); setPreviewUrl(null); return }
    const isVideo = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4')
    if (isVideo) { setVideoFile(file); setImageFile(null); setPreviewUrl(null); return }
    setImageFile(file); setVideoFile(null)
    const url = URL.createObjectURL(file); previewRevoke.current = url; setPreviewUrl(url)
  }

  const validateForm = useCallback((): string | null => {
    if (!name.trim()) return 'Your name is required.'
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.'
    if (!areaId) return 'Choose an area.'
    if (!wantVisitor && !wantAnnouncement && !wantImage) return 'Add at least one item: a visitor, an announcement, or an image.'
    if (wantImage && !imageFile && !videoFile) return 'Choose an image or video to upload.'
    if (wantAnnouncement && !annTitle.trim()) return 'Enter the announcement title.'
    if ((wantImage || wantAnnouncement)) {
      if (!startDate || !endDate) return 'Choose show-from and show-until dates.'
      if (startDate > endDate) return 'Show-from must be on or before show-until.'
    }
    if (wantVisitor && (!visitorName.trim() || !visitDate)) return 'Enter the visitor name and visit date.'
    return null
  }, [name, email, areaId, wantVisitor, wantAnnouncement, wantImage, imageFile, videoFile, annTitle, startDate, endDate, visitorName, visitDate])

  const submit = async () => {
    setSubmitting(true); setSubmitError('')
    try {
      const fd = new FormData()
      fd.set('submitter_name', name.trim())
      fd.set('submitter_email', email.trim())
      fd.set('area_id', areaId)
      fd.set('requested_note', note.trim())
      fd.set('terms_accepted', 'true')
      if (wantImage || wantAnnouncement) { fd.set('start_date', startDate); fd.set('end_date', endDate) }
      if (wantImage && imageFile) fd.set('image', imageFile)
      if (wantImage && videoFile) fd.set('video', videoFile)
      if (wantAnnouncement) { fd.set('ann_title', annTitle.trim()); fd.set('ann_subtitle', annSubtitle.trim()) }
      if (wantVisitor) { fd.set('visitor_name', visitorName.trim()); fd.set('visitor_note', visitorNote.trim()); fd.set('visit_date', visitDate) }

      const res = await fetch('/api/signage/submit', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setSubmitError(data.error || 'Could not submit. Please try again.'); setShowTerms(false); return }
      setShowTerms(false); setSuccess(true)
    } catch {
      setSubmitError('Network error — please try again.'); setShowTerms(false)
    } finally { setSubmitting(false) }
  }

  const openTerms = () => {
    const err = validateForm()
    if (err) { setSubmitError(err); return }
    setSubmitError(''); setTermSchool(false); setTermDistrict(false); setShowTerms(true)
  }

  const lbl: React.CSSProperties = { fontSize: 12, color: colors.muted, margin: '0 0 5px' }
  const input: React.CSSProperties = { height: 34, border: `1px solid ${colors.line}`, borderRadius: 8, background: colors.inputBg, color: colors.text, padding: '0 10px', fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
  const btnPrimary: React.CSSProperties = { fontSize: 13, padding: '7px 13px', borderRadius: 8, border: `1px solid ${colors.info}`, background: '#fff', color: colors.info, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }
  const section: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }
  const toggleRow = (on: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: colors.text, cursor: 'pointer', marginBottom: on ? 12 : 0 })

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 580, margin: '0 auto' }}>
        {success ? (
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 16, color: colors.text, margin: 0, lineHeight: 1.5 }}>
              Thanks! Your submission is in the review queue. You&apos;ll get an email once it&apos;s been reviewed.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', color: colors.text }}>Submit to digital signage</h1>
            <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 14px', lineHeight: 1.6 }}>
              Add a visitor welcome, an announcement, an image — or any combination. Everything is reviewed before it goes on screen.
            </p>

            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={lbl}>Your name</p>
                  <input value={name} onChange={e => setName(e.target.value)} style={input} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={lbl}>Email</p>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={input} />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <p style={lbl}>Area</p>
                <select value={areaId} onChange={e => setAreaId(e.target.value)} style={input}>
                  <option value="">Choose an area…</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.name}{a.site_name ? ` — ${a.site_name}` : ''} ({a.screen_count} screen{a.screen_count === 1 ? '' : 's'})</option>
                  ))}
                </select>
                {selectedArea && (
                  <p style={{ fontSize: 12, color: colors.info, margin: '6px 0 0' }}>
                    This will go to {selectedArea.screen_count} screen{selectedArea.screen_count === 1 ? '' : 's'} in {selectedArea.name}.
                  </p>
                )}
              </div>

              {/* Visitor */}
              <div style={section}>
                <label style={toggleRow(wantVisitor)}>
                  <input type="checkbox" checked={wantVisitor} onChange={e => setWantVisitor(e.target.checked)} />
                  Welcome a visitor
                </label>
                {wantVisitor && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div><p style={lbl}>Visitor name</p><input value={visitorName} onChange={e => setVisitorName(e.target.value)} style={input} /></div>
                    <div><p style={lbl}>Note (optional)</p><input value={visitorNote} onChange={e => setVisitorNote(e.target.value)} placeholder="e.g. here to see the EMT program" style={input} /></div>
                    <div><p style={lbl}>Visit date</p><SignageDateInput value={visitDate} defaultToToday onChange={setVisitDate} style={input} /></div>
                  </div>
                )}
              </div>

              {/* Announcement */}
              <div style={section}>
                <label style={toggleRow(wantAnnouncement)}>
                  <input type="checkbox" checked={wantAnnouncement} onChange={e => setWantAnnouncement(e.target.checked)} />
                  Post an announcement
                </label>
                {wantAnnouncement && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div><p style={lbl}>Title</p><input value={annTitle} onChange={e => setAnnTitle(e.target.value)} style={input} /></div>
                    <div><p style={lbl}>Subtitle (optional)</p><input value={annSubtitle} onChange={e => setAnnSubtitle(e.target.value)} style={input} /></div>
                  </div>
                )}
              </div>

              {/* Image */}
              <div style={section}>
                <label style={toggleRow(wantImage)}>
                  <input type="checkbox" checked={wantImage} onChange={e => setWantImage(e.target.checked)} />
                  Add an image or video
                </label>
                {wantImage && (
                  <div>
                    <div
                      role="button" tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
                      style={{ border: '1px dashed #c4c8d0', borderRadius: 8, padding: 18, textAlign: 'center', color: colors.muted, fontSize: 13, cursor: 'pointer' }}
                    >
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8 }} />
                      ) : videoFile ? <span>Video: {videoFile.name}</span> : (
                        <><span style={{ display: 'block', fontSize: 20, marginBottom: 4 }}>↑</span>Drop an image or browse — best 1920 × 1080, JPG/PNG/WebP or MP4</>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,video/mp4" style={{ display: 'none' }} onChange={e => onFileChange(e.target.files?.[0] ?? null)} />
                  </div>
                )}
              </div>

              {(wantImage || wantAnnouncement) && (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 130 }}><p style={lbl}>Show from</p><SignageDateInput value={startDate} defaultToToday onChange={setStartDate} style={input} /></div>
                  <div style={{ flex: 1, minWidth: 130 }}><p style={lbl}>Show until</p><SignageDateInput value={endDate} onChange={setEndDate} style={input} min={startDate || undefined} /></div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <p style={lbl}>Anything else for the reviewer? (optional)</p>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...input, height: 'auto', padding: '8px 10px', resize: 'vertical' }} />
              </div>

              {submitError && !showTerms && <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 12px' }}>{submitError}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={openTerms} disabled={submitting} style={btnPrimary}>Review and submit</button>
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
              <span>This content is appropriate for a school and district audience.</span>
            </label>
            <label style={{ display: 'flex', gap: 7, marginBottom: 16, fontSize: 13, cursor: 'pointer', color: colors.text, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={termDistrict} onChange={e => setTermDistrict(e.target.checked)} style={{ marginTop: 2 }} />
              <span>This content is applicable to the Canyons School District.</span>
            </label>
            {submitError && <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 12px' }}>{submitError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowTerms(false)} style={{ fontSize: 13, padding: '7px 13px', borderRadius: 8, border: `1px solid ${colors.line}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button type="button" onClick={() => void submit()} disabled={submitting || !termSchool || !termDistrict} style={{ ...btnPrimary, opacity: termSchool && termDistrict ? 1 : 0.5, cursor: termSchool && termDistrict ? 'pointer' : 'not-allowed' }}>
                {submitting ? 'Submitting…' : 'I agree and submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
