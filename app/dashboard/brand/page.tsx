'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'
type LogoType = 'logo' | 'seal' | 'mascot'
type LogoColor = 'full' | 'white' | 'black'
type LogoOrientation = 'horizontal' | 'stacked' | 'icon'
type LogoFormat = 'png' | 'jpg'

type LogoEntry = {
  type: LogoType
  color: LogoColor
  orientation: LogoOrientation
  label: string | null
  png: string | null
  jpg: string | null
}

type BrandSchool = {
  code: string
  name: string
  mascot: string | null
  city: string | null
  level: BrandLevel
  preview: string | null
  logos: LogoEntry[]
}

type AddForm = { type: LogoType; color: LogoColor; orientation: LogoOrientation; label: string }

const LEVELS: ('All' | BrandLevel)[] = ['All', 'Elementary', 'Middle', 'High', 'Specialty']
const TYPES: LogoType[] = ['logo', 'seal', 'mascot']
const COLORS: LogoColor[] = ['full', 'white', 'black']
const ORIENTATIONS: LogoOrientation[] = ['horizontal', 'stacked', 'icon']
const DEFAULT_FORM: AddForm = { type: 'logo', color: 'full', orientation: 'horizontal', label: '' }

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }))
}

function titleCase(s: string): string {
  return s.split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function entryLabel(e: LogoEntry): string {
  if (e.label) return e.label
  const parts: string[] = [e.color, e.type]
  if (e.orientation !== 'horizontal') parts.push(e.orientation)
  return titleCase(parts.join(' '))
}

export default function ManagerBrandPage() {
  const router = useRouter()
  const [access, setAccess] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [schools, setSchools] = useState<BrandSchool[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<'All' | BrandLevel>('All')
  const [busy, setBusy] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, AddForm>>({})
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/team', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (String(d?.team?.role || '').toLowerCase() === 'manager') setAccess('ok')
        else { setAccess('denied'); router.replace('/dashboard') }
      })
      .catch(() => { if (!cancelled) { setAccess('denied'); router.replace('/dashboard') } })
    return () => { cancelled = true }
  }, [router])

  const loadCatalog = useCallback(async () => {
    const res = await fetch('/api/brand', { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    if (Array.isArray(d?.schools)) setSchools(d.schools as BrandSchool[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (access !== 'ok') return
    loadCatalog()
  }, [access, loadCatalog])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schools.filter((s) => {
      if (level !== 'All' && s.level !== level) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || (s.mascot || '').toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q)
    })
  }, [schools, query, level])

  const formFor = (code: string): AddForm => forms[code] || DEFAULT_FORM
  const setForm = (code: string, patch: Partial<AddForm>) =>
    setForms((prev) => ({ ...prev, [code]: { ...(prev[code] || DEFAULT_FORM), ...patch } }))

  const onAddFile = async (code: string, file: File | null) => {
    if (!file) return
    const f = formFor(code)
    const key = `${code}-add`
    setBusy(key)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('code', code)
      body.append('type', f.type)
      body.append('color', f.color)
      body.append('orientation', f.orientation)
      if (f.label.trim()) body.append('label', f.label.trim())
      const res = await fetch('/api/brand/upload', { method: 'POST', body })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Upload failed', 'error')
      else { notify('Logo uploaded', 'success'); await loadCatalog() }
    } catch {
      notify('Upload failed', 'error')
    } finally {
      setBusy(null)
      const input = fileInputs.current[code]
      if (input) input.value = ''
    }
  }

  const onDelete = async (s: BrandSchool, e: LogoEntry, format: LogoFormat) => {
    if (!window.confirm(`Remove the ${format.toUpperCase()} for "${entryLabel(e)}" at ${s.name}?`)) return
    const key = `${s.code}-${e.type}-${e.color}-${e.orientation}-${format}`
    setBusy(key)
    try {
      const qs = new URLSearchParams({ code: s.code, type: e.type, color: e.color, orientation: e.orientation, format })
      const res = await fetch(`/api/brand/upload?${qs.toString()}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Delete failed', 'error')
      else { notify('Logo removed', 'success'); await loadCatalog() }
    } catch {
      notify('Delete failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (access !== 'ok') {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Checking access...</div>
  }

  const card: CSSProperties = { border: '1px solid var(--border-subtle)', borderRadius: 14, background: 'var(--surface-2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
  const selectStyle: CSSProperties = { flex: 1, minWidth: 0, height: 32, borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: 12, padding: '0 6px' }
  const tabBtn = (on: boolean): CSSProperties => ({ padding: '6px 14px', borderRadius: 999, border: `1px solid ${on ? '#185fa5' : 'var(--border-subtle)'}`, background: on ? '#185fa5' : 'transparent', color: on ? '#ffffff' : 'var(--text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer' })

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '20px 16px 56px', color: 'var(--text-primary)' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Brand library</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
          Upload, replace, and remove official school logos (PNG and JPG). Colors are managed in Settings under Schools and locations.
        </p>
      </header>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by school, mascot, or city"
        style={{ width: '100%', height: 42, border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '0 14px', fontSize: 15, color: 'var(--text-primary)', background: 'var(--surface-2)', outline: 'none', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 16px' }}>
        {LEVELS.map((lv) => (
          <button key={lv} type="button" onClick={() => setLevel(lv)} style={tabBtn(lv === level)}>{lv}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Loading the catalog...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>No schools match your search.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map((s) => {
            const f = formFor(s.code)
            const addBusy = busy === `${s.code}-add`
            return (
              <div key={s.code} style={card}>
                <div style={{ padding: '14px 16px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{s.name}</h2>
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', borderRadius: 999, padding: '2px 8px' }}>{s.level}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>
                    code {s.code}{(s.mascot || s.city) ? ` · ${[s.mascot, s.city].filter(Boolean).join(' · ')}` : ''}
                  </p>
                </div>

                <div style={{ padding: '0 16px' }}>
                  <div style={{ height: 100, borderRadius: 10, border: '1px solid var(--border-subtle)', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {s.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.preview} alt={`${s.name} logo`} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: 13, color: '#6b7280' }}>No logos yet</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 16px 0' }}>
                  {s.logos.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>No logos uploaded yet.</p>
                  ) : (
                    s.logos.map((e) => (
                      <div key={`${e.type}-${e.color}-${e.orientation}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entryLabel(e)}</span>
                        {(['png', 'jpg'] as LogoFormat[]).map((fmt) => {
                          const url = e[fmt]
                          if (!url) return null
                          const delBusy = busy === `${s.code}-${e.type}-${e.color}-${e.orientation}-${fmt}`
                          return (
                            <span key={fmt} style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
                              <a href={url} target="_blank" rel="noreferrer" style={{ padding: '3px 7px', fontSize: 11, fontWeight: 700, color: '#185fa5', textDecoration: 'none' }}>{fmt.toUpperCase()}</a>
                              <button type="button" disabled={delBusy} onClick={() => onDelete(s, e, fmt)} title="Delete" style={{ padding: '3px 7px', fontSize: 12, fontWeight: 700, color: '#b42318', background: 'transparent', border: 'none', borderLeft: '1px solid var(--border-subtle)', cursor: delBusy ? 'default' : 'pointer', opacity: delBusy ? 0.5 : 1 }}>✕</button>
                            </span>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: 'auto', padding: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Add a logo</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={f.type} onChange={(ev) => setForm(s.code, { type: ev.target.value as LogoType })} style={selectStyle}>
                      {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                    </select>
                    <select value={f.color} onChange={(ev) => setForm(s.code, { color: ev.target.value as LogoColor })} style={selectStyle}>
                      {COLORS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                    </select>
                    <select value={f.orientation} onChange={(ev) => setForm(s.code, { orientation: ev.target.value as LogoOrientation })} style={selectStyle}>
                      {ORIENTATIONS.map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}
                    </select>
                  </div>
                  <input
                    value={f.label}
                    onChange={(ev) => setForm(s.code, { label: ev.target.value })}
                    placeholder="Optional label override"
                    style={{ height: 32, borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: 12, padding: '0 8px' }}
                  />
                  <input
                    ref={(el) => { fileInputs.current[s.code] = el }}
                    type="file"
                    accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                    style={{ display: 'none' }}
                    onChange={(ev) => onAddFile(s.code, ev.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    disabled={addBusy}
                    onClick={() => fileInputs.current[s.code]?.click()}
                    style={{ height: 34, borderRadius: 8, border: '1px solid #185fa5', background: '#185fa5', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: addBusy ? 'default' : 'pointer', opacity: addBusy ? 0.6 : 1 }}
                  >
                    {addBusy ? 'Uploading...' : 'Choose PNG or JPG'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
