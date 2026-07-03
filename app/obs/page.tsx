'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'

const colors = {
  bg: '#f8f9fc',
  cardBg: '#ffffff',
  line: '#d3d6dd',
  text: '#1a1f36',
  muted: '#6b7280',
  info: '#185fa5',
  ok: '#1a7f37',
}

type ObsAsset = {
  id: string
  category: 'commercial' | 'scene'
  name: string
  filename: string
  kind: 'video' | 'image' | 'scene'
  mime_type: string
  file_size_bytes: number | null
  enabled: boolean
  created_at: string
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function AssetList({ category, title, emptyLabel }: { category: 'commercial' | 'scene'; title: string; emptyLabel: string }) {
  const [assets, setAssets] = useState<ObsAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/obs/assets?category=${category}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setAssets(Array.isArray(d.assets) ? d.assets : [])
      else setError(typeof d?.error === 'string' ? d.error : 'Could not load files.')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => { load() }, [load])

  const download = async (asset: ObsAsset) => {
    setDownloadingId(asset.id)
    try {
      const res = await fetch(`/api/obs/assets/${asset.id}/download`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (res.ok && typeof d.url === 'string') {
        const a = document.createElement('a')
        a.href = d.url
        a.download = asset.filename || asset.name
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        alert(typeof d?.error === 'string' ? d.error : 'Could not start the download.')
      }
    } catch {
      alert('Could not reach the server.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section style={{ background: colors.cardBg, border: `1px solid ${colors.line}`, borderRadius: 14, padding: '20px 22px', marginTop: 18 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2>
      {loading ? (
        <p style={{ margin: '14px 0 0', fontSize: 14, color: colors.muted }}>Loading…</p>
      ) : error ? (
        <p style={{ margin: '14px 0 0', fontSize: 14, color: '#a4161a' }}>{error}</p>
      ) : assets.length === 0 ? (
        <p style={{ margin: '14px 0 0', fontSize: 14, color: colors.muted }}>{emptyLabel}</p>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assets.map(asset => (
            <div key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: `1px solid ${colors.line}`, borderRadius: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: colors.muted }}>
                  {asset.kind}{asset.file_size_bytes ? ` · ${formatBytes(asset.file_size_bytes)}` : ''}
                </p>
              </div>
              <button
                onClick={() => download(asset)}
                disabled={downloadingId === asset.id}
                style={{ flexShrink: 0, height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${colors.info}`, background: colors.info, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: downloadingId === asset.id ? 'default' : 'pointer', opacity: downloadingId === asset.id ? 0.6 : 1 }}
              >
                {downloadingId === asset.id ? 'Preparing…' : 'Download'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const stepStyle: CSSProperties = { margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, color: colors.text }
const codeStyle: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, background: '#eef1f6', padding: '1px 6px', borderRadius: 5 }

export default function ObsAssetsPage() {
  return (
    <div style={{ background: colors.bg, minHeight: '100vh', color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>CSDtv OBS Assets</h1>
        <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.55, color: colors.muted }}>
          Download the OBS controller, commercials, and scene files for the CSDtv broadcast setup.
        </p>

        {/* Controller download */}
        <section style={{ background: colors.cardBg, border: `1px solid ${colors.line}`, borderRadius: 14, padding: '20px 22px', marginTop: 22 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>1. Controller</h2>
          <p style={{ margin: '8px 0 14px', fontSize: 14, color: colors.muted, lineHeight: 1.55 }}>
            The controller runs the Ad Control dock that plays commercials and switches scenes inside OBS.
          </p>
          <a
            href="/csdtv-obs-controller.zip"
            download
            style={{ display: 'inline-block', height: 42, lineHeight: '42px', padding: '0 18px', borderRadius: 10, border: `1px solid ${colors.ok}`, background: colors.ok, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
          >
            Download controller (.zip)
          </a>
        </section>

        {/* Asset lists */}
        <AssetList category="commercial" title="2. Commercials" emptyLabel="No commercials have been uploaded yet." />
        <AssetList category="scene" title="3. Scenes" emptyLabel="No scenes have been uploaded yet." />

        {/* Setup steps */}
        <section style={{ background: colors.cardBg, border: `1px solid ${colors.line}`, borderRadius: 14, padding: '20px 22px', marginTop: 18, marginBottom: 40 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>4. Setup</h2>
          <p style={stepStyle}><strong>1. Install Node.js.</strong> Download and install the LTS build from <span style={codeStyle}>nodejs.org</span>. The controller needs it to run.</p>
          <p style={stepStyle}><strong>2. Add the OBS sources.</strong> In your OBS scene, create three sources named exactly <span style={codeStyle}>Commercials</span> (media source for videos), <span style={codeStyle}>CommercialsImage</span> (image source for image ads), and <span style={codeStyle}>StartingSoon</span> (the pre-show slate).</p>
          <p style={stepStyle}><strong>3. Turn on the OBS WebSocket.</strong> In OBS go to <span style={codeStyle}>Tools → WebSocket Server Settings</span>, enable the server, and set a password. Ask Justin for the password to match the controller config.</p>
          <p style={stepStyle}><strong>4. Run the launcher.</strong> Unzip the controller and double-click the launcher. It starts the local Ad Control server.</p>
          <p style={{ ...stepStyle, marginBottom: 0 }}><strong>5. Add the Ad Control dock.</strong> In OBS choose <span style={codeStyle}>Docks → Custom Browser Docks</span> and add a dock pointing to <span style={codeStyle}>http://127.0.0.1:4466</span>. Use it to play commercials, jump to a specific ad, and toggle the Starting Soon slate.</p>
        </section>
      </div>
    </div>
  )
}
