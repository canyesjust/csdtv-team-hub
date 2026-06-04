'use client'

import { useCallback, useEffect, useState } from 'react'
import FilePickButton from '@/components/FilePickButton'
import Loader from '../../components/Loader'
import { toast } from '@/lib/toast'
import type { MediaAssetRow } from '@/lib/board-meetings/playlist-types'

type AssetWithUrls = MediaAssetRow & { public_url: string; thumbnail_url: string }

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'video', label: 'Video' },
  { value: 'image', label: 'Image' },
  { value: 'bumper', label: 'Bumper' },
  { value: 'audio_bed', label: 'Audio bed' },
]

const UPLOAD_TYPES = [
  { value: 'video', label: 'Video (MP4/MOV)' },
  { value: 'image', label: 'Image' },
  { value: 'bumper', label: 'Bumper' },
  { value: 'audio_bed', label: 'Audio bed' },
]

function probeVideo(file: File): Promise<{ duration_seconds: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({ duration_seconds: v.duration, width: v.videoWidth, height: v.videoHeight })
    }
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read video')) }
    v.src = url
  })
}

function probeImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.width, height: img.height }) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')) }
    img.src = url
  })
}

function formatBytes(n: number | null) {
  if (!n) return '—'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function MediaTab() {
  const [assets, setAssets] = useState<AssetWithUrls[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadType, setUploadType] = useState('video')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadTags, setUploadTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [editAsset, setEditAsset] = useState<AssetWithUrls | null>(null)
  const [editName, setEditName] = useState('')
  const [editTags, setEditTags] = useState('')
  const [saving, setSaving] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const inputStyle: React.CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '14px',
    color: text,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '44px',
  }

  const load = useCallback(async () => {
    const q = new URLSearchParams()
    if (typeFilter) q.set('type', typeFilter)
    if (search.trim()) q.set('search', search.trim())
    const res = await fetch(`/api/media-assets?${q}`)
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load media', 'error')
      setLoading(false)
      return
    }
    setAssets(body.assets || [])
    setLoading(false)
  }, [typeFilter, search])

  useEffect(() => { setLoading(true); load() }, [load])

  const submitUpload = async () => {
    if (!uploadFile) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('asset_type', uploadType)
      fd.append('name', uploadName.trim() || uploadFile.name)
      fd.append('tags', uploadTags)
      if (uploadType === 'video' || uploadType === 'bumper') {
        const meta = await probeVideo(uploadFile)
        fd.append('duration_seconds', String(meta.duration_seconds))
        fd.append('width', String(meta.width))
        fd.append('height', String(meta.height))
      } else if (uploadType === 'image') {
        const meta = await probeImage(uploadFile)
        fd.append('width', String(meta.width))
        fd.append('height', String(meta.height))
      }
      const res = await fetch('/api/media-assets/upload', { method: 'POST', body: fd })
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Upload failed', 'error')
        return
      }
      toast('Asset uploaded', 'success')
      setUploadOpen(false)
      setUploadFile(null)
      setUploadName('')
      setUploadTags('')
      await load()
    } catch {
      toast('Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const saveEdit = async () => {
    if (!editAsset) return
    setSaving(true)
    const res = await fetch(`/api/media-assets/${editAsset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName.trim(),
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
      }),
    })
    const body = await res.json()
    setSaving(false)
    if (!res.ok) {
      toast(body.error || 'Save failed', 'error')
      return
    }
    toast('Saved', 'success')
    setEditAsset(null)
    await load()
  }

  const deleteAsset = async (a: AssetWithUrls) => {
    if (!confirm(`Delete "${a.name}"?`)) return
    const res = await fetch(`/api/media-assets/${a.id}`, { method: 'DELETE' })
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Delete failed', 'error')
      return
    }
    toast('Deleted', 'success')
    await load()
  }

  if (loading) return <Loader />

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="search" placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: '1 1 200px', maxWidth: '320px' }} />
        <button type="button" onClick={() => { setUploadOpen(true); setUploadFile(null); setUploadName('') }} style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
          Upload
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        {assets.map(a => (
          <div key={a.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ aspectRatio: '16/9', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {a.asset_type === 'audio_bed' ? (
                <span style={{ fontSize: '32px' }}>♪</span>
              ) : (
                <img src={a.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
            <div style={{ padding: '10px 12px' }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: text }}>{a.name}</p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: muted }}>
                {a.asset_type}
                {a.duration_seconds ? ` · ${Math.round(a.duration_seconds)}s` : ''}
                {' · '}{formatBytes(a.file_size_bytes)}
              </p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button type="button" onClick={() => { setEditAsset(a); setEditName(a.name); setEditTags((a.tags || []).join(', ')) }} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: `0.5px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                <button type="button" onClick={() => deleteAsset(a)} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {assets.length === 0 && <p style={{ color: muted, fontSize: '14px' }}>No media assets yet. Upload video, images, bumpers, or audio beds.</p>}

      {uploadOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }} onClick={() => !uploading && setUploadOpen(false)}>
          <div style={{ background: cardBg, borderRadius: '12px', padding: '20px', maxWidth: '420px', width: '100%', border: `0.5px solid ${border}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', color: text }}>Upload media</h3>
            <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '6px' }}>Type</label>
            <select value={uploadType} onChange={e => setUploadType(e.target.value)} style={{ ...inputStyle, marginBottom: '12px' }}>
              {UPLOAD_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: '13px', color: muted, marginBottom: '6px' }}>File</label>
            <div style={{ marginBottom: '12px' }}>
              <FilePickButton
              accept={uploadType === 'image' ? 'image/*' : uploadType === 'audio_bed' ? 'audio/*' : 'video/*'}
              label="Choose file"
              changeLabel="Change file"
              variant="secondary"
              fullWidth
              showFileName
              onChange={file => {
                setUploadFile(file)
                if (file && !uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ''))
              }}
            />
            </div>
            <input placeholder="Display name" value={uploadName} onChange={e => setUploadName(e.target.value)} style={{ ...inputStyle, marginBottom: '12px' }} />
            <input placeholder="Tags (comma-separated)" value={uploadTags} onChange={e => setUploadTags(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" disabled={uploading} onClick={() => setUploadOpen(false)} style={{ padding: '10px 16px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button type="button" disabled={uploading || !uploadFile} onClick={submitUpload} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#1e6cb5', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{uploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        </div>
      )}

      {editAsset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }} onClick={() => !saving && setEditAsset(null)}>
          <div style={{ background: cardBg, borderRadius: '12px', padding: '20px', maxWidth: '420px', width: '100%', border: `0.5px solid ${border}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', color: text }}>Edit asset</h3>
            <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, marginBottom: '12px' }} />
            <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="Tags" style={{ ...inputStyle, marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" disabled={saving} onClick={() => setEditAsset(null)} style={{ padding: '10px 16px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button type="button" disabled={saving} onClick={saveEdit} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#1e6cb5', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
