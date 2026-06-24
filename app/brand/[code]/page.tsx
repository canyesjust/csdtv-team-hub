'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'
type Logo = { category: string; name: string; png: string | null; jpg: string | null; flagged?: boolean }
type School = {
  code: string
  name: string
  shortName: string | null
  mascot: string | null
  city: string | null
  level: BrandLevel
  colors: { primary: string | null; secondary: string | null; accent: string | null; text: string | null }
}

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

const CATEGORY_ORDER = ['Official', 'Team/Sport', 'Specific', 'Other']

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
    setLogos((prev) => prev.map((x) => (x.category === l.category && x.name === l.name ? { ...x, flagged: next } : x)))
    try {
      const res = await fetch('/api/brand/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: reviewKey, code, category: l.category, name: l.name, flagged: next }),
      })
      if (!res.ok) {
        setLogos((prev) => prev.map((x) => (x.category === l.category && x.name === l.name ? { ...x, flagged: !next } : x)))
      }
    } catch {
      setLogos((prev) => prev.map((x) => (x.category === l.category && x.name === l.name ? { ...x, flagged: !next } : x)))
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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px' }}>
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
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted, background: colors.chip, borderRadius: 999, padding: '3px 10px' }}>{school.level}</span>
              </div>
              {(school.mascot || school.city) && (
                <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.muted }}>{[school.mascot, school.city].filter(Boolean).join(' · ')}</p>
              )}
            </header>

            {reviewKey && (
              <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 10, border: '1px solid #f0b429', background: '#fff8e6', color: '#7a5300', fontSize: 13.5, fontWeight: 600 }}>
                Review mode: click the X on any logo that is old and should be deleted. Marks save automatically. A manager confirms the deletions later.
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
              <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.muted }}>Logos</h2>
              {logos.length === 0 ? (
                <p style={{ fontSize: 14, color: colors.muted, fontStyle: 'italic' }}>No logos have been uploaded for this school yet.</p>
              ) : (
                grouped.map((group) => (
                  <div key={group.category} style={{ marginBottom: 22 }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>{group.category}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                      {group.items.map((l) => {
                        const preview = l.png || l.jpg
                        return (
                          <div key={`${group.category}-${l.name}`} style={{ position: 'relative', border: `1px solid ${l.flagged ? '#e0282e' : colors.border}`, borderRadius: 12, background: l.flagged ? '#fdecec' : colors.cardBg, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {reviewKey && (
                              <button type="button" onClick={() => toggleFlag(l)} title={l.flagged ? 'Unmark' : 'Mark as old'}
                                style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 30, height: 30, borderRadius: 999, border: `1px solid ${l.flagged ? '#e0282e' : colors.line}`, background: l.flagged ? '#e0282e' : '#ffffff', color: l.flagged ? '#ffffff' : colors.muted, fontSize: 15, fontWeight: 800, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                ✕
                              </button>
                            )}
                            <div style={{ height: 140, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: `1px solid ${colors.line}`, opacity: l.flagged ? 0.5 : 1 }}>
                              {preview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={preview} alt={l.name} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain' }} />
                              ) : (
                                <span style={{ fontSize: 12, color: colors.muted }}>No preview</span>
                              )}
                            </div>
                            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{l.name}</span>
                              {reviewKey && l.flagged && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#e0282e' }}>Marked for deletion</span>}
                              <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                                {l.png && <a href={l.png} style={dlBtn}>PNG</a>}
                                {l.jpg && <a href={l.jpg} style={dlBtn}>JPG</a>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
