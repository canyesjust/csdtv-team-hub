'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useBrandEmbed, brandQuery } from '../useBrandEmbed'
import { copyText } from '@/lib/copy-text'
import {
  CATEGORY_ORDER,
  CONTENT_TYPE,
  DocBadge,
  EpsBadge,
  MAX_BRAND_UPLOAD_BYTES as MAX_BYTES,
  PALETTE_COLOR_SLOTS,
  detectFormat,
  deriveLogoName,
  formatBytes,
  orderCategories,
  previewBg,
  toColorInputValue,
  type PreviewBg,
} from '@/lib/brand-utils'

// If a CDN-resized thumbnail fails (e.g. the source image is too large for the
// transform service), fall back to the original file once so the logo still shows.
function onThumbError(e: SyntheticEvent<HTMLImageElement>, fallback: string | null) {
  const img = e.currentTarget
  if (img.dataset.fellBack || !fallback || img.src === fallback) return
  img.dataset.fellBack = '1'
  img.src = fallback
}

type BrandLevel = 'Elementary' | 'Middle' | 'High' | 'Specialty'
type Logo = { category: string; name: string; png: string | null; jpg: string | null; svg?: string | null; docx?: string | null; eps?: string | null; thumb?: string | null; flagged?: boolean; cover?: boolean; notes?: string | null }
type Colors = { primary: string | null; secondary: string | null; accent: string | null; text: string | null }
type Palette = { id: string; name: string; colors: (string | null)[] }
type School = {
  code: string
  name: string
  type?: string
  shortName: string | null
  mascot: string | null
  city: string | null
  level: BrandLevel
  colors: Colors
  palettes: Palette[]
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
  const [catFilter, setCatFilter] = useState<string>('All')
  const [vectorOnly, setVectorOnly] = useState(false)
  const [flagError, setFlagError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Logo | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [departments, setDepartments] = useState<DeptSummary[]>([])
  const [deptOpen, setDeptOpen] = useState<Set<string>>(new Set())
  const [deptLogos, setDeptLogos] = useState<Record<string, Logo[]>>({})
  const [deptLoading, setDeptLoading] = useState<Set<string>>(new Set())
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadCat, setUploadCat] = useState('Official')
  const [uploadName, setUploadName] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const uploadRef = useRef<HTMLInputElement | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [paletteDrafts, setPaletteDrafts] = useState<Record<string, (string | null)[]>>({})
  const [paletteBusy, setPaletteBusy] = useState<string | null>(null)
  const [paletteMsg, setPaletteMsg] = useState<Record<string, string | null>>({})
  const [renamingPaletteId, setRenamingPaletteId] = useState<string | null>(null)
  const [renamePaletteName, setRenamePaletteName] = useState('')
  const [addingPalette, setAddingPalette] = useState(false)
  const [newPaletteName, setNewPaletteName] = useState('')
  const [paletteActionBusy, setPaletteActionBusy] = useState(false)
  const [paletteActionErr, setPaletteActionErr] = useState<string | null>(null)
  const embed = useBrandEmbed()
  const linkQuery = brandQuery(reviewKey, embed)

  const openDrawer = (l: Logo) => { setSelected(l); setDims(null); setFileSize(null) }

  const reload = useCallback(async () => {
    if (!code) return
    // Cache-bust: after a reviewer edit/upload we need the fresh server state, not the
    // briefly-cached public copy.
    const r = await fetch(`/api/brand/${encodeURIComponent(code)}?t=${Date.now()}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (d?.school) { setSchool(d.school as School); setLogos(Array.isArray(d.logos) ? (d.logos as Logo[]) : []) }
  }, [code])

  // Reviewer upload (key-gated). Uploads go live immediately, like a manager upload.
  const uploadFiles = async (list: FileList | File[] | null) => {
    if (!reviewKey) return
    const files = list ? Array.from(list) : []
    if (files.length === 0) return
    const cat = uploadCat.trim() || 'Official'
    setUploadBusy(true)
    setUploadMsg(null)
    let ok = 0
    let fail = 0
    const supabase = createClient()
    for (const file of files) {
      const format = detectFormat(file)
      if (!format || file.size > MAX_BYTES) { fail++; continue }
      if (format === 'docx' && cat.toLowerCase() !== 'letterhead') { fail++; continue }
      const nm = files.length === 1 && uploadName.trim() ? uploadName.trim() : deriveLogoName(file.name)
      try {
        const signRes = await fetch('/api/brand/upload/sign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, category: cat, name: nm, format, key: reviewKey }),
        })
        const sign = await signRes.json().catch(() => ({}))
        if (!signRes.ok) { fail++; continue }
        const { error: upErr } = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType: CONTENT_TYPE[format] })
        if (upErr) { fail++; continue }
        const finRes = await fetch('/api/brand/upload/finalize', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, category: cat, name: nm, format, path: sign.path, key: reviewKey }),
        })
        if (!finRes.ok) { fail++; continue }
        ok++
      } catch { fail++ }
    }
    setUploadBusy(false)
    if (uploadRef.current) uploadRef.current.value = ''
    if (ok > 0) { setUploadName(''); await reload() }
    setUploadMsg(
      ok > 0
        ? `${ok} file${ok === 1 ? '' : 's'} uploaded${fail ? `, ${fail} skipped` : ''}.`
        : `No files uploaded. Images must be PNG, JPG, SVG, or EPS; Word docs (.docx) must use the Letterhead category. Max ${formatBytes(MAX_BYTES)} each.`,
    )
  }

  const toggleDept = (depCode: string) => {
    setDeptOpen((prev) => { const next = new Set(prev); if (next.has(depCode)) next.delete(depCode); else next.add(depCode); return next })
    if (!deptLogos[depCode] && !deptLoading.has(depCode)) {
      setDeptLoading((prev) => new Set(prev).add(depCode))
      fetch(`/api/brand/${encodeURIComponent(depCode)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setDeptLogos((prev) => ({ ...prev, [depCode]: Array.isArray(d?.logos) ? (d.logos as Logo[]) : [] })))
        .catch(() => {})
        .finally(() => setDeptLoading((prev) => { const n = new Set(prev); n.delete(depCode); return n }))
    }
  }

  useEffect(() => {
    if (!selected) return
    const url = selected.png || selected.jpg || selected.svg || selected.docx || selected.eps
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

  // In review mode, load every category used across the library so the reviewer can
  // move a logo into any label (not just the presets + this school's categories).
  useEffect(() => {
    if (!reviewKey) return
    let cancelled = false
    fetch('/api/brand/categories', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && Array.isArray(d?.categories)) setAllCategories(d.categories as string[]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [reviewKey])

  // Keep the palette editor drafts in sync with the loaded school palettes.
  useEffect(() => {
    if (!school) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaletteDrafts(Object.fromEntries(school.palettes.map((p) => [p.id, p.colors.slice()])))
  }, [school])

  useEffect(() => {
    // Read after mount so server and client first render match (no hydration mismatch).
    // Persist the review key for the tab so review mode survives navigation between
    // schools even when a link does not carry the ?review= param.
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

  const categories = useMemo(() => orderCategories([...new Set(logos.map((l) => l.category))]), [logos])
  // Full set of category options for the reviewer: presets + every category used
  // anywhere in the library, so the same labels are available on every school.
  const reviewCategoryOptions = useMemo(() => orderCategories([...CATEGORY_ORDER, ...allCategories]), [allCategories])
  const hasVector = useMemo(() => logos.some((l) => Boolean(l.svg)), [logos])

  const grouped = useMemo(() => {
    const map = new Map<string, Logo[]>()
    for (const l of logos) {
      if (vectorOnly && !l.svg) continue
      if (!map.has(l.category)) map.set(l.category, [])
      map.get(l.category)!.push(l)
    }
    let cats = orderCategories([...map.keys()])
    if (catFilter !== 'All') cats = cats.filter((cat) => cat === catFilter)
    return cats.map((cat) => ({ category: cat, items: map.get(cat) || [] }))
  }, [logos, catFilter, vectorOnly])

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

  const renameLogo = async (l: Logo, nextName: string) => {
    if (!reviewKey) return
    const nn = nextName.trim()
    setRenaming(null)
    if (!nn || nn === l.name) return
    const prevName = l.name
    setFlagError(null)
    setLogos((prev) => prev.map((x) => (x.category === l.category && x.name === prevName ? { ...x, name: nn } : x)))
    const revert = () => setLogos((prev) => prev.map((x) => (x.category === l.category && x.name === nn ? { ...x, name: prevName } : x)))
    try {
      const res = await fetch('/api/brand/review-rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: reviewKey, code, category: l.category, name: prevName, newName: nn }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        revert()
        setFlagError(typeof d?.error === 'string' ? d.error : 'Could not rename this logo.')
      }
    } catch {
      revert()
      setFlagError('Could not rename this logo. Try again.')
    }
  }

  const savePaletteColors = async (paletteId: string) => {
    if (!reviewKey || !school) return
    setPaletteBusy(paletteId)
    setPaletteMsg((m) => ({ ...m, [paletteId]: null }))
    try {
      const res = await fetch('/api/brand/palettes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: reviewKey, code, id: paletteId, colors: paletteDrafts[paletteId] || [] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPaletteMsg((m) => ({ ...m, [paletteId]: typeof d?.error === 'string' ? d.error : 'Could not save the colors.' }))
        return
      }
      setSchool((s) => (s ? { ...s, palettes: s.palettes.map((p) => (p.id === paletteId ? { ...p, colors: d.palette.colors } : p)) } : s))
      setPaletteMsg((m) => ({ ...m, [paletteId]: 'Colors saved.' }))
    } catch {
      setPaletteMsg((m) => ({ ...m, [paletteId]: 'Could not save the colors. Try again.' }))
    } finally {
      setPaletteBusy(null)
    }
  }

  const createPalette = async () => {
    if (!reviewKey || !newPaletteName.trim()) return
    setPaletteActionBusy(true)
    setPaletteActionErr(null)
    try {
      const res = await fetch('/api/brand/palettes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: reviewKey, code, name: newPaletteName.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setPaletteActionErr(typeof d?.error === 'string' ? d.error : 'Could not create the palette.'); return }
      setSchool((s) => (s ? { ...s, palettes: [...s.palettes, d.palette] } : s))
      setNewPaletteName('')
      setAddingPalette(false)
    } catch {
      setPaletteActionErr('Could not create the palette. Try again.')
    } finally {
      setPaletteActionBusy(false)
    }
  }

  const renamePalette = async (paletteId: string) => {
    if (!reviewKey || !renamePaletteName.trim()) return
    setPaletteActionBusy(true)
    setPaletteActionErr(null)
    try {
      const res = await fetch('/api/brand/palettes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: reviewKey, code, id: paletteId, name: renamePaletteName.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setPaletteActionErr(typeof d?.error === 'string' ? d.error : 'Could not rename the palette.'); return }
      setSchool((s) => (s ? { ...s, palettes: s.palettes.map((p) => (p.id === paletteId ? { ...p, name: d.palette.name } : p)) } : s))
      setRenamingPaletteId(null)
    } catch {
      setPaletteActionErr('Could not rename the palette. Try again.')
    } finally {
      setPaletteActionBusy(false)
    }
  }

  const deletePalette = async (paletteId: string, name: string) => {
    if (!reviewKey) return
    if (!window.confirm(`Remove the "${name}" palette?`)) return
    setPaletteActionBusy(true)
    setPaletteActionErr(null)
    try {
      const qs = new URLSearchParams({ code, id: paletteId, key: reviewKey })
      const res = await fetch(`/api/brand/palettes?${qs.toString()}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setPaletteActionErr(typeof d?.error === 'string' ? d.error : 'Could not remove the palette.'); return }
      setSchool((s) => (s ? { ...s, palettes: s.palettes.filter((p) => p.id !== paletteId) } : s))
    } catch {
      setPaletteActionErr('Could not remove the palette. Try again.')
    } finally {
      setPaletteActionBusy(false)
    }
  }

  const setReviewCover = async (l: Logo) => {
    if (!reviewKey) return
    setFlagError(null)
    setLogos((prev) => prev.map((x) => ({ ...x, cover: x.category === l.category && x.name === l.name })))
    try {
      const res = await fetch('/api/brand/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: reviewKey, code, category: l.category, name: l.name }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        await reload()
        setFlagError(typeof d?.error === 'string' ? d.error : 'Could not set the main image.')
      }
    } catch {
      await reload()
      setFlagError('Could not set the main image. Try again.')
    }
  }

  const changeCategory = async (l: Logo, newCat: string) => {
    if (!reviewKey || newCat === l.category) return
    const prevCat = l.category
    setFlagError(null)
    setLogos((prev) => prev.map((x) => (x.category === prevCat && x.name === l.name ? { ...x, category: newCat } : x)))
    const revert = () => setLogos((prev) => prev.map((x) => (x.category === newCat && x.name === l.name ? { ...x, category: prevCat } : x)))
    try {
      const res = await fetch('/api/brand/review-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: reviewKey, code, category: prevCat, name: l.name, newCategory: newCat }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        revert()
        setFlagError(typeof d?.error === 'string' ? d.error : 'Could not change the category.')
      }
    } catch {
      revert()
      setFlagError('Could not change the category. Try again.')
    }
  }

  const copyHex = async (key: string, hex: string) => {
    if (await copyText(hex)) {
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
    }
  }

  const dlBtn: CSSProperties = { padding: '5px 12px', borderRadius: 7, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.info, fontSize: 12, fontWeight: 700, textDecoration: 'none' }

  const swatch = (hex: string, key: string) => (
    <button key={key} type="button" onClick={() => copyHex(key, hex)} title={`Copy ${hex}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 88, border: `1px solid ${colors.line}`, borderRadius: 8, padding: 0, background: colors.cardBg, cursor: 'pointer', overflow: 'hidden', textAlign: 'left' }}>
      <span style={{ height: 32, background: hex, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: readableOn(hex) }}>{copied === key ? 'Copied' : ''}</span>
      <span style={{ display: 'block', padding: '3px 8px 6px', fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{hex}</span>
    </button>
  )

  return (
    <div style={{ background: embed ? 'transparent' : colors.bg, minHeight: embed ? undefined : '100vh', color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 1640, margin: '0 auto', padding: embed ? '10px 12px 28px' : '24px 24px 72px' }}>
        <Link href={`/brand${linkQuery}`} style={{ fontSize: 13, fontWeight: 700, color: colors.info, textDecoration: 'none' }}>{'←'} All schools</Link>

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

            {!reviewKey && (
              <a href={`/brand/${code}/guide`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginBottom: 18, padding: '9px 16px', borderRadius: 8, border: `1px solid ${colors.info}`, color: colors.info, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Open brand guide {'↗'}</a>
            )}

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

            {reviewKey && (
              <section style={{ border: `1px solid ${colors.border}`, borderRadius: 12, background: colors.cardBg, marginBottom: 22, overflow: 'hidden' }}>
                <button type="button" onClick={() => setUploadOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: colors.text }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>Upload a logo or letterhead</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.info }}>{uploadOpen ? 'Hide' : '+ Add file'}</span>
                </button>
                {uploadOpen && (
                  <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(180px, 2fr)', gap: 10, marginBottom: 12 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>Category</span>
                        <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} style={{ height: 36, borderRadius: 8, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.text, fontSize: 13, padding: '0 10px' }}>
                          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={{ fontSize: 12, color: colors.muted, fontWeight: 600 }}>Name (optional for drag-and-drop)</span>
                        <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. Primary wordmark, white" style={{ height: 36, borderRadius: 8, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.text, fontSize: 13, padding: '0 10px', boxSizing: 'border-box' }} />
                      </label>
                    </div>
                    <input ref={uploadRef} type="file" accept=".png,.jpg,.jpeg,.svg,.docx,.eps,image/png,image/jpeg,image/svg+xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/postscript" multiple style={{ display: 'none' }} onChange={(e) => uploadFiles(e.target.files)} />
                    <div
                      onClick={() => { if (!uploadBusy) uploadRef.current?.click() }}
                      onDragOver={(e) => { e.preventDefault(); if (!uploadBusy) setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!uploadBusy) uploadFiles(e.dataTransfer.files) }}
                      style={{ border: `2px dashed ${dragOver ? colors.info : colors.line}`, borderRadius: 10, background: dragOver ? 'rgba(24,95,165,0.08)' : 'transparent', padding: '20px 14px', textAlign: 'center', cursor: uploadBusy ? 'default' : 'pointer', color: colors.muted, fontSize: 13 }}
                    >
                      {uploadBusy ? 'Uploading...' : (
                        <><span style={{ fontWeight: 700, color: colors.text }}>Drag files here</span><br />or click to choose (PNG, JPG, SVG, EPS, or .docx for Letterhead)</>
                      )}
                    </div>
                    {uploadMsg && <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 600, color: colors.muted }}>{uploadMsg}</p>}
                    <p style={{ margin: '8px 0 0', fontSize: 11.5, color: colors.muted }}>Uploads appear right away. Word documents (.docx) are only allowed in the Letterhead category. Max {formatBytes(MAX_BYTES)} per file.</p>
                  </div>
                )}
              </section>
            )}

            {school.type === 'district' && departments.some((d) => d.logoCount > 0) && (
              <section style={{ marginBottom: 28 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.muted }}>Departments</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {departments.filter((dep) => dep.logoCount > 0).map((dep) => {
                    const open = deptOpen.has(dep.code)
                    const dlogos = deptLogos[dep.code] || []
                    return (
                      <div key={dep.code} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, background: colors.cardBg, overflow: 'hidden' }}>
                        <button type="button" onClick={() => toggleDept(dep.code)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: colors.text }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>{dep.name}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 12.5, color: colors.muted }}>{dep.logoCount} logo{dep.logoCount === 1 ? '' : 's'}</span>
                            <span style={{ fontSize: 12, color: colors.muted }}>{open ? '▾' : '▸'}</span>
                          </span>
                        </button>
                        {open && (
                          <div style={{ padding: '0 16px 16px' }}>
                            {deptLoading.has(dep.code) && dlogos.length === 0 ? (
                              <p style={{ fontSize: 13, color: colors.muted, margin: 0 }}>Loading...</p>
                            ) : dlogos.length === 0 ? (
                              <p style={{ fontSize: 13, color: colors.muted, margin: 0 }}>No logos.</p>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                                {dlogos.map((l) => {
                                  const preview = l.thumb || l.png || l.jpg
                                  const rawPreview = l.png || l.jpg || l.svg || null
                                  return (
                                    <div key={`${l.category}-${l.name}`} onClick={() => openDrawer(l)} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: colors.cardBg }}>
                                      <div style={{ height: 140, ...previewBg(bg), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: `1px solid ${colors.line}` }}>
                                        {preview ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={preview} alt={l.name} loading="lazy" decoding="async" onError={(e) => onThumbError(e, rawPreview)} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain', pointerEvents: 'none' }} />
                                        ) : l.docx ? (
                                          <DocBadge compact />
                                        ) : l.eps ? (
                                          <EpsBadge compact />
                                        ) : (
                                          <span style={{ fontSize: 12, color: colors.muted }}>No preview</span>
                                        )}
                                      </div>
                                      <div style={{ padding: '10px 12px' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{l.name}</div>
                                        <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{l.category}</div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <section style={{ marginBottom: 26 }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.muted }}>Brand colors</h2>
              {reviewKey ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {school.palettes.map((p) => {
                    const draft = paletteDrafts[p.id] || new Array(PALETTE_COLOR_SLOTS).fill(null)
                    const isPrimary = p.name.toLowerCase() === 'primary'
                    return (
                      <div key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, background: colors.cardBg, padding: 14, maxWidth: 420 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          {renamingPaletteId === p.id ? (
                            <>
                              <input autoFocus value={renamePaletteName} onChange={(e) => setRenamePaletteName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') renamePalette(p.id); if (e.key === 'Escape') setRenamingPaletteId(null) }}
                                style={{ height: 30, borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.text, fontSize: 13, padding: '0 8px' }} />
                              <button type="button" disabled={paletteActionBusy} onClick={() => renamePalette(p.id)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.info}`, background: colors.info, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                              <button type="button" onClick={() => setRenamingPaletteId(null)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.muted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 13.5, fontWeight: 800 }}>{p.name}</span>
                              <button type="button" onClick={() => { setRenamingPaletteId(p.id); setRenamePaletteName(p.name) }} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.info, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Rename</button>
                              {!isPrimary && (
                                <button type="button" onClick={() => deletePalette(p.id, p.name)} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: '#a4161a', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
                              )}
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {Array.from({ length: PALETTE_COLOR_SLOTS }).map((_, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 20, fontSize: 11, color: colors.muted, fontWeight: 600 }}>{i + 1}</span>
                              <input type="color" value={toColorInputValue(draft[i] || '')}
                                onChange={(e) => setPaletteDrafts((d) => ({ ...d, [p.id]: draft.map((v, j) => (j === i ? e.target.value : v)) }))}
                                aria-label={`Color ${i + 1} picker`} style={{ width: 36, height: 30, border: `1px solid ${colors.line}`, borderRadius: 6, background: colors.cardBg, cursor: 'pointer', padding: 2 }} />
                              <input value={draft[i] || ''}
                                onChange={(e) => setPaletteDrafts((d) => ({ ...d, [p.id]: draft.map((v, j) => (j === i ? e.target.value : v)) }))}
                                placeholder="blank" style={{ width: 140, height: 30, border: `1px solid ${colors.line}`, borderRadius: 6, padding: '0 8px', fontSize: 12.5, fontFamily: 'ui-monospace, monospace', color: colors.text, background: colors.cardBg, boxSizing: 'border-box' }} />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                          <button type="button" disabled={paletteBusy === p.id} onClick={() => savePaletteColors(p.id)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${colors.info}`, background: colors.info, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: paletteBusy === p.id ? 'default' : 'pointer', opacity: paletteBusy === p.id ? 0.6 : 1 }}>{paletteBusy === p.id ? 'Saving...' : 'Save colors'}</button>
                          {paletteMsg[p.id] && <span style={{ fontSize: 12, fontWeight: 600, color: colors.muted }}>{paletteMsg[p.id]}</span>}
                        </div>
                      </div>
                    )
                  })}
                  {addingPalette ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input autoFocus value={newPaletteName} onChange={(e) => setNewPaletteName(e.target.value)} placeholder="Palette name, e.g. Spirit colors"
                        onKeyDown={(e) => { if (e.key === 'Enter') createPalette(); if (e.key === 'Escape') setAddingPalette(false) }}
                        style={{ height: 32, borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.text, fontSize: 13, padding: '0 8px', width: 220 }} />
                      <button type="button" disabled={paletteActionBusy || !newPaletteName.trim()} onClick={createPalette} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${colors.info}`, background: colors.info, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Create</button>
                      <button type="button" onClick={() => { setAddingPalette(false); setNewPaletteName('') }} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingPalette(true)} style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8, border: `1px solid ${colors.info}`, background: 'transparent', color: colors.info, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Add palette</button>
                  )}
                  {paletteActionErr && <span style={{ fontSize: 12.5, fontWeight: 600, color: '#a4161a' }}>{paletteActionErr}</span>}
                  <p style={{ margin: 0, fontSize: 11.5, color: colors.muted }}>Enter a hex value (e.g. #003087) or use the picker. Leave a slot blank to remove that color.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {school.palettes.filter((p) => p.colors.some(Boolean)).map((p) => (
                    <div key={p.id}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{p.name}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.colors.map((hex, i) => (hex ? swatch(hex, `${p.id}-${i}`) : null))}
                      </div>
                    </div>
                  ))}
                  {school.palettes.every((p) => !p.colors.some(Boolean)) && (
                    <span style={{ fontSize: 13, color: colors.muted }}>No brand colors on file.</span>
                  )}
                </div>
              )}
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
              {logos.length > 0 && !reviewKey && (categories.length > 1 || hasVector) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '0 0 16px' }}>
                  {['All', ...categories].map((cat) => {
                    const on = catFilter === cat
                    return (
                      <button key={cat} type="button" onClick={() => setCatFilter(cat)} style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${on ? colors.info : colors.line}`, background: on ? colors.info : colors.cardBg, color: on ? '#ffffff' : colors.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{cat}</button>
                    )
                  })}
                  {hasVector && (
                    <button type="button" onClick={() => setVectorOnly((v) => !v)} title="Show only logos available as scalable vector (SVG)" style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${vectorOnly ? colors.info : colors.line}`, background: vectorOnly ? colors.info : colors.cardBg, color: vectorOnly ? '#ffffff' : colors.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>{vectorOnly ? '✓ ' : ''}Vector (SVG)</button>
                  )}
                </div>
              )}
              {logos.length === 0 ? (
                <p style={{ fontSize: 14, color: colors.muted, fontStyle: 'italic' }}>No logos have been uploaded for this school yet.</p>
              ) : grouped.length === 0 ? (
                <p style={{ fontSize: 14, color: colors.muted, fontStyle: 'italic' }}>No logos match the current filter.</p>
              ) : (
                grouped.map((group) => (
                  <div key={group.category} style={{ marginBottom: 22 }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>{group.category}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
                      {group.items.map((l) => {
                        const preview = l.thumb || l.png || l.jpg
                        const rawPreview = l.png || l.jpg || l.svg || null
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
                                <img src={preview} alt={l.name} loading="lazy" decoding="async" onError={(e) => onThumbError(e, rawPreview)} style={{ maxWidth: '88%', maxHeight: '88%', objectFit: 'contain', pointerEvents: 'none' }} />
                              ) : l.docx ? (
                                <DocBadge />
                              ) : l.eps ? (
                                <EpsBadge />
                              ) : (
                                <span style={{ fontSize: 12, color: colors.muted }}>No preview</span>
                              )}
                            </div>
                            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                              {reviewKey && renaming === `${l.category}||${l.name}` ? (
                                <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') renameLogo(l, renameValue); if (e.key === 'Escape') setRenaming(null) }}
                                    style={{ height: 32, borderRadius: 7, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.text, fontSize: 13, padding: '0 9px', boxSizing: 'border-box' }}
                                  />
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button type="button" onClick={() => renameLogo(l, renameValue)} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${colors.info}`, background: colors.info, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                                    <button type="button" onClick={() => setRenaming(null)} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.muted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{l.name}</span>
                                  {reviewKey && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setRenaming(`${l.category}||${l.name}`); setRenameValue(l.name) }} style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.info, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Rename</button>
                                  )}
                                </div>
                              )}
                              {reviewKey ? (
                                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: l.flagged ? '#e0282e' : colors.muted }}>
                                    {l.flagged ? 'Marked for deletion - click to undo' : 'Click to mark as old'}
                                  </span>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); openDrawer(l) }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.info, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>View file details</button>
                                    {(l.png || l.jpg || l.svg) && (l.cover ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(31,146,84,0.4)', background: 'rgba(31,146,84,0.12)', color: '#1f9254', fontSize: 11.5, fontWeight: 700 }}>★ Main image</span>
                                    ) : (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setReviewCover(l) }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.line}`, background: colors.cardBg, color: colors.info, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Set as main image</button>
                                    ))}
                                  </div>
                                  <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                    <span style={{ fontSize: 10.5, color: colors.muted, alignSelf: 'center', marginRight: 2 }}>Category:</span>
                                    {(reviewCategoryOptions.includes(l.category) ? reviewCategoryOptions : [...reviewCategoryOptions, l.category]).map((cat) => {
                                      const cur = cat === l.category
                                      return (
                                        <button key={cat} type="button" onClick={(e) => { e.stopPropagation(); changeCategory(l, cat) }}
                                          style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${cur ? colors.info : colors.line}`, background: cur ? colors.info : colors.cardBg, color: cur ? '#ffffff' : colors.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                          {cat}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
                                  {l.svg && <a href={l.svg} style={dlBtn}>SVG</a>}
                                  {l.png && <a href={l.png} style={dlBtn}>PNG</a>}
                                  {l.jpg && <a href={l.jpg} style={dlBtn}>JPG</a>}
                                  {l.docx && <a href={l.docx} style={dlBtn}>DOCX</a>}
                                  {l.eps && <a href={l.eps} style={dlBtn}>EPS</a>}
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
                {(selected.png || selected.jpg || selected.svg) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.png || selected.jpg || selected.svg || ''} alt={selected.name} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} style={{ maxWidth: '100%', maxHeight: 440, objectFit: 'contain' }} />
                ) : selected.docx ? (
                  <DocBadge />
                ) : selected.eps ? (
                  <EpsBadge />
                ) : (
                  <span style={{ fontSize: 13, color: colors.muted }}>No preview</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                {([['check', 'Checkered'], ['light', 'White'], ['dark', 'Dark']] as [PreviewBg, string][]).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setBg(m)} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${bg === m ? colors.info : colors.line}`, background: bg === m ? colors.info : colors.cardBg, color: bg === m ? '#ffffff' : colors.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
              <p style={{ margin: '16px 0 4px', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>File type</p>
              <p style={{ margin: 0, fontSize: 14 }}>{[selected.svg && 'SVG', selected.png && 'PNG', selected.jpg && 'JPG', selected.docx && 'Word document (.docx)', selected.eps && 'Vector file (.eps)'].filter(Boolean).join(', ') || 'Unknown'}</p>
              {(selected.png || selected.jpg || selected.svg) && (
                <>
                  <p style={{ margin: '16px 0 4px', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Dimensions</p>
                  <p style={{ margin: 0, fontSize: 14 }}>{dims ? `${dims.w} × ${dims.h} px` : 'Loading...'}</p>
                </>
              )}
              <p style={{ margin: '16px 0 4px', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>File size</p>
              <p style={{ margin: 0, fontSize: 14 }}>{fileSize ? formatBytes(fileSize) : 'Loading...'}</p>
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
                {selected.svg && <a href={selected.svg} style={{ ...dlBtn, padding: '8px 16px', fontSize: 13 }}>SVG</a>}
                {selected.png && <a href={selected.png} style={{ ...dlBtn, padding: '8px 16px', fontSize: 13 }}>PNG</a>}
                {selected.jpg && <a href={selected.jpg} style={{ ...dlBtn, padding: '8px 16px', fontSize: 13 }}>JPG</a>}
                {selected.docx && <a href={selected.docx} style={{ ...dlBtn, padding: '8px 16px', fontSize: 13 }}>DOCX</a>}
                {selected.eps && <a href={selected.eps} style={{ ...dlBtn, padding: '8px 16px', fontSize: 13 }}>EPS</a>}
                {!selected.png && !selected.jpg && !selected.svg && !selected.docx && !selected.eps && <span style={{ fontSize: 13, color: colors.muted }}>No downloadable files.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
