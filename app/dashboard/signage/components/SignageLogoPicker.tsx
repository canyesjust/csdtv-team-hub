'use client'

// Pick a location's logo from the official marks already stored in the system
// (the school_logos library) instead of pasting a URL. Tiles sit on a dark chip
// so white/reversed marks — the ones that read on the Zoned 2 dark panels — are
// visible. Shows the district + CSDtv marks plus the site's own school, if linked.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { useSignageAdminStyles } from './SignageAdmin'

const LOGO_BUCKET = 'school-logos'
const DISTRICT_CODE = '021'
const CSDTV_CODE = '099'

type LogoRow = { school_code: string; name: string | null; storage_path: string; sort_order: number | null; flagged_for_deletion: boolean | null }
type Logo = { url: string; name: string; code: string }

export default function SignageLogoPicker({ value, onChange, schoolCode }: { value: string | null; onChange: (url: string | null) => void; schoolCode?: string | null }) {
  const supabase = useMemo(() => createClient(), [])
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const [open, setOpen] = useState(false)
  const [logos, setLogos] = useState<Logo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const codes = [...new Set([DISTRICT_CODE, CSDTV_CODE, ...(schoolCode ? [schoolCode] : [])])]
      const { data } = await supabase
        .from('school_logos')
        .select('school_code, name, storage_path, sort_order, flagged_for_deletion')
        .in('school_code', codes)
        .order('school_code', { ascending: true })
        .order('sort_order', { ascending: true })
      if (cancelled) return
      const rows = ((data || []) as LogoRow[]).filter(r => !r.flagged_for_deletion)
      setLogos(rows.map(r => ({
        url: supabase.storage.from(LOGO_BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
        name: r.name || 'Logo',
        code: r.school_code,
      })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, supabase, schoolCode])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {value ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0b1b2b', borderRadius: 8, padding: '6px 10px', border: `1px solid ${s.border}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" style={{ height: 36, maxWidth: 170, objectFit: 'contain' }} onError={e => { e.currentTarget.style.opacity = '0.3' }} />
          </div>
        ) : (
          <span style={{ fontSize: 13, color: s.muted }}>No logo chosen</span>
        )}
        <button type="button" onClick={() => setOpen(true)} style={s.btn}>{value ? 'Change logo' : 'Choose logo'}</button>
        {value && <button type="button" onClick={() => onChange(null)} style={{ ...s.btn, color: '#ef4444', borderColor: '#ef4444' }}>Clear</button>}
      </div>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,8,18,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: s.cardBg, border: `1px solid ${s.border}`, borderRadius: 14, padding: 18, width: 'min(760px, 100%)', maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={s.h3}>Choose an official logo</h3>
              <button type="button" onClick={() => setOpen(false)} style={s.btn}>Close</button>
            </div>
            {loading ? (
              <div style={{ color: s.muted, padding: 16 }}>Loading logos…</div>
            ) : logos.length === 0 ? (
              <div style={{ color: s.muted, padding: 16 }}>No official marks found for this location.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {logos.map((lg, i) => (
                  <button
                    key={`${lg.url}-${i}`}
                    type="button"
                    onClick={() => { onChange(lg.url); setOpen(false) }}
                    style={{ background: '#0b1b2b', border: `2px solid ${value === lg.url ? '#2a7fb8' : s.border}`, borderRadius: 10, padding: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                    title={lg.name}
                  >
                    <div style={{ height: 66, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={lg.url} alt="" style={{ maxHeight: 66, maxWidth: '100%', objectFit: 'contain' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                    </div>
                    <span style={{ fontSize: 10.5, color: '#cdd8ea', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{lg.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
