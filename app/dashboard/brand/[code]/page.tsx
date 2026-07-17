'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  CATEGORY_ORDER,
  CONTENT_TYPE,
  DocBadge as SharedDocBadge,
  EpsBadge as SharedEpsBadge,
  MAX_BRAND_UPLOAD_BYTES as MAX_BYTES,
  PALETTE_COLOR_SLOTS,
  detectFormat,
  deriveLogoName,
  formatBytes,
  orderCategories,
  previewBg,
  toColorInputValue,
  type LogoFormat,
  type PreviewBg,
} from '@/lib/brand-utils'

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'
type Fonts = { heading: string | null; body: string | null; notes: string | null }
type Colors = { primary: string | null; secondary: string | null; accent: string | null; text: string | null }
type Palette = { id: string; name: string; colors: (string | null)[] }
type Logo = { category: string; name: string; png: string | null; jpg: string | null; svg?: string | null; docx?: string | null; eps?: string | null; cover?: boolean; notes?: string | null }
type School = {
  code: string
  name: string
  mascot: string | null
  city: string | null
  level: BrandLevel
  fonts?: Fonts
  colors?: Colors
  palettes?: Palette[]
}

const CATEGORY_PRESETS = CATEGORY_ORDER

// Manager pages render on the dashboard theme, so the badge label uses the CSS var.
function DocBadge() {
  return <SharedDocBadge compact muted="var(--text-muted)" />
}

