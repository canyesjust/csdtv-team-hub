'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEffectiveTeam } from '@/lib/effective-team-client'
import { createClient } from '@/lib/supabase'
import { confirmDialog } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import Loader from '../components/Loader'

type ObsCategory = 'commercial' | 'scene'

type ObsAsset = {
  id: string
  category: ObsCategory
  name: string
  filename: string
  kind: 'video' | 'image' | 'scene'
  mime_type: string
  file_size_bytes: number | null
  enabled: boolean
  created_at: string
}

const COMMERCIAL_ACCEPT = 'video/mp4,video/quicktime,image/png,image/jpeg,image/webp'
const SCENE_ACCEPT = 'application/json,application/zip,application/x-zip-compressed,.json,.zip'

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export default function ObsAssetsManagePage() {
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const [tab, setTab] = useState<ObsCategory>('commercial')
  const [assets, setAssets] = useState<ObsAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const commercialInput = useRef<HTMLInputElement>(null)
  const sceneInput = useRef<HTMLInputElement>(null)

  // Manager password panel state
  const [pwStatus, setPwStatus] = useState<{ configured: boolean; source: string } | null>(null)
  const [pwInput, setPwInput] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/obs/assets', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setAssets(Array.isArray(d.assets) ? d.assets : [])
      else toast(typeof d?.error === 'string' ? d.error : 'Could not load assets', 'error')
    } catch {
      toast('Could not reach the server', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPwStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/obs/access-config', { cache: 'no-store' })
      if (res.ok) setPwStatus(await res.json())
    } catch { /* not a manager; ignore */ }
  }, [])

  useEffect(() => {
    load()
    fetchEffectiveTeam().then(t => {
      const manager = t?.team?.role === 'Manager'
      setIsManager(manager)
      if (manager) loadPwStatus()
    })
  }, [load, loadPwStatus])

  const upload = async (file: File, category: ObsCategory) => {
    setUploading(true)
    try {
      const mime = file.type || 'application/octet-stream'

      // 1. Ask the server for a signed upload URL.
      const signRes = await fetch('/api/obs/assets/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, mime, size_bytes: file.size, filename: file.name }),
      })
      const sign = await signRes.json().catch(() => ({}))
      if (!signRes.ok) { toast(sign?.error || 'Could not start upload', 'error'); return }

      // 2. Upload the file straight to storage — no serverless size limit.
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from(sign.bucket)
        .uploadToSignedUrl(sign.path, sign.token, file, { contentType: mime })
      if (upErr) { toast(upErr.message || 'Upload failed', 'error'); return }

      // 3. Record the asset.
      const finRes = await fetch('/api/obs/assets/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category, path: sign.path, mime, size_bytes: file.size,
          filename: file.name, name: file.name,
        }),
      })
      const fin = await finRes.json().catch(() => ({}))
      if (!finRes.ok) { toast(fin?.error || 'Could not save asset', 'error'); return }
      if (fin.asset) setAssets(prev => [fin.asset, ...prev])
      toast('Uploaded', 'success')
    } catch {
      toast('Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const onPick = (category: ObsCategory) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload(file, category)
    e.target.value = ''
  }

  const remove = async (asset: ObsAsset) => {
    if (!(await confirmDialog({ message: `Delete "${asset.name}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return
    const res = await fetch(`/api/obs/assets/${asset.id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast(d?.error || 'Could not delete', 'error'); return }
    setAssets(prev => prev.filter(a => a.id !== asset.id))
    toast('Deleted', 'success')
  }

  const savePassword = async () => {
    if (!pwInput.trim()) return
    setPwSaving(true)
    try {
      const res = await fetch('/api/obs/access-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwInput }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast(d?.error || 'Could not set password', 'error'); return }
      setPwInput('')
      toast('Password updated', 'success')
      loadPwStatus()
    } finally {
      setPwSaving(false)
    }
  }

  const clearPassword = async () => {
    if (!(await confirmDialog({ message: 'Remove the shared password? The page will fall back to the env var (or become open).', tone: 'danger', confirmLabel: 'Remove' }))) return
    const res = await fetch('/api/obs/access-config', { method: 'DELETE' })
    if (!res.ok) { toast('Could not clear password', 'error'); return }
    toast('Password removed', 'success')
    loadPwStatus()
  }

  const filtered = assets.filter(a => a.category === tab)
  const inputRef = tab === 'commercial' ? commercialInput : sceneInput

  const tabBtn = (value: ObsCategory): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    border: `0.5px solid ${tab === value ? 'var(--brand-primary)' : border}`,
    background: tab === value ? 'var(--brand-primary)' : cardBg,
    color: tab === value ? '#fff' : muted,
  })

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: text, margin: 0 }}>OBS assets</h1>
        <p style={{ fontSize: 14, color: muted, margin: '4px 0 0' }}>
          Manage the commercials and scenes that operators download from the public <span style={{ fontFamily: 'ui-monospace, monospace' }}>/obs</span> page.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabBtn('commercial')} onClick={() => setTab('commercial')}>Commercials</button>
        <button style={tabBtn('scene')} onClick={() => setTab('scene')}>Scenes</button>
      </div>

      {/* Upload */}
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <input ref={commercialInput} type="file" accept={COMMERCIAL_ACCEPT} style={{ display: 'none' }} onChange={onPick('commercial')} />
        <input ref={sceneInput} type="file" accept={SCENE_ACCEPT} style={{ display: 'none' }} onChange={onPick('scene')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.7 : 1 }}
          >
            {uploading ? 'Uploading…' : `+ Upload ${tab === 'commercial' ? 'commercial' : 'scene'}`}
          </button>
          <span style={{ fontSize: 12.5, color: muted }}>
            {tab === 'commercial'
              ? 'MP4/MOV video (≤ 1 GB) or PNG/JPEG/WebP image (≤ 50 MB).'
              : '.json or .zip scene collection (≤ 50 MB).'}
          </span>
        </div>
      </div>

      {/* Asset list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: 12 }}>
          <p style={{ fontSize: 15, color: muted, margin: 0 }}>No {tab === 'commercial' ? 'commercials' : 'scenes'} yet.</p>
        </div>
      ) : (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((asset, i) => (
            <div key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : `0.5px solid ${border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: muted }}>
                  {asset.kind}{asset.file_size_bytes ? ` · ${formatBytes(asset.file_size_bytes)}` : ''} · {asset.filename}
                </p>
              </div>
              <button
                onClick={() => remove(asset)}
                style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 8, border: `0.5px solid ${border}`, background: 'transparent', color: 'var(--status-danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Manager: shared page password */}
      {isManager && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16, marginTop: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: text, margin: '0 0 6px' }}>Shared page password</h2>
          <p style={{ fontSize: 12.5, color: muted, margin: '0 0 12px' }}>
            Controls access to the public <span style={{ fontFamily: 'ui-monospace, monospace' }}>/obs</span> page.
            {pwStatus ? (pwStatus.configured ? ` Currently set (${pwStatus.source}).` : ' Not set — the page is open.') : ''}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="password"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              placeholder="New password (min 8 chars)"
              style={{ flex: 1, minWidth: 200, background: inputBg, border: `0.5px solid ${border}`, borderRadius: 8, padding: '9px 12px', fontSize: 14, color: text, fontFamily: 'inherit', outline: 'none' }}
            />
            <button
              onClick={savePassword}
              disabled={pwSaving || pwInput.trim().length < 8}
              style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: pwSaving || pwInput.trim().length < 8 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: pwSaving || pwInput.trim().length < 8 ? 0.6 : 1 }}
            >
              {pwSaving ? 'Saving…' : 'Set password'}
            </button>
            {pwStatus?.configured && pwStatus.source === 'database' && (
              <button
                onClick={clearPassword}
                style={{ padding: '9px 16px', borderRadius: 8, background: 'transparent', color: 'var(--status-danger)', border: `0.5px solid ${border}`, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
