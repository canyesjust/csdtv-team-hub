'use client'

import { useCallback, useEffect, useState } from 'react'
import FilePickButton from '@/components/FilePickButton'
import Loader from '../../components/Loader'
import { createBrowserClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { playBell, BELL_OPTIONS, type BellChoice } from '@/lib/play-bell'

export default function BellTab() {
  const [choice, setChoice] = useState<BellChoice>('classic')
  const [customUrl, setCustomUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/board/bell')
      const b = await res.json()
      setChoice((b.choice as BellChoice) || 'classic')
      setCustomUrl(b.custom_url ?? null)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { setLoading(true); void load() }, [load])

  const save = async (nextChoice: BellChoice, nextUrl: string | null) => {
    setSaving(true)
    const res = await fetch('/api/board/bell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: nextChoice, custom_url: nextUrl }),
    })
    const b = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast(b.error || 'Could not save bell', 'error'); return }
    setChoice(nextChoice)
    toast('Bell saved', 'success')
  }

  const uploadCustom = async (file: File) => {
    setUploading(true)
    try {
      const mime = file.type || 'audio/mpeg'
      const signRes = await fetch('/api/media-assets/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_type: 'audio_bed', filename: file.name, mime, size_bytes: file.size }),
      })
      const sign = await signRes.json()
      if (!signRes.ok) { toast(sign.error || 'Upload failed', 'error'); return }
      const supabase = createBrowserClient()
      const { error: upErr } = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType: mime })
      if (upErr) { toast(upErr.message || 'Upload failed', 'error'); return }
      const finRes = await fetch('/api/media-assets/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: sign.path, asset_type: 'audio_bed', name: file.name, filename: file.name, mime, size_bytes: file.size }),
      })
      const fin = await finRes.json()
      if (!finRes.ok) { toast(fin.error || 'Upload failed', 'error'); return }
      const url = fin.asset.public_url as string
      setCustomUrl(url)
      await save('custom', url)
    } catch {
      toast('Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <Loader />

  const optionStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    padding: '14px 16px', borderRadius: '10px', marginBottom: '10px',
    border: `1px solid ${active ? 'var(--brand-primary)' : border}`,
    background: active ? 'rgba(31,108,180,0.08)' : cardBg,
  })

  return (
    <div style={{ maxWidth: '560px' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: text }}>Timer bell</h3>
      <p style={{ margin: '0 0 18px', fontSize: '13px', color: muted }}>
        The sound that plays on the dais and the operator console when a timer reaches zero. Press Test to hear one, then Use it.
      </p>

      {BELL_OPTIONS.map(opt => {
        const active = choice === opt.value
        return (
          <div key={opt.value} style={optionStyle(active)}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: text }}>{opt.label}{active && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--brand-primary)' }}>· current</span>}</div>
              <div style={{ fontSize: '12px', color: muted }}>{opt.description}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => playBell({ choice: opt.value })}
                style={{ fontSize: 13, padding: '7px 12px', minHeight: 36, borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Test</button>
              <button type="button" disabled={saving || active} onClick={() => void save(opt.value, customUrl)}
                style={{ fontSize: 13, padding: '7px 12px', minHeight: 36, borderRadius: 8, border: 'none', background: active ? 'transparent' : 'var(--brand-primary)', color: active ? muted : '#fff', cursor: active ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>{active ? 'In use' : 'Use'}</button>
            </div>
          </div>
        )
      })}

      <div style={optionStyle(choice === 'custom')}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: text }}>Your own sound{choice === 'custom' && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--brand-primary)' }}>· current</span>}</div>
          <div style={{ fontSize: '12px', color: muted }}>{customUrl ? 'Custom sound uploaded' : 'Upload an MP3 or WAV'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {customUrl && (
            <button type="button" onClick={() => playBell({ choice: 'custom', customUrl })}
              style={{ fontSize: 13, padding: '7px 12px', minHeight: 36, borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: text, cursor: 'pointer', fontFamily: 'inherit' }}>Test</button>
          )}
          <FilePickButton accept="audio/*" disabled={uploading} variant="secondary" showFileName={false}
            onChange={f => { if (f) void uploadCustom(f) }}
            label={uploading ? 'Uploading…' : customUrl ? 'Replace' : 'Upload'}
            changeLabel={uploading ? 'Uploading…' : 'Replace'} />
          {customUrl && choice !== 'custom' && (
            <button type="button" disabled={saving} onClick={() => void save('custom', customUrl)}
              style={{ fontSize: 13, padding: '7px 12px', minHeight: 36, borderRadius: 8, border: 'none', background: 'var(--brand-primary)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Use</button>
          )}
        </div>
      </div>
    </div>
  )
}