function EpsBadge() {
  return <SharedEpsBadge compact muted="var(--text-muted)" />
}

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }))
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
  const [bg, setBg] = useState<PreviewBg>('check')
  const [editing, setEditing] = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState('')
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editCustom, setEditCustom] = useState(false)
  const [selected, setSelected] = useState<Logo | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [fontHeading, setFontHeading] = useState('')
  const [fontBody, setFontBody] = useState('')
  const [fontNotes, setFontNotes] = useState('')
  const [fontBusy, setFontBusy] = useState(false)
  const [palettes, setPalettes] = useState<Palette[]>([])
  const [paletteDrafts, setPaletteDrafts] = useState<Record<string, (string | null)[]>>({})
  const [paletteBusy, setPaletteBusy] = useState<string | null>(null)
  const [renamingPaletteId, setRenamingPaletteId] = useState<string | null>(null)
  const [renamePaletteName, setRenamePaletteName] = useState('')
  const [addingPalette, setAddingPalette] = useState(false)
  const [newPaletteName, setNewPaletteName] = useState('')
  const [paletteActionBusy, setPaletteActionBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const openDrawer = (l: Logo) => { setSelected(l); setDims(null); setFileSize(null) }

  useEffect(() => {
    if (!selected) return
    const url = selected.png || selected.jpg || selected.svg || selected.docx || selected.eps
    if (!url) return
    let cancelled = false
    fetch(url, { method: 'HEAD' })
      .then((r) => { const len = r.headers.get('content-length'); if (!cancelled && len) setFileSize(Number(len)) })
      .catch(() => {})
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => { cancelled = true; window.removeEventListener('keydown', onKey) }
  }, [selected])

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
    // Cache-bust so a manager's edits (add/rename/delete/cover/colors) always show
    // immediately, even though public reads of this endpoint are briefly CDN-cached.
    const res = await fetch(`/api/brand/${encodeURIComponent(code)}?t=${Date.now()}`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    if (d?.school) {
      const sc = d.school as School
      setSchool(sc)
      setLogos(Array.isArray(d.logos) ? (d.logos as Logo[]) : [])
      setFontHeading(sc.fonts?.heading || '')
      setFontBody(sc.fonts?.body || '')
      setFontNotes(sc.fonts?.notes || '')
      const pals = sc.palettes || []
      setPalettes(pals)
      setPaletteDrafts(Object.fromEntries(pals.map((p) => [p.id, p.colors.slice()])))
    } else setNotFound(true)
    setLoading(false)
  }, [code])

  const saveFonts = async () => {
    setFontBusy(true)
    try {
      const res = await fetch('/api/brand/school', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, headingFont: fontHeading, bodyFont: fontBody, fontNotes }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Could not save typography', 'error')
      else { notify('Typography saved', 'success'); await loadDetail() }
    } catch {
      notify('Could not save typography', 'error')
    } finally {
      setFontBusy(false)
    }
  }

  const savePaletteColors = async (paletteId: string) => {
    setPaletteBusy(paletteId)
    try {
      const res = await fetch('/api/brand/palettes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, id: paletteId, colors: paletteDrafts[paletteId] || [] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Could not save colors', 'error')
      else { notify('Brand colors saved', 'success'); await loadDetail() }
    } catch {
      notify('Could not save colors', 'error')
    } finally {
      setPaletteBusy(null)
    }
  }

  const createPalette = async () => {
    if (!newPaletteName.trim()) return
    setPaletteActionBusy(true)
    try {
      const res = await fetch('/api/brand/palettes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: newPaletteName.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Could not create the palette', 'error')
      else { notify('Palette created', 'success'); setNewPaletteName(''); setAddingPalette(false); await loadDetail() }
    } catch {
      notify('Could not create the palette', 'error')
    } finally {
      setPaletteActionBusy(false)
    }
  }

  const renamePalette = async (paletteId: string) => {
    if (!renamePaletteName.trim()) return
    setPaletteActionBusy(true)
    try {
      const res = await fetch('/api/brand/palettes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, id: paletteId, name: renamePaletteName.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Could not rename the palette', 'error')
      else { notify('Palette renamed', 'success'); setRenamingPaletteId(null); await loadDetail() }
    } catch {
      notify('Could not rename the palette', 'error')
    } finally {
      setPaletteActionBusy(false)
    }
  }

  const deletePalette = async (paletteId: string, paletteName: string) => {
    if (!window.confirm(`Remove the "${paletteName}" palette?`)) return
    setPaletteActionBusy(true)
    try {
      const qs = new URLSearchParams({ code, id: paletteId })
      const res = await fetch(`/api/brand/palettes?${qs.toString()}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Could not remove the palette', 'error')
      else { notify('Palette removed', 'success'); await loadDetail() }
    } catch {
      notify('Could not remove the palette', 'error')
    } finally {
      setPaletteActionBusy(false)
    }
  }

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

  const triggerUpload = () => fileRef.current?.click()

  // Upload one file via sign -> direct upload -> finalize. Returns true on success.
  const uploadOneFile = async (file: File, cat: string, nm: string, format: LogoFormat): Promise<boolean> => {
    try {
      const signRes = await fetch('/api/brand/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, category: cat, name: nm, format }),
      })
      const sign = await signRes.json().catch(() => ({}))
      if (!signRes.ok) { notify(typeof sign?.error === 'string' ? sign.error : 'Upload failed', 'error'); return false }
      const supabase = createClient()
      const { error: upErr } = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType: CONTENT_TYPE[format] })
      if (upErr) { notify(upErr.message || 'Upload failed', 'error'); return false }
      const finRes = await fetch('/api/brand/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, category: cat, name: nm, format, path: sign.path }),
      })
      const fin = await finRes.json().catch(() => ({}))
      if (!finRes.ok) { notify(typeof fin?.error === 'string' ? fin.error : 'Could not save logo', 'error'); return false }
      return true
    } catch {
      notify('Upload failed', 'error')
      return false
    }
  }

  // Accepts one or many files (button, file dialog, or drag-and-drop). When a single
  // file is dropped the typed name is used; for multiple, each name comes from its filename.
  const onAddFiles = async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : []
    if (files.length === 0) return
    const cat = category.trim() || 'Official'
    setBusy('add')
    let ok = 0
    let fail = 0
    for (const file of files) {
      const format = detectFormat(file)
      if (!format || file.size > MAX_BYTES) { fail++; continue }
      // Word documents belong to the Letterhead category only (matches the server).
      if (format === 'docx' && cat.toLowerCase() !== 'letterhead') { fail++; continue }
      const nm = files.length === 1 && name.trim() ? name.trim() : deriveLogoName(file.name)
      const r = await uploadOneFile(file, cat, nm, format)
      if (r) ok++; else fail++
    }
    setBusy(null)
    if (fileRef.current) fileRef.current.value = ''
    if (ok > 0) { notify(`${ok} file${ok === 1 ? '' : 's'} uploaded`, 'success'); setName(''); await loadDetail() }
    if (fail > 0) notify(`${fail} file${fail === 1 ? '' : 's'} skipped (images must be PNG, JPG, SVG, or EPS; Word docs (.docx) must use the Letterhead category; max ${formatBytes(MAX_BYTES)})`, 'error')
  }

  const startEdit = (l: Logo) => { setEditing(`${l.category}||${l.name}`); setEditCategory(l.category); setEditName(l.name); setEditNotes(l.notes || ''); setEditCustom(false) }

  const saveEdit = async (l: Logo) => {
    if (!editCategory.trim() || !editName.trim()) { notify('Category and name are required', 'error'); return }
    setBusy('edit')
    try {
      const res = await fetch('/api/brand/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, category: l.category, name: l.name, newCategory: editCategory.trim(), newName: editName.trim(), notes: editNotes }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Update failed', 'error')
      else { notify('Logo updated', 'success'); setEditing(null); await loadDetail() }
    } catch {
      notify('Update failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const setCover = async (l: Logo) => {
    setBusy(`cover-${l.category}-${l.name}`)
    try {
      const res = await fetch('/api/brand/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, category: l.category, name: l.name }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(typeof d?.error === 'string' ? d.error : 'Could not set cover', 'error')
      else { notify('Cover image updated', 'success'); await loadDetail() }
    } catch {
      notify('Could not set cover', 'error')
    } finally {
      setBusy(null)
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

          <section style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--surface-2)', marginBottom: 24, overflow: 'hidden' }}>
            <button type="button" onClick={() => setAddOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Add a logo</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#185fa5' }}>{addOpen ? 'Hide' : '+ Add logo'}</span>
            </button>
            {addOpen && (
            <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(200px, 2fr)', gap: 10, marginBottom: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Category</span>
                <input list="brand-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Official" style={input} />
                <datalist id="brand-categories">
                  {existingCategories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Logo name (optional for drag-and-drop)</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Primary wordmark, white" style={input} />
              </label>
            </div>
            <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.svg,.docx,.eps,image/png,image/jpeg,image/svg+xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/postscript" multiple style={{ display: 'none' }} onChange={(e) => onAddFiles(e.target.files)} />
            <div
              onClick={() => { if (!addBusy) triggerUpload() }}
              onDragOver={(e) => { e.preventDefault(); if (!addBusy) setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!addBusy) onAddFiles(e.dataTransfer.files) }}
              style={{ border: `2px dashed ${dragOver ? '#185fa5' : 'var(--border-subtle)'}`, borderRadius: 10, background: dragOver ? 'rgba(24,95,165,0.08)' : 'transparent', padding: '22px 14px', textAlign: 'center', cursor: addBusy ? 'default' : 'pointer', color: 'var(--text-muted)', fontSize: 13 }}
            >
              {addBusy ? 'Uploading...' : (
                <><span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Drag PNG, JPG, SVG, EPS, or .docx files here</span><br />or click to choose (Word docs go in the Letterhead category)</>
              )}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
              Drop one or more files. With a single file the name above is used; for multiple, each name comes from its filename. Re-uploading the same category, name, and format replaces the existing file.
            </p>
            </div>
            )}
          </section>

          <section style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--surface-2)', marginBottom: 24, padding: 16 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Brand colors</h2>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>Shown as swatches on this school&rsquo;s public brand page and guide. Enter a hex value or use the picker; leave a slot blank to remove that color. Add more palettes for things like spirit colors or an athletics palette.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {palettes.map((p) => {
                const draft = paletteDrafts[p.id] || new Array(PALETTE_COLOR_SLOTS).fill(null)
                const isPrimary = p.name.toLowerCase() === 'primary'
                return (
                  <div key={p.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, maxWidth: 420 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      {renamingPaletteId === p.id ? (
                        <>
                          <input autoFocus value={renamePaletteName} onChange={(e) => setRenamePaletteName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') renamePalette(p.id); if (e.key === 'Escape') setRenamingPaletteId(null) }}
                            style={{ height: 32, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: 13, padding: '0 8px' }} />
                          <button type="button" disabled={paletteActionBusy} onClick={() => renamePalette(p.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #185fa5', background: '#185fa5', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                          <button type="button" onClick={() => setRenamingPaletteId(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 13.5, fontWeight: 800 }}>{p.name}</span>
                          <button type="button" onClick={() => { setRenamingPaletteId(p.id); setRenamePaletteName(p.name) }} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: '#185fa5', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Rename</button>
                          {!isPrimary && (
                            <button type="button" onClick={() => deletePalette(p.id, p.name)} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: '#c0362c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Array.from({ length: PALETTE_COLOR_SLOTS }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 20, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{i + 1}</span>
                          <input type="color" value={toColorInputValue(draft[i] || '')}
                            onChange={(e) => setPaletteDrafts((d) => ({ ...d, [p.id]: draft.map((v, j) => (j === i ? e.target.value : v)) }))}
                            aria-label={`Color ${i + 1} picker`} style={{ width: 36, height: 32, border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--surface-2)', cursor: 'pointer', padding: 2 }} />
                          <input value={draft[i] || ''}
                            onChange={(e) => setPaletteDrafts((d) => ({ ...d, [p.id]: draft.map((v, j) => (j === i ? e.target.value : v)) }))}
                            placeholder="blank" style={{ ...input, width: 150, fontFamily: 'ui-monospace, monospace' }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button type="button" disabled={paletteBusy === p.id} onClick={() => savePaletteColors(p.id)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #185fa5', background: '#185fa5', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: paletteBusy === p.id ? 'default' : 'pointer', opacity: paletteBusy === p.id ? 0.6 : 1 }}>{paletteBusy === p.id ? 'Saving...' : 'Save colors'}</button>
                    </div>
                  </div>
                )
              })}
              {addingPalette ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input autoFocus value={newPaletteName} onChange={(e) => setNewPaletteName(e.target.value)} placeholder="Palette name, e.g. Spirit colors"
                    onKeyDown={(e) => { if (e.key === 'Enter') createPalette(); if (e.key === 'Escape') setAddingPalette(false) }}
                    style={{ height: 34, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: 13, padding: '0 8px', width: 220 }} />
                  <button type="button" disabled={paletteActionBusy || !newPaletteName.trim()} onClick={createPalette} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #185fa5', background: '#185fa5', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Create</button>
                  <button type="button" onClick={() => { setAddingPalette(false); setNewPaletteName('') }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingPalette(true)} style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8, border: '1px solid #185fa5', background: 'transparent', color: '#185fa5', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Add palette</button>
              )}
            </div>
          </section>

          <section style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--surface-2)', marginBottom: 24, padding: 16 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Typography</h2>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>Shown on this school&rsquo;s printable brand guide. Leave blank to hide the typography section.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Heading font</span>
                <input value={fontHeading} onChange={(e) => setFontHeading(e.target.value)} placeholder="e.g. Montserrat" style={input} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Body font</span>
                <input value={fontBody} onChange={(e) => setFontBody(e.target.value)} placeholder="e.g. Open Sans" style={input} />
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Notes (optional)</span>
              <textarea value={fontNotes} onChange={(e) => setFontNotes(e.target.value)} rows={2} placeholder="e.g. Where to download the fonts, fallback fonts, usage notes." style={{ ...input, height: 'auto', padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
            </label>
            <div style={{ marginTop: 12 }}>
              <button type="button" disabled={fontBusy} onClick={saveFonts} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #185fa5', background: '#185fa5', color: '#fff', fontSize: 13, fontWeight: 700, cursor: fontBusy ? 'default' : 'pointer', opacity: fontBusy ? 0.6 : 1 }}>{fontBusy ? 'Saving...' : 'Save typography'}</button>
            </div>
          </section>

          {logos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Background</span>
              {([['check', 'Checkered'], ['light', 'White'], ['dark', 'Dark']] as [PreviewBg, string][]).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setBg(m)} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${bg === m ? '#185fa5' : 'var(--border-subtle)'}`, background: bg === m ? '#185fa5' : 'transparent', color: bg === m ? '#ffffff' : 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
          )}
          {logos.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>No logos yet. Add the first one above.</p>
          ) : (
            grouped.map((group) => (
              <div key={group.category} style={{ marginBottom: 22 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>{group.category}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                  {group.items.map((l) => {
                    const preview = l.svg || l.png || l.jpg
                    return (
                      <div key={`${group.category}-${l.name}`} style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--surface-2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div onClick={() => openDrawer(l)} title="View details" style={{ height: 130, ...previewBg(bg), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview} alt={l.name} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain' }} />
                          ) : l.docx ? (
                            <DocBadge />
                          ) : l.eps ? (
                            <EpsBadge />
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No preview</span>
                          )}
                        </div>
                        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                          {editing === `${l.category}||${l.name}` ? (
                            <>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Category</span>
                                <select
                                  value={editCustom ? '__custom__' : editCategory}
                                  onChange={(e) => {
                                    if (e.target.value === '__custom__') { setEditCustom(true); setEditCategory('') }
                                    else { setEditCustom(false); setEditCategory(e.target.value) }
                                  }}
                                  style={input}
                                >
                                  {existingCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                                  <option value="__custom__">+ New category...</option>
                                </select>
                                {editCustom && (
                                  <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="New category name" style={input} autoFocus />
                                )}
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Name</span>
                                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={input} />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Official notes (shown publicly)</span>
                                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} placeholder="e.g. Use on white backgrounds only; do not stretch." style={{ ...input, height: 'auto', padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
                              </label>
                              <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                                <button type="button" disabled={busy === 'edit'} onClick={() => saveEdit(l)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #185fa5', background: '#185fa5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy === 'edit' ? 'default' : 'pointer', opacity: busy === 'edit' ? 0.6 : 1 }}>{busy === 'edit' ? 'Saving...' : 'Save'}</button>
                                <button type="button" onClick={() => setEditing(null)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{l.name}</span>
                                <button type="button" onClick={() => startEdit(l)} title="Change category or name" style={{ flexShrink: 0, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#185fa5', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}>Edit</button>
                              </div>
                              {l.cover ? (
                                <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, color: '#1f9254', background: 'rgba(31,146,84,0.12)', border: '1px solid rgba(31,146,84,0.4)', borderRadius: 6, padding: '2px 8px' }}>★ Cover image</span>
                              ) : (
                                <button type="button" onClick={() => setCover(l)} disabled={busy === `cover-${l.category}-${l.name}`} style={{ alignSelf: 'flex-start', padding: '3px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: busy === `cover-${l.category}-${l.name}` ? 'default' : 'pointer' }}>Set as cover</button>
                              )}
                              <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
                                {(['svg', 'png', 'jpg', 'docx', 'eps'] as LogoFormat[]).map((fmt) => {
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
                            </>
                          )}
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

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,25,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 94vw)', height: '100%', background: 'var(--bg-main)', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'auto', color: 'var(--text-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-main)' }}>
              <span style={{ fontSize: 15, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
              <button type="button" onClick={() => setSelected(null)} style={{ flexShrink: 0, padding: '6px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ ...previewBg(bg), borderRadius: 12, border: '1px solid var(--border-subtle)', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
                {(selected.png || selected.jpg || selected.svg) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.png || selected.jpg || selected.svg || ''} alt={selected.name} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }} />
                ) : selected.docx ? (
                  <DocBadge />
                ) : selected.eps ? (
                  <EpsBadge />
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No preview</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                {([['check', 'Checkered'], ['light', 'White'], ['dark', 'Dark']] as [PreviewBg, string][]).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setBg(m)} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${bg === m ? '#185fa5' : 'var(--border-subtle)'}`, background: bg === m ? '#185fa5' : 'transparent', color: bg === m ? '#ffffff' : 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>

              {selected.cover && <p style={{ margin: '14px 0 0', fontSize: 12, fontWeight: 700, color: '#1f9254' }}>★ Cover image</p>}

              <p style={{ margin: '16px 0 4px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>File type</p>
              <p style={{ margin: 0, fontSize: 14 }}>{[selected.svg && 'SVG', selected.png && 'PNG', selected.jpg && 'JPG', selected.docx && 'Word document (.docx)', selected.eps && 'Vector file (.eps)'].filter(Boolean).join(', ') || 'Unknown'}</p>
              {(selected.png || selected.jpg || selected.svg) && (
                <>
                  <p style={{ margin: '16px 0 4px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Dimensions</p>
                  <p style={{ margin: 0, fontSize: 14 }}>{dims ? `${dims.w} × ${dims.h} px` : 'Loading...'}</p>
                </>
              )}
              <p style={{ margin: '16px 0 4px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>File size</p>
              <p style={{ margin: 0, fontSize: 14 }}>{fileSize ? formatBytes(fileSize) : 'Loading...'}</p>

              <p style={{ margin: '16px 0 4px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Category</p>
              <p style={{ margin: 0, fontSize: 14 }}>{selected.category}</p>

              {selected.notes && (
                <>
                  <p style={{ margin: '16px 0 4px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Notes</p>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selected.notes}</p>
                </>
              )}

              <p style={{ margin: '16px 0 8px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Download</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.svg && <a href={selected.svg} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', color: '#185fa5', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>SVG</a>}
                {selected.png && <a href={selected.png} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', color: '#185fa5', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>PNG</a>}
                {selected.jpg && <a href={selected.jpg} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)', color: '#185fa5', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>JPG</a>}
              </div>

              <p style={{ margin: '20px 0 8px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Manage</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!selected.cover && (
                  <button type="button" onClick={async () => { await setCover(selected); setSelected(null) }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Set as cover</button>
                )}
                {(['svg', 'png', 'jpg', 'docx', 'eps'] as LogoFormat[]).map((fmt) => (selected[fmt] ? (
                  <button key={fmt} type="button" onClick={async () => { await onDelete(selected, fmt); setSelected(null) }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: '#b42318', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete {fmt.toUpperCase()}</button>
                ) : null))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
