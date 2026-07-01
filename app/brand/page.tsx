'use client'

import { useEffect, useMemo, useState, type CSSProperties, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useBrandEmbed, brandQuery } from './useBrandEmbed'

// If a CDN-resized preview fails (e.g. the source image is too large for the transform
// service), fall back to the original file once so the card still shows a logo.
function onThumbError(e: SyntheticEvent<HTMLImageElement>, fallback: string | null) {
  const img = e.currentTarget
  if (img.dataset.fellBack || !fallback || img.src === fallback) return
  img.dataset.fellBack = '1'
  img.src = fallback
}

const CHECKER: CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg,#dfe3e8 25%,transparent 25%),linear-gradient(-45deg,#dfe3e8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dfe3e8 75%),linear-gradient(-45deg,transparent 75%,#dfe3e8 75%)',
  backgroundSize: '18px 18px',
  backgroundPosition: '0 0,0 9px,9px -9px,-9px 0',
}

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'

type BrandSchoolSummary = {
  code: string
  name: string
  shortName: string | null
  mascot: string | null
  city: string | null
  level: BrandLevel
  colors: { primary: string | null; secondary: string | null; accent: string | null; text: string | null }
  preview: string | null
  previewRaw: string | null
  logoCount: number
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

const LEVELS: ('All' | BrandLevel)[] = ['All', 'Elementary', 'Middle', 'High', 'Specialty']

function initialOf(name: string): string {
  const t = name.trim()
  return t ? t[0].toUpperCase() : '?'
}

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

export default function BrandLibraryPage() {
  const [schools, setSchools] = useState<BrandSchoolSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<'All' | BrandLevel>('All')
  const [copied, setCopied] = useState<string | null>(null)
  const [reviewKey, setReviewKey] = useState<string | null>(null)
  const [district, setDistrict] = useState<BrandSchoolSummary | null>(null)
  const embed = useBrandEmbed()
  const linkQuery = brandQuery(reviewKey, embed)

  useEffect(() => {
    // Read after mount so server and client first render match (no hydration mismatch).
    // Persist the review key for the tab so review mode survives navigation even when a
    // link does not carry the ?review= param.
    const fromUrl = new URLSearchParams(window.location.search).get('review')
    let key = fromUrl
    try {
      if (fromUrl) sessionStorage.setItem('brandReviewKey', fromUrl)
      else key = sessionStorage.getItem('brandReviewKey')
    } catch { /* sessionStorage unavailable */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewKey(key)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/brand', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d?.schools)) setSchools(d.schools as BrandSchoolSummary[])
        else setLoadError(typeof d?.error === 'string' ? d.error : 'Could not load the brand library.')
        setDistrict(d?.district ?? null)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setLoadError('Could not load the brand library.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schools.filter((s) => {
      if (level !== 'All' && s.level !== level) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || (s.mascot || '').toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q)
    })
  }, [schools, query, level])

  const copyHex = async (key: string, hex: string) => {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
    } catch {
      // ignore
    }
  }

  const swatch = (s: BrandSchoolSummary, slot: 'primary' | 'secondary' | 'accent' | 'text') => {
    const hex = s.colors[slot]
    if (!hex) return null
    const key = `${s.code}-${slot}`
    return (
      <button
        key={slot}
        type="button"
        onClick={() => copyHex(key, hex)}
        title={`Copy ${hex}`}
        style={{ flex: '1 1 0', minWidth: 0, height: 26, borderRadius: 6, border: `1px solid ${colors.line}`, background: hex, color: readableOn(hex), fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
      >
        {copied === key ? 'Copied' : hex}
      </button>
    )
  }

  return (
    <div style={{ background: embed ? 'transparent' : colors.bg, minHeight: embed ? undefined : '100vh', color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 1840, margin: '0 auto', padding: embed ? '8px 12px 24px' : '28px 24px 72px' }}>
        {!embed && (
          <header style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
            {district?.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={district.preview} alt="Canyons School District" onError={(e) => onThumbError(e, district.previewRaw)} style={{ height: 52, width: 'auto', maxWidth: 120, objectFit: 'contain', flexShrink: 0 }} />
            )}
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15 }}>Canyons School District Brand Library</h1>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.muted }}>Pick a school to view and download its logos. Click a color to copy its hex code.</p>
            </div>
          </header>
        )}

        {reviewKey && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, border: '1px solid #f0b429', background: '#fff8e6', color: '#7a5300', fontSize: 13.5, fontWeight: 600 }}>
            Review mode: open a school, then click any logo that is old and should be deleted (click again to undo). Marks save automatically for a manager to review.
          </div>
        )}

        {district && (
          <Link href={`/brand/${district.code}${linkQuery}`} style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none', color: 'inherit', border: `1px solid ${colors.border}`, borderRadius: 14, background: colors.cardBg, padding: '14px 18px', marginBottom: 18 }}>
            <div style={{ width: 110, height: 70, ...CHECKER, borderRadius: 10, border: `1px solid ${colors.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {district.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={district.preview} alt="" onError={(e) => onThumbError(e, district.previewRaw)} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 16, fontWeight: 800, color: colors.muted }}>CSD</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 800 }}>{district.name}</div>
              <div style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>District logos, colors, and departments</div>
            </div>
            <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: colors.info }}>View district {'→'}</span>
          </Link>
        )}

        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: colors.bg, paddingTop: 8, paddingBottom: 12, marginBottom: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by school, mascot, or city"
            style={{ width: '100%', height: 42, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '0 14px', fontSize: 15, color: colors.text, background: colors.cardBg, outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {LEVELS.map((lv) => {
              const on = lv === level
              return (
                <button key={lv} type="button" onClick={() => setLevel(lv)} style={{ padding: '6px 14px', borderRadius: 999, border: `1px solid ${on ? colors.info : colors.line}`, background: on ? colors.info : colors.cardBg, color: on ? '#ffffff' : colors.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {lv}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <p style={{ color: colors.muted, fontSize: 15, padding: '40px 0', textAlign: 'center' }}>Loading the brand library...</p>
        ) : loadError ? (
          <p style={{ color: '#b42318', fontSize: 15, padding: '40px 0', textAlign: 'center' }}>{loadError}</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: colors.muted, fontSize: 15, padding: '40px 0', textAlign: 'center' }}>No schools match your search.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {filtered.map((s) => {
              const swatches = [swatch(s, 'primary'), swatch(s, 'secondary'), swatch(s, 'accent'), swatch(s, 'text')].filter(Boolean)
              return (
                <div key={s.code} style={{ border: `1px solid ${colors.border}`, borderRadius: 14, background: colors.cardBg, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Link href={`/brand/${s.code}${linkQuery}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ position: 'relative', height: 210, ...(s.preview ? CHECKER : { background: s.colors.primary || '#334155' }), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: `1px solid ${colors.line}` }}>
                      <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700, color: '#ffffff', background: 'rgba(20,30,50,0.78)', borderRadius: 999, padding: '2px 9px' }}>
                        {s.logoCount} {s.logoCount === 1 ? 'logo' : 'logos'}
                      </span>
                      {s.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.preview} alt={`${s.name} logo`} loading="lazy" decoding="async" onError={(e) => onThumbError(e, s.previewRaw)} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: 46, fontWeight: 800, color: readableOn(s.colors.primary) }}>{initialOf(s.name)}</span>
                      )}
                    </div>
                    <div style={{ padding: '12px 14px 6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, lineHeight: 1.2 }}>{s.name}</h2>
                        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: colors.muted, background: colors.chip, borderRadius: 999, padding: '2px 8px' }}>{s.level}</span>
                      </div>
                      {(s.mascot || s.city) && (
                        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: colors.muted }}>{[s.mascot, s.city].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  </Link>

                  {swatches.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, padding: '6px 14px 0' }}>{swatches}</div>
                  )}

                  <div style={{ marginTop: 'auto', padding: 14 }}>
                    <Link href={`/brand/${s.code}${linkQuery}`} style={{ display: 'block', textAlign: 'center', padding: '8px', borderRadius: 8, border: `1px solid ${colors.line}`, color: colors.info, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      {s.logoCount > 0 ? `View ${s.logoCount} logo${s.logoCount === 1 ? '' : 's'}` : 'View school'}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
