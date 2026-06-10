'use client'

import type { PTabCtx } from './production-tab-ctx'

export default function ThumbnailTab({ c }: { c: PTabCtx }) {
  const { THUMB_EVENT_TYPES, THUMB_MASCOT_MODES, THUMB_TONES, border, brandTone, buildThumbnailPreviewDoc, cardBg, clearThumbnailDraft, copyThumbPrompt, dangerTone, downloadThumbnailPng, downloadThumbnailSvg, infoTone, inputBg, inputStyle, missingThumbFields, muted, schools, setThumbConceptAnchor, setThumbDate, setThumbDetail, setThumbEventDescription, setThumbEventName, setThumbEventType, setThumbLogistics, setThumbMascotMode, setThumbPrompt, setThumbSchoolCode, setThumbSchoolOverride, setThumbSvgInput, setThumbTime, setThumbTone, successTone, text, thumbConceptAnchor, thumbCopied, thumbDate, thumbDetail, thumbDraftRestored, thumbDraftSavedAt, thumbEventDescription, thumbEventName, thumbEventType, thumbLogistics, thumbMascotMode, thumbPrompt, thumbSanitizedSvg, thumbSchoolCode, thumbSchoolOverride, thumbSvgError, thumbSvgInput, thumbTime, thumbTone, warningTone } = c
  return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>Thumbnail prompt inputs</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>School</label>
                <select
                  value={thumbSchoolCode}
                  onChange={e => {
                    const v = e.target.value
                    setThumbSchoolCode(v)
                    if (v === 'district') {
                      setThumbSchoolOverride('Canyons School District')
                      return
                    }
                    const s = schools.find(x => x.id === v)
                    if (s?.name) setThumbSchoolOverride(s.name)
                  }}
                  style={inputStyle}
                >
                  <option value="district">Other / District</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Event name</label>
                <input value={thumbEventName} onChange={e => setThumbEventName(e.target.value)} placeholder="Instrumental Concert" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Date</label>
                <input type="date" value={thumbDate} onChange={e => setThumbDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Time</label>
                <input value={thumbTime} onChange={e => setThumbTime(e.target.value)} placeholder="6:00 PM" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>School override</label>
                <input value={thumbSchoolOverride} onChange={e => setThumbSchoolOverride(e.target.value)} placeholder="Mount Jordan Middle School" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Additional detail</label>
                <input value={thumbDetail} onChange={e => setThumbDetail(e.target.value)} placeholder="Band & Orchestra" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Event type</label>
                <select value={thumbEventType} onChange={e => setThumbEventType(e.target.value as (typeof THUMB_EVENT_TYPES)[number])} style={inputStyle}>
                  {THUMB_EVENT_TYPES.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Tone</label>
                <select value={thumbTone} onChange={e => setThumbTone(e.target.value as (typeof THUMB_TONES)[number])} style={inputStyle}>
                  {THUMB_TONES.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Mascot mode</label>
                <select value={thumbMascotMode} onChange={e => setThumbMascotMode(e.target.value as (typeof THUMB_MASCOT_MODES)[number])} style={inputStyle}>
                  {THUMB_MASCOT_MODES.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Event description</label>
              <textarea value={thumbEventDescription} onChange={e => setThumbEventDescription(e.target.value)} rows={3} placeholder="Briefly describe who/what should be represented in the art direction." style={{ ...inputStyle, minHeight: '78px', resize: 'vertical' as const }} />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Logistics</label>
              <textarea value={thumbLogistics} onChange={e => setThumbLogistics(e.target.value)} rows={2} placeholder="Date/time cues, venue context, lower-third constraints, etc." style={{ ...inputStyle, minHeight: '66px', resize: 'vertical' as const }} />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Concept anchor</label>
              <textarea value={thumbConceptAnchor} onChange={e => setThumbConceptAnchor(e.target.value)} rows={2} placeholder="A single layout and composition direction to ground the design." style={{ ...inputStyle, minHeight: '66px', resize: 'vertical' as const }} />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', color: muted, display: 'block' }}>Generated prompt (editable)</label>
                <button onClick={copyThumbPrompt} disabled={missingThumbFields.length > 0} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: missingThumbFields.length > 0 ? inputBg : (thumbCopied ? successTone : brandTone), color: missingThumbFields.length > 0 ? muted : '#fff', border: 'none', cursor: missingThumbFields.length > 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{thumbCopied ? 'Copied' : 'Copy'}</button>
              </div>
              {missingThumbFields.length > 0 && (
                <p style={{ margin: '0 0 6px', fontSize: '11px', color: warningTone }}>Required: {missingThumbFields.join(', ')}</p>
              )}
              <textarea value={thumbPrompt} onChange={e => setThumbPrompt(e.target.value)} rows={16} style={{ ...inputStyle, minHeight: '280px', resize: 'vertical' as const, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', lineHeight: 1.4 }} />
            </div>

            <div style={{ padding: '10px 12px', background: inputBg, borderRadius: '10px', border: `0.5px solid ${border}` }}>
              <p style={{ fontSize: '11px', color: muted, margin: 0 }}>
                Tip: Event Name and School are required to copy. Keep concept anchor concise for stronger consistency.
              </p>
              <p style={{ fontSize: '11px', color: muted, margin: '6px 0 0' }}>
                Drafts auto-save on this device for 30 days{thumbDraftSavedAt ? ` · last saved ${new Date(thumbDraftSavedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}.
              </p>
              {thumbDraftRestored && (
                <p style={{ fontSize: '11px', color: infoTone, margin: '6px 0 0' }}>
                  Restored saved thumbnail draft for this production.
                </p>
              )}
            </div>
          </div>

          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 10px' }}>SVG preview & download</h3>
            <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '4px' }}>Paste Claude SVG output</label>
            <textarea value={thumbSvgInput} onChange={e => setThumbSvgInput(e.target.value)} rows={8} placeholder="<svg ...>...</svg>" style={{ ...inputStyle, minHeight: '180px', resize: 'vertical' as const, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' }} />
            {thumbSvgError && <p style={{ margin: '6px 0 0', color: dangerTone, fontSize: '12px' }}>{thumbSvgError}</p>}

            <div style={{ marginTop: '10px', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', aspectRatio: '16 / 9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {thumbSanitizedSvg ? (
                <iframe title="Thumbnail SVG preview" sandbox="" srcDoc={buildThumbnailPreviewDoc(thumbSanitizedSvg)} style={{ width: '100%', height: '100%', border: 'none' }} />
              ) : (
                <p style={{ fontSize: '12px', color: muted, margin: 0 }}>Paste SVG to preview</p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', gap: '8px', flexWrap: 'wrap' as const }}>
              <button
                onClick={downloadThumbnailSvg}
                disabled={!thumbSanitizedSvg || missingThumbFields.length > 0}
                style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', background: 'transparent', color: (!thumbSanitizedSvg || missingThumbFields.length > 0) ? muted : text, border: `0.5px solid ${(!thumbSanitizedSvg || missingThumbFields.length > 0) ? border : infoTone}`, cursor: (!thumbSanitizedSvg || missingThumbFields.length > 0) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                Save SVG
              </button>
              <button
                onClick={downloadThumbnailPng}
                disabled={!thumbSanitizedSvg || missingThumbFields.length > 0}
                style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', background: (thumbSanitizedSvg && missingThumbFields.length === 0) ? brandTone : inputBg, color: (thumbSanitizedSvg && missingThumbFields.length === 0) ? '#fff' : muted, border: 'none', cursor: (thumbSanitizedSvg && missingThumbFields.length === 0) ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
              >
                Download PNG
              </button>
              <button
                onClick={clearThumbnailDraft}
                style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Clear Saved Draft
              </button>
            </div>
          </div>
        </div>
  )
}
