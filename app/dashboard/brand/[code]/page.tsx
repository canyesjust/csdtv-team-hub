'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

function detectFormat(file: File): 'png' | 'jpg' | null {
  const t = (file.type || '').toLowerCase()
  if (t === 'image/png') return 'png'
  if (t === 'image/jpeg') return 'jpg'
  const n = file.name.toLowerCase()
  if (n.endsWith('.png')) return 'png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg'
  return null
}

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'
type LogoFormat = 'png' | 'jpg'
type Logo = { category: string; name: string; png: string | null; jpg: string | null }
type School = {
  code: string
  name: string
  mascot: string | null
  city: string | null
  level: BrandLevel
}

const CATEGORY_PRESETS = ['Official', 'Team/Sport', 'Specific', 'Other']
const CATEGORY_ORDER = CATEGORY_PRESETS

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }))
}

function orderCategories(cats: string[]): string[] {
  const present = Array.from(new Set(cats))
  const known = CATEGORY_ORDER.filter((c) => present.includes(c))
  const extra = present.filter((c) => !CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b))
  return [...known, ...extra]
}

export default function ManageSchoolBrandPage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const code = String(params?.code || '')

  const [access, setAccess] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [school, setSchool] = useState<School | null>(null)
  const [logos, setLogos] = useState<Logo[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [category, setCategory] = useState('Official')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

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

  const loadDetail = useCallback(async () => {
    if (!code) return
    const res = await fetch(`/api/brand/${encodeURIComponent(code)}`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    if (d?.school) { setSchool(d.school as School); setLogos(Array.isArray(d.logos) ? (d.logos as Logo[]) : []) }
    else setNotFound(true)
    setLoading(false)
  }, [code])

  useEffect(() => {
    if (access !== 'ok') return
    loadDetail()
  }, [access, loadDetail])

  const existingCategories = useMemo(() => orderCategories([...CATEGORY_PRESETS, ...logos.map((l) => l.category)]), [logos])
  const grouped = useMemo(() => {
    const map = new Map<string, Logo[]>()
    for (const l of logos) {
      if (!map.has(l.category)) map.set(l.category, [])
      map.get(l.category)!.push(l)
    }
    return orderCategories([...map.keys()]).map((cat) => ({ category: cat, items: map.get(cat) || [] }))
  }, [logos])

  const triggerUpload = () => {
    if (!category.trim()) { notify('Pick or type a category first', 'error'); return }
    if (!name.trim()) { notify('Give the logo a name first', 'error'); return }
    fileRef.current?.click()
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    const format = detectFormat(file)
    if (!format) { notify('File must be a PNG or JPG', 'error'); if (fileRef.current) fileRef.current.value = ''; return }
    if (file.size > MAX_BYTES) { notify('File is larger than 20 MB', 'error'); if (fileRef.current) fileRef.current.value = ''; return }
    setBusy('add')
    try {
      // 1. Ask the server for a signed upload URL.
      const signRes = await fetch('/api/brand/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, category: category.trim(), name: name.trim(), format }),
      })
      const sign = await signRes.json().catch(() => ({}))
      if (!signRes.ok) { notify(typeof sign?.error === 'string' ? sign.error : 'Upload failed', 'error'); return }

      // 2. Upload the file directly to storage (no serverless body-size limit).
      const supabase = createClient()
      const contentType = format === 'png' ? 'image/png' : 'image/jpeg'
      const { error: upErr } = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType })
      if (upErr) { notify(upErr.message || 'Upload failed', 'error'); return }

      // 3. Record (or replace) the logo row.
      const finRes = await fetch('/api/brand/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, category: category.trim(), name: name.trim(), format, path: sign.path }),
      })
      const fin = await finRes.json().catch(() => ({}))
      if (!finRes.ok) { notify(typeof fin?.error === 'string' ? fin.error : 'Could not save logo', 'error'); return }
      notify('Logo uploaded', 'success'); setName(''); await loadDetail()
    } catch {
      notify('Upload failed', 'error')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onDelete = async (l: Logo, format: LogoFormat) => {
    if (!window.confirm(`Remove the ${format.toUpperCase()} for "${l.name}"?`)) return
    const key = `${l.category}-${l.name}-${format}`
    setBusy(key)
    try {
      const qs = new URLSearchParams({ code, category: l.category, name: l.name, format })
      const res = await fetch(`/api/brand/upload?${qs.toString()}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Delete failed', 'error')
      else { notify('Logo removed', 'success'); await loadDetail() }
    } catch {
      notify('Delete failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (access !== 'ok') return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Checking access...</div>

  const input: CSSProperties = { height: 36, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: 13, padding: '0 10px', boxSizing: 'border-box' }
  const addBusy = busy === 'add'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 56px', color: 'var(--text-primary)' }}>
      <Link href="/dashboard/brand" style={{ fontSize: 13, fontWeight: 700, color: '#185fa5', textDecoration: 'none' }}>{'←'} All schools</Link>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Loading...</p>
      ) : notFound || !school ? (
        <p style={{ color: '#b42318', padding: '40px 0', textAlign: 'center' }}>School not found.</p>
      ) : (
        <>
          <header style={{ margin: '14px 0 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{school.name}</h1>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', borderRadius: 999, padding: '3px 10px' }}>{school.level}</span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>
              code {school.code}{(school.mascot || school.city) ? ` · ${[school.mascot, school.city].filter(Boolean).join(' · ')}` : ''}
            </p>
          </header>

          <section style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--surface-2)', padding: 16, marginBottom: 24 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Add a logo</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(200px, 2fr) auto', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Category</span>
                <input list="brand-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Official" style={input} />
                <datalist id="brand-categories">
                  {existingCategories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Logo name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Primary wordmark, white" style={input} />
              </label>
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0] || null)} />
              <button type="button" disabled={addBusy} onClick={triggerUpload} style={{ height: 36, borderRadius: 8, border: '1px solid #185fa5', background: '#185fa5', color: '#fff', fontSize: 13, fontWeight: 700, padding: '0 16px', cursor: addBusy ? 'default' : 'pointer', opacity: addBusy ? 0.6 : 1 }}>
                {addBusy ? 'Uploading...' : 'Choose PNG or JPG'}
              </button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
              Re-uploading the same category, name, and format replaces the existing file. Upload PNG and JPG separately to offer both.
            </p>
          </section>

          {logos.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>No logos yet. Add the first one above.</p>
          ) : (
            grouped.map((group) => (
              <div key={group.category} style={{ marginBottom: 22 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>{group.category}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                  {group.items.map((l) => {
                    const preview = l.png || l.jpg
                    return (
                      <div key={`${group.category}-${l.name}`} style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--surface-2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ height: 130, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: '1px solid var(--border-subtle)' }}>
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview} alt={l.name} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No preview</span>
                          )}
                        </div>
                        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{l.name}</span>
                          <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
                            {(['png', 'jpg'] as LogoFormat[]).map((fmt) => {
                              const url = l[fmt]
                              if (!url) return null
                              const delBusy = busy === `${l.category}-${l.name}-${fmt}`
                              return (
                                <span key={fmt} style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-subtle)', borderRadius: 7, overflow: 'hidden' }}>
                                  <a href={url} target="_blank" rel="noreferrer" style={{ padding: '4px 9px', fontSize: 11.5, fontWeight: 700, color: '#185fa5', textDecoration: 'none' }}>{fmt.toUpperCase()}</a>
                                  <button type="button" disabled={delBusy} onClick={() => onDelete(l, fmt)} title="Delete" style={{ padding: '4px 8px', fontSize: 12, fontWeight: 700, color: '#b42318', background: 'transparent', border: 'none', borderLeft: '1px solid var(--border-subtle)', cursor: delBusy ? 'default' : 'pointer', opacity: delBusy ? 0.5 : 1 }}>✕</button>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
