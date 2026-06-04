'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FilePickButton from '@/components/FilePickButton'
import { toast } from '@/lib/toast'
import type { SigAssetId } from '@/lib/sig-assets'

type SigAssetRow = {
  id: SigAssetId
  label: string
  hint: string
  filename: string
  publicPath: string
  previewUrl: string
  absoluteUrl: string | null
  updatedAt: string | null
  source: 'storage' | 'bundled'
}

type Props = {
  visible: boolean
  text: string
  muted: string
  border: string
  cardBg: string
  inputBg: string
}

export default function SignatureAssetsPanel({
  visible,
  text,
  muted,
  border,
  cardBg,
  inputBg,
}: Props) {
  const [assets, setAssets] = useState<SigAssetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadingId, setUploadingId] = useState<SigAssetId | null>(null)
  const fileRefs = useRef<Partial<Record<SigAssetId, HTMLInputElement | null>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sig-assets', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast((body as { error?: string }).error || 'Failed to load signature assets', 'error')
        return
      }
      setAssets((body as { assets?: SigAssetRow[] }).assets || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (visible) void load()
  }, [visible, load])

  const upload = async (assetId: SigAssetId) => {
    const input = fileRefs.current[assetId]
    const file = input?.files?.[0]
    if (!file) {
      toast('Choose an image file first', 'error')
      return
    }
    setUploadingId(assetId)
    try {
      const form = new FormData()
      form.set('asset_id', assetId)
      form.set('file', file)
      const res = await fetch('/api/admin/sig-assets', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast((body as { error?: string }).error || 'Upload failed', 'error')
        return
      }
      toast('Signature image updated', 'success')
      if (input) input.value = ''
      await load()
    } finally {
      setUploadingId(null)
    }
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast('URL copied', 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }

  if (!visible) return null

  return (
    <div
      style={{
        background: cardBg,
        border: `0.5px solid ${border}`,
        borderRadius: '14px',
        padding: '20px',
        marginBottom: '16px',
      }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: text, margin: '0 0 4px' }}>
        Email signature images
      </h2>
      <p style={{ fontSize: '13px', color: muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Images are hosted at <code style={{ fontSize: '12px' }}>/sig/</code> for Outlook signatures.
        After uploading, use <strong>Copy URL</strong> — it includes a version parameter so email
        clients fetch the new image. If an old image still appears in Outlook, remove the picture
        from your signature and paste the updated URL.
      </p>

      {loading && assets.length === 0 ? (
        <p style={{ fontSize: '13px', color: muted, margin: 0 }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {assets.map(asset => (
            <div
              key={asset.id}
              style={{
                border: `0.5px solid ${border}`,
                borderRadius: '12px',
                padding: '14px',
                background: inputBg,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '14px',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    flex: '0 0 auto',
                    maxWidth: '100%',
                    minHeight: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0a0a0a',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.updatedAt ? `${asset.previewUrl}?_=${encodeURIComponent(asset.updatedAt)}` : asset.previewUrl}
                    alt={asset.label}
                    style={{ maxHeight: 64, maxWidth: 280, objectFit: 'contain' }}
                  />
                </div>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: text, margin: '0 0 4px' }}>
                    {asset.label}
                  </p>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 6px', lineHeight: 1.4 }}>
                    {asset.hint}
                  </p>
                  <p style={{ fontSize: '11px', color: muted, margin: '0 0 8px', fontFamily: 'monospace' }}>
                    {asset.publicPath}
                    {asset.source === 'storage' ? ' · uploaded' : ' · bundled default'}
                    {asset.updatedAt
                      ? ` · ${new Date(asset.updatedAt).toLocaleString()}`
                      : ''}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <FilePickButton
                      inputRef={el => {
                        fileRefs.current[asset.id] = el
                      }}
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      label="Choose image"
                      changeLabel="Change image"
                      onChange={() => {}}
                    />
                    <button
                      type="button"
                      disabled={uploadingId === asset.id}
                      onClick={() => void upload(asset.id)}
                      style={{
                        fontSize: '13px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: '#1e6cb5',
                        color: '#fff',
                        border: 'none',
                        cursor: uploadingId === asset.id ? 'wait' : 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: 500,
                      }}
                    >
                      {uploadingId === asset.id ? 'Uploading…' : 'Upload'}
                    </button>
                    {asset.absoluteUrl && (
                      <button
                        type="button"
                        onClick={() => void copyUrl(asset.absoluteUrl!)}
                        style={{
                          fontSize: '13px',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          background: 'transparent',
                          color: '#5ba3e0',
                          border: `0.5px solid ${border}`,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Copy URL
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
