'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Stored = { name: string; url: string | null }

/**
 * Pick an image, or drop a new one in.
 *
 * The value stored on the graphic is the public URL, not a path, so the OBS
 * browser source needs nothing resolved at render time. Uploads land in a
 * public bucket for the same reason.
 */
export default function ImageField({
  value, onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [images, setImages] = useState<Stored[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || loaded) return
    let alive = true
    void fetch('/api/gfx/images')
      .then(r => (r.ok ? r.json() : { images: [] }))
      .then(body => { if (alive) { setImages(body.images || []); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [open, loaded])

  const upload = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/gfx/images', { method: 'POST', body: form }).catch(() => null)
    setBusy(false)
    if (!res || !res.ok) {
      const body = await res?.json().catch(() => ({}))
      setError(typeof body?.error === 'string' ? body.error : 'That did not upload.')
      return
    }
    const body = await res.json()
    if (body.url) { onChange(body.url); setLoaded(false); setOpen(false) }
  }, [onChange])

  return (
    <div className="gx-imgf">
      <div className="gx-imgf-row">
        <span className="gx-imgf-thumb">
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="" />
            : <span className="gfx-note">none</span>}
        </span>
        <button className="gfx-btn sm ghost" onClick={() => setOpen(v => !v)}>
          {value ? 'Change' : 'Choose'}
        </button>
        <button className="gfx-btn sm ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
        {value && <button className="gfx-btn sm ghost" onClick={() => onChange('')}>Clear</button>}
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />

      {error && <p className="gfx-note" style={{ color: '#ff9ba4', marginTop: 5 }}>{error}</p>}

      {open && (
        <div className="gx-imgf-grid">
          {!loaded ? (
            <p className="gfx-note">Loading…</p>
          ) : images.length === 0 ? (
            <p className="gfx-note">Nothing uploaded yet. Hit Upload.</p>
          ) : images.map(img => (
            <button key={img.name} className={`gx-imgf-cell${img.url === value ? ' on' : ''}`}
              onClick={() => { if (img.url) onChange(img.url); setOpen(false) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img.url && <img src={img.url} alt="" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
