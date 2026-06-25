'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Colors = { primary: string | null; secondary: string | null; accent: string | null; text: string | null }
type Fonts = { heading: string | null; body: string | null; notes: string | null }
type Logo = { category: string; name: string; png: string | null; jpg: string | null; svg?: string | null }
type School = {
  code: string
  name: string
  type?: string
  mascot: string | null
  city: string | null
  colors: Colors
  fonts?: Fonts
}

const c = { text: '#1a1f36', muted: '#6b7280', line: '#d3d6dd', border: 'rgba(0,0,0,0.12)', accent: '#185fa5' }

function hexToRgb(hex: string): string | null {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  const r = parseInt(f.slice(0, 2), 16)
  const g = parseInt(f.slice(2, 4), 16)
  const b = parseInt(f.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  return `${r}, ${g}, ${b}`
}

export default function BrandGuidePage() {
  const params = useParams<{ code: string }>()
  const code = String(params?.code || '')
  const [school, setSchool] = useState<School | null>(null)
  const [logos, setLogos] = useState<Logo[]>([])
  const [districtLogo, setDistrictLogo] = useState<string | null>(null)
  const [meta, setMeta] = useState({ date: '', url: '' })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeta({ date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), url: `${window.location.origin}/brand/${code}` })
  }, [code])

  useEffect(() => {
    if (!code) return
    let cancelled = false
    fetch(`/api/brand/${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d?.school) { setSchool(d.school as School); setLogos(Array.isArray(d.logos) ? (d.logos as Logo[]) : []) }
        else setErr(typeof d?.error === 'string' ? d.error : 'Not found')
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setErr('Could not load this brand guide.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [code])

  useEffect(() => {
    let cancelled = false
    fetch('/api/brand', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.district?.preview) setDistrictLogo(d.district.preview as string) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const official = useMemo(() => logos.filter((l) => l.category.trim().toLowerCase() === 'official'), [logos])
  const fonts = school?.fonts
  const hasFonts = Boolean(fonts && (fonts.heading || fonts.body || fonts.notes))
  const colorList = useMemo<[string, string][]>(() => {
    if (!school) return []
    return ([['Primary', school.colors.primary], ['Secondary', school.colors.secondary], ['Accent', school.colors.accent], ['Text', school.colors.text]] as [string, string | null][])
      .filter((x): x is [string, string] => Boolean(x[1]))
  }, [school])

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', color: c.text, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #ffffff; }
          @page { size: letter; margin: 0.5in; }
        }
        .print-color { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .bg-card { break-inside: avoid; }
      `}</style>

      <div style={{ maxWidth: '7.5in', margin: '0 auto', padding: '24px' }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Link href={`/brand/${code}`} style={{ fontSize: 13, fontWeight: 700, color: c.accent, textDecoration: 'none' }}>{'←'} Back to school</Link>
          <button type="button" onClick={() => window.print()} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${c.accent}`, background: c.accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Print / Save as PDF</button>
        </div>

        {loading ? (
          <p style={{ color: c.muted, padding: '40px 0', textAlign: 'center' }}>Loading...</p>
        ) : err || !school ? (
          <p style={{ color: '#b42318', padding: '40px 0', textAlign: 'center' }}>{err || 'Not found'}</p>
        ) : (
          <>
            <header style={{ borderBottom: `2px solid ${c.text}`, paddingBottom: 14, marginBottom: 22 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>Brand Guide</p>
              <h1 style={{ margin: '6px 0 0', fontSize: 30, fontWeight: 800, lineHeight: 1.05 }}>{school.name}</h1>
              {(school.mascot || school.city) && (
                <p style={{ margin: '6px 0 0', fontSize: 14, color: c.muted }}>{[school.mascot, school.city].filter(Boolean).join(' · ')}</p>
              )}
            </header>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.muted }}>Official Colors</h2>
              {colorList.length === 0 ? (
                <p style={{ fontSize: 14, color: c.muted, fontStyle: 'italic' }}>No brand colors on file.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                  {colorList.map(([label, hex]) => {
                    const rgb = hexToRgb(hex)
                    return (
                      <div key={label} className="bg-card" style={{ border: `1px solid ${c.border}`, borderRadius: 8, overflow: 'hidden' }}>
                        <div className="print-color" style={{ height: 64, background: hex }} />
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                          <div style={{ fontSize: 12, color: c.muted, fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>{hex.toUpperCase()}</div>
                          {rgb && <div style={{ fontSize: 12, color: c.muted, fontFamily: 'ui-monospace, monospace' }}>RGB {rgb}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {hasFonts && (
              <section style={{ marginBottom: 28 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.muted }}>Typography</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {fonts?.heading && (
                    <div className="bg-card" style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: c.muted }}>Headings</div>
                      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, margin: '6px 0 4px', fontFamily: `'${fonts.heading}', sans-serif` }}>Aa Bb Cc</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{fonts.heading}</div>
                    </div>
                  )}
                  {fonts?.body && (
                    <div className="bg-card" style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: c.muted }}>Body</div>
                      <div style={{ fontSize: 15, lineHeight: 1.4, margin: '6px 0 4px', fontFamily: `'${fonts.body}', sans-serif` }}>The quick brown fox jumps over the lazy dog.</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{fonts.body}</div>
                    </div>
                  )}
                </div>
                {fonts?.notes && (
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, color: c.muted, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{fonts.notes}</p>
                )}
              </section>
            )}

            <section>
              <h2 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.muted }}>Official Logos</h2>
              {official.length === 0 ? (
                <p style={{ fontSize: 14, color: c.muted, fontStyle: 'italic' }}>No logos are filed under the Official category yet.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                  {official.map((l) => {
                    const src = l.svg || l.png || l.jpg
                    return (
                      <div key={l.name} className="bg-card" style={{ border: `1px solid ${c.border}`, borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ height: 120, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, borderBottom: `1px solid ${c.line}` }}>
                          {src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={src} alt={l.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ fontSize: 12, color: c.muted }}>No preview</span>
                          )}
                        </div>
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.25 }}>{l.name}</div>
                          <div style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }}>{[l.svg ? 'SVG' : null, l.png ? 'PNG' : null, l.jpg ? 'JPG' : null].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <footer style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${c.text}`, display: 'flex', alignItems: 'center', gap: 16 }}>
              {districtLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={districtLogo} alt="Canyons School District" style={{ height: 46, width: 'auto', maxWidth: 120, objectFit: 'contain', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: c.muted, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: c.text }}>Canyons School District</div>
                <div>Use official colors and logos as shown; do not recolor, stretch, or alter the marks.</div>
                <div style={{ marginTop: 2 }}>
                  {meta.date ? `Generated ${meta.date}` : ''}{meta.url ? ` · ${meta.url}` : ''}
                </div>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
