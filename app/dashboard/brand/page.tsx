'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'
type Format = 'jpg' | 'png' | 'eps'

type BrandSchool = {
  code: string
  name: string
  shortName: string | null
  mascot: string | null
  city: string | null
  level: BrandLevel
  colors: {
    primary: string | null
    secondary: string | null
    accent: string | null
    text: string | null
  }
  logos: {
    jpg: string | null
    png: string | null
    eps: string | null
  }
}

const LEVELS: ('All' | BrandLevel)[] = ['All', 'Elementary', 'Middle', 'High', 'Specialty']
const FORMATS: Format[] = ['jpg', 'png', 'eps']
const ACCEPT: Record<Format, string> = {
  jpg: '.jpg,.jpeg,image/jpeg',
  png: '.png,image/png',
  eps: '.eps,application/postscript',
}

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }))
}

export default function ManagerBrandPage() {
  const router = useRouter()
  const [access, setAccess] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [schools, setSchools] = useState<BrandSchool[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<'All' | BrandLevel>('All')
  const [busy, setBusy] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/team', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const role = String(d?.team?.role || '').toLowerCase()
        if (role === 'manager') setAccess('ok')
        else { setAccess('denied'); router.replace('/dashboard') }
      })
      .catch(() => {
        if (cancelled) return
        setAccess('denied'); router.replace('/dashboard')
      })
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
      return (
        s.name.toLowerCase().includes(q) ||
        (s.mascot || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q)
      )
    })
  }, [schools, query, level])

  const onPickFile = async (code: string, format: Format, file: File | null) => {
    if (!file) return
    const key = `${code}-${format}`
    setBusy(key)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('code', code)
      form.append('format', format)
      const res = await fetch('/api/brand/upload', { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        notify(typeof d?.error === 'string' ? d.error : 'Upload failed', 'error')
      } else {
        notify(`${format.toUpperCase()} uploaded`, 'success')
        await loadCatalog()
      }
    } catch {
      notify('Upload failed', 'error')
    } finally {
      setBusy(null)
      const input = fileInputs.current[key]
      if (input) input.value = ''
    }
  }

  const onDelete = async (code: string, format: Format, name: string) => {
    if (!window.confirm(`Remove the ${format.toUpperCase()} logo for ${name}?`)) return
    const key = `${code}-${format}`
    setBusy(key)
    try {
      const res = await fetch(`/api/brand/upload?code=${encodeURIComponent(code)}&format=${format}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Delete failed', 'error')
      else { notify(`${format.toUpperCase()} removed`, 'success'); await loadCatalog() }
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
  const tabBtn = (on: boolean): CSSProperties => ({
    padding: '6px 14px', borderRadius: 999,
    border: `1px solid ${on ? 'var(--accent, #185fa5)' : 'var(--border-subtle)'}`,
    background: on ? 'var(--accent, #185fa5)' : 'transparent',
    color: on ? '#ffffff' : 'var(--text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '20px 16px 56px', color: 'var(--text-primary)' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Brand library</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
          Upload, replace, and remove official school logos. Colors are managed in Settings under Schools and locations.
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map((s) => {
            const preview = s.logos.png || s.logos.jpg
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
                  <div style={{ height: 110, borderRadius: 10, border: '1px solid var(--border-subtle)', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt={`${s.name} logo`} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: 13, color: '#6b7280' }}>No preview</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, marginTop: 'auto' }}>
                  {FORMATS.map((fmt) => {
                    const key = `${s.code}-${fmt}`
                    const url = s.logos[fmt]
                    const isBusy = busy === key
                    return (
                      <div key={fmt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 40, fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{fmt.toUpperCase()}</span>
                        <span style={{ flex: 1, fontSize: 12, color: url ? '#1f9254' : 'var(--text-muted)', fontWeight: 600 }}>
                          {url ? 'Uploaded' : 'Missing'}
                        </span>
                        <input
                          ref={(el) => { fileInputs.current[key] = el }}
                          type="file"
                          accept={ACCEPT[fmt]}
                          style={{ display: 'none' }}
                          onChange={(e) => onPickFile(s.code, fmt, e.target.files?.[0] || null)}
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => fileInputs.current[key]?.click()}
                          style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.5 : 1 }}
                        >
                          {isBusy ? '...' : url ? 'Replace' : 'Upload'}
                        </button>
                        {url && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onDelete(s.code, fmt, s.name)}
                            style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'transparent', color: '#b42318', fontSize: 12, fontWeight: 700, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.5 : 1 }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
