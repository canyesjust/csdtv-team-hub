'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { useSignage } from './SignageProvider'
import { useSignageAdminStyles } from './SignageAdmin'
import { toast } from '@/lib/toast'
import SignageDateInput from '@/components/SignageDateInput'
import { SLIDE_TYPES, validateSlideHtml, wordCapForType, type SlideType } from '@/lib/signage/slide-guardrails'

const MOTIONS: [string, string][] = [['subtle', 'Subtle'], ['none', 'None (static)'], ['lively', 'Lively']]
const DWELLS = [10, 15, 20]
const LOGO_POSITIONS: [string, string][] = [['none', 'No logo'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']]
const LOGO_CORNER_CSS: Record<string, string> = {
  'top-left': 'top:4vh;left:4vw', 'top-right': 'top:4vh;right:4vw',
  'bottom-left': 'bottom:4vh;left:4vw', 'bottom-right': 'bottom:4vh;right:4vw',
}

// Deterministically stamp the real district logo into a corner of the slide.
// Kept as an overlay (not model-authored) so placement is exact and consistent.
function applyLogoOverlay(baseHtml: string, dataUri: string | null, position: string): string {
  if (!baseHtml || position === 'none' || !dataUri) return baseHtml
  const corner = LOGO_CORNER_CSS[position] || LOGO_CORNER_CSS['top-right']
  const img = `<img data-district-logo alt="" src="${dataUri}" style="position:fixed;${corner};max-height:11vh;max-width:26vw;object-fit:contain;z-index:2147483647;pointer-events:none">`
  return baseHtml.includes('</body>') ? baseHtml.replace('</body>', `${img}</body>`) : baseHtml + img
}
const GUARDRAILS = [
  'Type scales to the screen (no fixed sizes)',
  'Text kept short and glanceable',
  'High-contrast, room-readable',
  'Safe margins for TV overscan',
  'Self-contained & offline-safe',
  "Your location's brand applied",
]

export default function CreateWithAI({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const { activeSiteId, sites } = useSignage()
  const activeSite = sites.find(x => x.id === activeSiteId)

  const [prompt, setPrompt] = useState('')
  const [type, setType] = useState('celebration')
  const [motion, setMotion] = useState('subtle')
  const [orientation, setOrientation] = useState('landscape')
  const [dwell, setDwell] = useState(15)
  const [headline, setHeadline] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [html, setHtml] = useState<string | null>(null)
  const [canvas, setCanvas] = useState({ w: 1920, h: 1080 })
  const [genMeta, setGenMeta] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [refining, setRefining] = useState(false)
  const [showHtmlEdit, setShowHtmlEdit] = useState(false)
  const [logoPosition, setLogoPosition] = useState('none')
  const [logoVariant, setLogoVariant] = useState<'white' | 'color'>('white')
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null)
  const [loadedVariant, setLoadedVariant] = useState<string | null>(null)

  // Load the district logo (inlined) when it's first turned on or the variant
  // changes. Cached per variant so flipping position is instant.
  useEffect(() => {
    if (logoPosition === 'none' || loadedVariant === logoVariant) return
    let cancelled = false
    fetch(`/api/signage/district-logo?variant=${logoVariant}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.dataUri) { setLogoDataUri(d.dataUri); setLoadedVariant(logoVariant) } })
      .catch(() => {})
    return () => { cancelled = true }
  }, [logoPosition, logoVariant, loadedVariant])

  // Base HTML is the model output; the logo is overlaid on top for preview + save.
  const finalHtml = html ? applyLogoOverlay(html, logoDataUri, logoPosition) : null

  // Live QA on the base HTML (generated OR hand-edited). Same validator the
  // server runs, so what you see here is what the save gate enforces.
  const qa = html ? validateSlideHtml(html, { wordCap: wordCapForType(type as SlideType), headlineOverride: headline || null }) : null

  const generate = async () => {
    if (!prompt.trim()) { setError('Enter a prompt first.'); return }
    setGenerating(true); setError(null)
    try {
      const res = await fetch('/api/signage/generate-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type, motion, orientation, dwell_seconds: dwell, headline_override: headline || null, site_id: activeSiteId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Generation failed.'); return }
      setHtml(data.html)
      setCanvas(data.canvas || { w: 1920, h: 1080 })
      setGenMeta(data.gen_meta || null)
    } catch {
      setError('Could not reach the generator.')
    } finally {
      setGenerating(false)
    }
  }

  const refine = async () => {
    if (!html || !refineText.trim()) return
    setRefining(true); setError(null)
    try {
      const res = await fetch('/api/signage/generate-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type, motion, orientation, dwell_seconds: dwell, headline_override: headline || null, site_id: activeSiteId, refine_instruction: refineText.trim(), previous_html: html }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Refine failed.'); return }
      setHtml(data.html)
      setCanvas(data.canvas || canvas)
      setGenMeta(data.gen_meta || genMeta)
      setRefineText('')
    } catch {
      setError('Could not reach the generator.')
    } finally {
      setRefining(false)
    }
  }

  const save = async () => {
    if (!html) return
    if (qa && !qa.ok) { toast('Fix the flagged QA issues before sending.', 'error'); return }
    if (!startDate || !endDate) { toast('Set start and end dates.', 'error'); return }
    setSaving(true)
    const fd = new FormData()
    fd.set('content_type', 'html')
    fd.set('html_body', finalHtml || html)
    fd.set('title', (headline || prompt).slice(0, 60))
    fd.set('start_date', startDate)
    fd.set('end_date', endDate)
    fd.set('all_screens', 'true')
    fd.set('display_seconds', String(dwell))
    fd.set('site_id', activeSiteId)
    fd.set('source', 'ai')
    fd.set('status', 'pending')
    if (genMeta) fd.set('gen_meta', JSON.stringify(genMeta))
    try {
      const res = await fetch('/api/signage/content', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed.', 'error'); return }
      toast('Slide sent to the approval queue.', 'success')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const labelStyle = { ...s.lbl, fontWeight: 500 as const }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,15,30,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 980, background: s.cardBg, border: `1px solid ${s.border}`, borderRadius: 16, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${s.border}` }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: s.text }}>Create with AI</div>
            <div style={{ fontSize: 12, color: s.muted }}>Generates a screen-ready slide for {activeSite?.name || 'this location'}</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...s.btn, border: 'none', background: 'transparent', fontSize: 18, color: s.muted }} aria-label="Close">×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 18, padding: 18 }} className="ai-build-grid">
          {/* Inputs */}
          <div>
            <p style={labelStyle}>Prompt</p>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. Celebrate America's 250th — patriotic, fireworks, July 4" style={{ ...s.textarea, minHeight: 84, marginBottom: 12 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <p style={labelStyle}>Type</p>
                <select value={type} onChange={e => setType(e.target.value)} style={s.input}>
                  {SLIDE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <p style={labelStyle}>Motion</p>
                <select value={motion} onChange={e => setMotion(e.target.value)} style={s.input}>
                  {MOTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <p style={labelStyle}>Orientation</p>
                <select value={orientation} onChange={e => setOrientation(e.target.value)} style={s.input}>
                  <option value="landscape">Landscape 16:9</option>
                  <option value="portrait">Portrait 9:16</option>
                </select>
              </div>
              <div>
                <p style={labelStyle}>Time on screen</p>
                <select value={dwell} onChange={e => setDwell(Number(e.target.value))} style={s.input}>
                  {DWELLS.map(d => <option key={d} value={d}>{d} seconds</option>)}
                </select>
              </div>
            </div>

            <p style={labelStyle}>Headline override (optional)</p>
            <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Force exact headline text" style={{ ...s.input, marginBottom: 14 }} />

            <button type="button" onClick={() => void generate()} disabled={generating} style={{ ...s.btnPrimary, width: '100%', padding: '10px 13px', opacity: generating ? 0.6 : 1 }}>
              {generating ? 'Generating…' : html ? 'Regenerate' : 'Generate'}
            </button>
            {error && <p style={{ fontSize: 12.5, color: '#ef4444', margin: '10px 0 0' }}>{error}</p>}

            <div style={{ marginTop: 16, padding: '10px 12px', background: s.infoBg, borderRadius: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: s.info, margin: '0 0 6px' }}>Readability guardrails · always on</p>
              {GUARDRAILS.map(g => (
                <div key={g} style={{ fontSize: 12, color: s.text, display: 'flex', gap: 6, marginTop: 3 }}><span style={{ color: s.info }}>✓</span>{g}</div>
              ))}
            </div>
          </div>

          {/* Preview + schedule */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ ...labelStyle, margin: 0 }}>Preview</p>
              <span style={{ fontSize: 11, color: s.muted }}>{orientation === 'portrait' ? '9:16 · 1080×1920' : '16:9 · 1920×1080'}</span>
            </div>
            <div style={{ width: '100%', aspectRatio: `${canvas.w} / ${canvas.h}`, background: '#0b1324', border: `1px solid ${s.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {finalHtml ? (
                <iframe title="Slide preview" sandbox="allow-scripts" srcDoc={finalHtml} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
              ) : (
                <span style={{ color: '#7e93ba', fontSize: 13 }}>{generating ? 'Generating…' : 'Your slide preview appears here'}</span>
              )}
            </div>

            {html && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginTop: 12 }}>
                <div>
                  <p style={labelStyle}>District logo</p>
                  <select value={logoPosition} onChange={e => setLogoPosition(e.target.value)} style={s.input}>
                    {LOGO_POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <p style={labelStyle}>Logo color</p>
                  <select value={logoVariant} onChange={e => setLogoVariant(e.target.value as 'white' | 'color')} disabled={logoPosition === 'none'} style={{ ...s.input, opacity: logoPosition === 'none' ? 0.5 : 1 }}>
                    <option value="white">White (dark slides)</option>
                    <option value="color">Color (light slides)</option>
                  </select>
                </div>
              </div>
            )}

            {qa && (
              <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 10, background: qa.ok ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.08)', border: `1px solid ${qa.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}` }}>
                {qa.ok ? (
                  <div style={{ fontSize: 12.5, color: '#16a34a', fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>✓</span> Passed automated checks — scales to screen, text length OK, brand applied, offline-safe.
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12.5, color: '#ef4444', fontWeight: 600, marginBottom: 4 }}>QA found {qa.failures.length} issue{qa.failures.length === 1 ? '' : 's'} — fix before sending:</div>
                    {qa.failures.map((f, i) => (
                      <div key={i} style={{ fontSize: 12, color: s.text, display: 'flex', gap: 6, marginTop: 2 }}><span style={{ color: '#ef4444' }}>•</span>{f}</div>
                    ))}
                  </>
                )}
              </div>
            )}

            {html && (
              <div style={{ marginTop: 12 }}>
                <p style={labelStyle}>Refine this slide</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={refineText}
                    onChange={e => setRefineText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && refineText.trim()) void refine() }}
                    placeholder="e.g. make the headline bigger · change date to July 5 · use more blue"
                    style={{ ...s.input, flex: 1 }}
                  />
                  <button type="button" onClick={() => void refine()} disabled={refining || !refineText.trim()} style={{ ...s.btn, whiteSpace: 'nowrap', opacity: refining || !refineText.trim() ? 0.6 : 1 }}>
                    {refining ? 'Applying…' : 'Apply change'}
                  </button>
                </div>
                <button type="button" onClick={() => setShowHtmlEdit(v => !v)} style={{ ...s.btn, border: 'none', background: 'transparent', color: s.info, padding: '6px 0', fontSize: 12 }}>
                  {showHtmlEdit ? 'Hide HTML' : 'Edit HTML directly'}
                </button>
                {showHtmlEdit && (
                  <textarea
                    value={html}
                    onChange={e => setHtml(e.target.value)}
                    spellCheck={false}
                    style={{ ...s.textarea, minHeight: 160, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}
                  />
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <div>
                <p style={labelStyle}>Start date</p>
                <SignageDateInput value={startDate} defaultToToday colorScheme={s.dark ? 'dark' : 'light'} onChange={setStartDate} style={s.input} />
              </div>
              <div>
                <p style={labelStyle}>End date</p>
                <SignageDateInput value={endDate} colorScheme={s.dark ? 'dark' : 'light'} onChange={setEndDate} style={s.input} min={startDate || undefined} />
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: s.muted, margin: '6px 0 0' }}>Shows from the start date and drops off automatically after the end date.</p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={onClose} style={s.btn}>Cancel</button>
              <button type="button" onClick={() => void save()} disabled={!html || saving || (qa ? !qa.ok : false)} title={qa && !qa.ok ? 'Fix the QA issues first' : undefined} style={{ ...s.btnPrimary, opacity: !html || saving || (qa && !qa.ok) ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Send to approval queue'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 760px) { .ai-build-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
