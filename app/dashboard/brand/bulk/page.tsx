'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Format = 'png' | 'jpg'
type ItemStatus = 'ready' | 'unmatched' | 'unsupported' | 'uploading' | 'done' | 'error'
type Item = {
  id: string
  schoolName: string
  code: string | null
  category: string
  name: string
  format: Format | null
  file: File
  status: ItemStatus
  message?: string
}

const MAX_BYTES = 20 * 1024 * 1024

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }))
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function detectFormat(file: File): Format | null {
  const t = (file.type || '').toLowerCase()
  if (t === 'image/png') return 'png'
  if (t === 'image/jpeg') return 'jpg'
  const n = file.name.toLowerCase()
  if (n.endsWith('.png')) return 'png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg'
  return null
}

function logoNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  const cleaned = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || 'Logo'
}

export default function BulkUploadPage() {
  const router = useRouter()
  const [access, setAccess] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [nameToCode, setNameToCode] = useState<Map<string, string>>(new Map())
  const [items, setItems] = useState<Item[]>([])
  const [running, setRunning] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

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

  useEffect(() => {
    if (access !== 'ok') return
    let cancelled = false
    fetch('/api/brand', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const map = new Map<string, string>()
        for (const s of (Array.isArray(d?.schools) ? d.schools : [])) {
          const code = s?.code ? String(s.code) : ''
          if (!code) continue
          if (s?.name) map.set(normalize(String(s.name)), code)
          if (s?.shortName) map.set(normalize(String(s.shortName)), code)
          map.set(normalize(code), code) // folders named by code also match
        }
        setNameToCode(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [access])

  // The native folder picker needs non-standard attributes set on the element.
  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.setAttribute('webkitdirectory', '')
      el.setAttribute('directory', '')
      el.setAttribute('multiple', '')
    }
  }, [access])

  const onPick = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const next: Item[] = []
    Array.from(files).forEach((file, i) => {
      const rel = file.webkitRelativePath || file.name
      const segments = rel.split('/').filter(Boolean)
      const dirs = segments.slice(0, -1) // drop the filename

      // Find the deepest folder that matches a known school name.
      let schoolIdx = -1
      let code: string | null = null
      for (let d = dirs.length - 1; d >= 0; d--) {
        const c = nameToCode.get(normalize(dirs[d]))
        if (c) { schoolIdx = d; code = c; break }
      }
      // When matched, show the matched folder. When unmatched, show the full folder
      // path so it is clear which folder needs renaming (not the category subfolder).
      const schoolName = schoolIdx >= 0 ? dirs[schoolIdx] : (dirs.join(' / ') || file.name)
      // A folder between the school folder and the file becomes the category.
      const category = schoolIdx >= 0 && dirs.length > schoolIdx + 1 ? dirs[schoolIdx + 1].slice(0, 60) : 'Official'

      const format = detectFormat(file)
      let status: ItemStatus
      if (!format) status = 'unsupported'
      else if (file.size > MAX_BYTES) status = 'unsupported'
      else if (!code) status = 'unmatched'
      else status = 'ready'

      next.push({ id: `${i}-${rel}`, schoolName, code, category, name: logoNameFromFilename(file.name), format, file, status })
    })
    setItems(next)
  }

  const counts = useMemo(() => {
    let ready = 0, done = 0, error = 0, uploading = 0, unsupported = 0
    const unmatched = new Set<string>()
    for (const it of items) {
      if (it.status === 'ready') ready++
      else if (it.status === 'done') done++
      else if (it.status === 'error') error++
      else if (it.status === 'uploading') uploading++
      else if (it.status === 'unsupported') unsupported++
      else if (it.status === 'unmatched') unmatched.add(it.schoolName || '(no folder)')
    }
    return { ready, done, error, uploading, unsupported, unmatched: [...unmatched].sort() }
  }, [items])

  const uploadable = counts.ready + counts.done + counts.error + counts.uploading

  const uploadOne = async (it: Item): Promise<{ ok: boolean; error?: string }> => {
    const format = it.format
    if (!it.code || !format) return { ok: false, error: 'Not ready' }
    try {
      const signRes = await fetch('/api/brand/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: it.code, category: it.category, name: it.name, format }),
      })
      const sign = await signRes.json().catch(() => ({}))
      if (!signRes.ok) return { ok: false, error: typeof sign?.error === 'string' ? sign.error : 'sign failed' }
      const supabase = createClient()
      const { error: upErr } = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, it.file, { contentType: format === 'png' ? 'image/png' : 'image/jpeg' })
      if (upErr) return { ok: false, error: upErr.message || 'upload failed' }
      const finRes = await fetch('/api/brand/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: it.code, category: it.category, name: it.name, format, path: sign.path }),
      })
      const fin = await finRes.json().catch(() => ({}))
      if (!finRes.ok) return { ok: false, error: typeof fin?.error === 'string' ? fin.error : 'save failed' }
      return { ok: true }
    } catch {
      return { ok: false, error: 'upload failed' }
    }
  }

  const start = async () => {
    const queue = items.filter((it) => it.status === 'ready' || it.status === 'error')
    if (queue.length === 0) return
    setRunning(true)
    for (const it of queue) {
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: 'uploading', message: undefined } : x)))
      const r = await uploadOne(it)
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: r.ok ? 'done' : 'error', message: r.ok ? undefined : r.error } : x)))
    }
    setRunning(false)
    notify('Bulk upload finished', 'success')
  }

  if (access !== 'ok') return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Checking access...</div>

  const errors = items.filter((it) => it.status === 'error')

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 56px', color: 'var(--text-primary)' }}>
      <Link href="/dashboard/brand" style={{ fontSize: 13, fontWeight: 700, color: '#185fa5', textDecoration: 'none' }}>{'←'} Brand library</Link>

      <header style={{ margin: '14px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Bulk upload logos</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Choose a folder that contains one subfolder per school, named to match the school (for example &ldquo;Alta High&rdquo;). Every PNG or JPG inside is imported into that school. Files directly in a school folder become &ldquo;Official&rdquo; logos; files inside a category subfolder use that subfolder as the category. The filename becomes the logo name. Re-running replaces files with the same name.
        </p>
      </header>

      <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={(e) => onPick(e.target.files)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button type="button" disabled={running} onClick={() => inputRef.current?.click()} style={{ height: 38, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, padding: '0 16px', cursor: running ? 'default' : 'pointer' }}>
          Choose folder
        </button>
        {uploadable > 0 && (
          <button type="button" disabled={running || counts.ready + counts.error === 0} onClick={start} style={{ height: 38, borderRadius: 8, border: '1px solid #185fa5', background: '#185fa5', color: '#fff', fontSize: 13, fontWeight: 700, padding: '0 18px', cursor: running ? 'default' : 'pointer', opacity: running ? 0.6 : 1 }}>
            {running ? `Uploading ${counts.done + counts.error}/${uploadable}...` : `Upload ${counts.ready + counts.error} logo${counts.ready + counts.error === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Ready', value: counts.ready, color: '#185fa5' },
            { label: 'Uploaded', value: counts.done, color: '#1f9254' },
            { label: 'Failed', value: counts.error, color: '#b42318' },
            { label: 'Unmatched schools', value: counts.unmatched.length, color: '#a9671c' },
            { label: 'Unsupported files', value: counts.unsupported, color: 'var(--text-muted)' },
          ].map((s) => (
            <div key={s.label} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '8px 14px', minWidth: 120 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {counts.unmatched.length > 0 && (
        <div style={{ border: '1px solid #e8c98a', background: '#fff8e6', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#7a5300' }}>These folder names did not match a school and will be skipped:</p>
          <p style={{ margin: 0, fontSize: 12.5, color: '#7a5300' }}>{counts.unmatched.join(', ')}</p>
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#7a5300' }}>Rename the folders to exactly match the school names, then choose the folder again.</p>
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ border: '1px solid #f0c0c0', background: '#fdecec', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#b42318' }}>Failed uploads ({errors.length}):</p>
          <div style={{ maxHeight: 240, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {errors.map((it) => (
              <div key={it.id} style={{ fontSize: 12, color: '#b42318' }}>{it.schoolName} / {it.name}.{it.format} - {it.message || 'failed'}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
