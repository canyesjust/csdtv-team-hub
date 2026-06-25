'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'
type Logo = { category: string; name: string; png: string | null; jpg: string | null; flagged?: boolean; notes?: string | null }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
type Colors = { primary: string | null; secondary: string | null; accent: string | null; text: string | null }
type School = {
  code: string
  name: string
  type?: string
  shortName: string | null
  mascot: string | null
  city: string | null
  level: BrandLevel
  colors: Colors
}
type DeptSummary = { code: string; name: string; colors: Colors; logoCount: number }

const colors = {
  bg: '#f8f9fc',
  cardBg: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  line: '#d3d6dd',
  text: '#1a1f36',
  muted: '#6b7280',
  info: '#185fa5',
  chip: '#eef1f6',
}

const CATEGORY_ORDER = ['Official', 'Wordmark', 'Team/Sport', 'Specific', 'Other']

function readableOn(hex: string | null): string {
  if (!hex) return '#ffffff'
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return '#ffffff'
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1a1f36' : '#ffffff'
}

type PreviewBg = 'check' | 'light' | 'dark'
function previewBg(mode: PreviewBg): CSSProperties {
  if (mode === 'dark') return { background: '#2b2f3a' }
  if (mode === 'light') return { background: '#ffffff' }
  return {
    backgroundColor: '#ffffff',
    backgroundImage:
      'linear-gradient(45deg,#dfe3e8 25%,transparent 25%),linear-gradient(-45deg,#dfe3e8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dfe3e8 75%),linear-gradient(-45deg,transparent 75%,#dfe3e8 75%)',
    backgroundSize: '18px 18px',
    backgroundPosition: '0 0,0 9px,9px -9px,-9px 0',
  }
}

function orderCategories(cats: string[]): string[] {
  const present = Array.from(new Set(cats))
  const known = CATEGORY_ORDER.filter((c) => present.includes(c))
  const extra = present.filter((c) => !CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b))
  return [...known, ...extra]
}

export default function SchoolBrandPage() {
  const params = useParams<{ code: string }>()
  const code = String(params?.code || '')
  const [school, setSchool] = useState<School | null>(null)
  const [logos, setLogos] = useState<Logo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [reviewKey, setReviewKey] = useState<string | null>(null)
  const [bg, setBg] = useState<PreviewBg>('check')
  const [flagError, setFlagError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Logo | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [departments, setDepartments] = useState<DeptSummary[]>([])

  const openDrawer = (l: Logo) => { setSelected(l); setDims(null); setFileSize(null) }

  useEffect(() => {
    if (!selected) return
    const url = selected.png || selected.jpg
    if (!url) return
    let cancelled = false
    fetch(url, { method: 'HEAD' })
      .then((r) => { const len = r.headers.get('content-length'); if (!cancelled && len) setFileSize(Number(len)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selected])

  useEffect(() => {
    if (school?.type !== 'district') return
    let cancelled = false
    fetch('/api/brand', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && Array.isArray(d?.departments)) setDepartments(d.departments as DeptSummary[]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [school?.type])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  useEffect(() => {
    // Read after mount so server and client first render match (no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewKey(new URLSearchParams(window.location.search).get('review'))
  }, [])

  useEffect(() => {
    if (!code) return
    let cancelled = false
    fetch(`/api/brand/${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d?.school) { setSchool(d.school as School); setLogos(Array.isArray(d.logos) ? (d.logos as Logo[]) : []) }
        else setLoadError(typeof d?.error === 'string' ? d.error : 'School not found.')
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setLoadError('Could not load this school.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [code])

  const grouped = useMemo(() => {
    const map = new Map<string, Logo[]>()
    for (const l of logos) {
      if (!map.has(l.category)) map.set(l.category, [])
      map.get(l.category)!.push(l)
    }
    return orderCategories([...map.keys()]).map((cat) => ({ category: cat, items: map.get(cat) || [] }))
  }, [logos])

  const toggleFlag = async (l: Logo) => {
    if (!reviewKey) return
    const next = !l.flagged
    setFlagError(null)
    setLogos((prev) => prev.map((x) => (x.category === l.category && x.name === l.name ? { ...x, flagged: next } : x)))
    const revert = () => setLogos((prev) => prev.map((x) => (x.category === l.category && x.name === l.name ? { ...x, flagged: !next } : x)))
    try {
      const res = await fetch('/api/brand/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: reviewKey, code, category: l.category, name: l.name, flagged: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        revert()
        setFlagError(typeof d?.error === 'string' ? d.error : 'Could not save your mark. Check that you opened the correct review link.')
      }
    } catch {
      revert()
      setFlagError('Could not reach the server, so your mark was not saved. Try again.')
    }
  }

  const copyHex = async (key: string, hex: string) => {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
    } catch {
      // ignore
    }
  }

  const dlBtn: CSSProperties = { padding: '5px 12px', borderRadius: 7, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.info, fontSize: 12, fontWeight: 700, textDecoration: 'none' }

  const swatch = (slot: 'primary' | 'secondary' | 'accent' | 'text', label: string) => {
    if (!school) return null
    const hex = school.colors[slot]
    if (!hex) return null
    const key = slot
    return (
      <button key={slot} type="button" onClick={() => copyHex(key, hex)} title={`Copy ${hex}`}
        style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 96, border: `1px solid ${colors.line}`, borderRadius: 8, padding: 0, background: colors.cardBg, cursor: 'pointer', overflow: 'hidden', textAlign: 'left' }}>
        <span style={{ height: 32, background: hex, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: readableOn(hex) }}>{copied === key ? 'Copied' : ''}</span>
        <span style={{ padding: '3px 8px 6px' }}>
          <span style={{ display: 'block', fontSize: 9.5, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{hex}</span>
        </span>
      </button>
    )
  }

  return (
    <div style={{ background: colors.bg, minHeight: '100vh', color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 1640, margin: '0 auto', padding: '24px 24px 72px' }}>
        <Link href="/brand" style={{ fontSize: 13, fontWeight: 700, color: colors.info, textDecoration: 'none' }}>{'←'} All schools</Link>

        {loading ? (
          <p style={{ color: colors.muted, fontSize: 15, padding: '40px 0', textAlign: 'center' }}>Loading...</p>
        ) : loadError ? (
          <p style={{ color: '#b42318', fontSize: 15, padding: '40px 0', textAlign: 'center' }}>{loadError}</p>
        ) : school ? (
          <>
            <header style={{ margin: '14px 0 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{school.name}</h1>
                {(!school.type || school.type === 'school') && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted, background: colors.chip, borderRadius: 999, padding: '3px 10px' }}>{school.level}</span>
                )}
              </div>
              {(school.mascot || school.city) && (
                <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.muted }}>{[school.mascot, school.city].filter(Boolean).join(' · ')}</p>
              )}
            </header>

            {reviewKey && (
              <div style={{ marginBottom: flagError ? 10 : 18, padding: '10px 14px', borderRadius: 10, border: '1px solid #f0b429', background: '#fff8e6', color: '#7a5300', fontSize: 13.5, fontWeight: 600 }}>
                Review mode: click any logo that is old and should be deleted (click it again to undo). Marks save automatically, and a manager confirms the deletions later.
              </div>
            )}
            {reviewKey && flagError && (
              <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 10, border: '1px solid #e0282e', background: '#fdecec', color: '#a4161a', fontSize: 13.5, fontWeight: 600 }}>
                {flagError}
              </div>
            )}

            <section style={{ marginBottom: 26 }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.muted }}>Brand colors</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[swatch('primary', 'Primary'), swatch('secondary', 'Secondary'), swatch('accent', 'Accent'), swatch('text', 'Text')].filter(Boolean)}
                {!school.colors.primary && !school.colors.secondary && !school.colors.accent && !school.colors.text && (
                  <span style={{ fontSize: 13, color: colors.muted }}>No brand colors on file.</span>
                )}
              </div>
            </section>

            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px' }}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.muted }}>Logos</h2>
                {logos.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, color: colors.muted }}>Background</span>
                    {([['check', 'Checkered'], ['light', 'White'], ['dark', 'Dark']] as [PreviewBg, string][]).map(([m, label]) => (
                      <button key={m} type="button" onClick={() => setBg(m)} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${bg === m ? colors.info : colors.line}`, background: bg === m ? colors.info : colors.cardBg, color: bg === m ? '#ffffff' : colors.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                )}
              </div>
              {logos.length === 0 ? (
                <p style={{ fontSize: 14, color: colors.muted, fontStyle: 'italic' }}>No logos have been uploaded for this school yet.</p>
              ) : (
                grouped.map((group) => (
                  <div key={group.category} style={{ marginBottom: 22 }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>{group.category}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
                      {group.items.map((l) => {
                        const preview = l.png || l.jpg
                        return (
                          <div key={`${group.category}-${l.name}`}
                            onClick={reviewKey ? () => toggleFlag(l) : () => openDrawer(l)}
                            style={{ position: 'relative', border: `1px solid ${l.flagged ? '#e0282e' : colors.border}`, borderRadius: 12, background: l.flagged ? '#fdecec' : colors.cardBg, overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer', userSelect: 'none' }}>
                            {reviewKey && (
                              <div aria-hidden style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 30, height: 30, borderRadius: 999, border: `1px solid ${l.flagged ? '#e0282e' : colors.line}`, background: l.flagged ? '#e0282e' : 'rgba(255,255,255,0.92)', color: '#ffffff', fontSize: 15, fontWeight: 800, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {l.flagged ? '✕' : ''}
                              </div>
                            )}
                            <div style={{ height: 220, ...previewBg(bg), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: `1px solid ${colors.line}`, opacity: l.flagged ? 0.45 : 1 }}>
                              {preview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={preview} alt={l.name} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain', pointerEvents: 'none' }} />
                              ) : (
                                <span style={{ fontSize: 12, color: colors.muted }}>No preview</span>
                              )}
                            </div>
                            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{l.name}</span>
                              {reviewKey ? (
                                <span style={{ fontSize: 12, fontWeight: 700, color: l.flagged ? '#e0282e' : colors.muted, marginTop: 'auto' }}>
                                  {l.flagged ? 'Marked for deletion - click to undo' : 'Click to mark as old'}
                                </span>
                              ) : (
                                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                                  {l.png && <a href={l.png} style={dlBtn}>PNG</a>}
                                  {l.jpg && <a href={l.jpg} style={dlBtn}>JPG</a>}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </section>

            {school.type === 'district' && departments.some((d) => d.logoCount > 0) && (
              <section style={{ marginTop: 28 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.muted }}>Departments</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                  {departments.filter((dep) => dep.logoCount > 0).map((dep) => {
                    const sw = (slot: keyof Colors) => {
                      const hex = dep.colors[slot]
                      if (!hex) return null
                      const key = `dep-${dep.code}-${slot}`
                      return (
                        <button key={slot} type="button" onClick={() => copyHex(key, hex)} title={`Copy ${hex}`}
                          style={{ flex: '1 1 0', minWidth: 0, height: 24, borderRadius: 6, border: `1px solid ${colors.line}`, background: hex, color: readableOn(hex), fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          {copied === key ? 'Copied' : hex}
                        </button>
                      )
                    }
                    const sws = [sw('primary'), sw('secondary'), sw('accent'), sw('text')].filter(Boolean)
                    return (
                      <div key={dep.code} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, background: colors.cardBg, padding: '12px 14px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{dep.name}</div>
                        <div style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>{dep.logoCount > 0 ? `${dep.logoCount} logo${dep.logoCount === 1 ? '' : 's'}` : 'No logos yet'}</div>
                        {sws.length > 0 && <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>{sws}</div>}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,25,0.45)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 94vw)', height: '100%', background: colors.bg, boxShadow: '-8px 0 30px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${colors.line}`, position: 'sticky', top: 0, background: colors.bg }}>
              <span style={{ fontSize: 15, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
              <button type="button" onClick={() => setSelected(null)} style={{ flexShrink: 0, padding: '6px 12px', fontSize: 13, fontWeight: 700, color: colors.muted, background: colors.cardBg, border: `1px solid ${colors.line}`, borderRadius: 8, cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ ...previewBg(bg), borderRadius: 12, border: `1px solid ${colors.line}`, minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
                {(selected.png || selected.jpg) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.png || selected.jpg || ''} alt={selected.name} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} style={{ maxWidth: '100%', maxHeight: 440, objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: 13, color: colors.muted }}>No preview</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                {([['check', 'Checkered'], ['light', 'White'], ['dark', 'Dark']] as [PreviewBg, string][]).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setBg(m)} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${bg === m ? colors.info : colors.line}`, background: bg === m ? colors.info : colors.cardBg, color: bg === m ? '#ffffff' : colors.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
              <p style={{ margin: '16px 0 4px', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Image</p>
              <p style={{ margin: 0, fontSize: 14 }}>
                {dims ? `${dims.w} × ${dims.h} px` : 'Loading dimensions...'}{fileSize ? ` · ${formatBytes(fileSize)}` : ''}
              </p>
              <p style={{ margin: '16px 0 4px', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Category</p>
              <p style={{ margin: 0, fontSize: 14 }}>{selected.category}</p>
              {selected.notes && (
                <>
                  <p style={{ margin: '16px 0 4px', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Notes</p>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selected.notes}</p>
                </>
              )}
              <p style={{ margin: '16px 0 8px', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Download</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.png && <a href={selected.png} style={{ ...dlBtn, padding: '8px 16px', fontSize: 13 }}>PNG</a>}
                {selected.jpg && <a href={selected.jpg} style={{ ...dlBtn, padding: '8px 16px', fontSize: 13 }}>JPG</a>}
                {!selected.png && !selected.jpg && <span style={{ fontSize: 13, color: colors.muted }}>No downloadable files.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
