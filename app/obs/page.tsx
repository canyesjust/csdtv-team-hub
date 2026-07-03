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
  navy: '#0a2c52',
  blue: '#1c6aa8',
  gold: '#fbae42',
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

function AssetList({ category, title, emptyLabel, note }: { category: 'commercial' | 'scene'; title: string; emptyLabel: string; note?: string }) {
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
      {note ? <p style={{ margin: '6px 0 0', fontSize: 12.5, color: colors.muted, lineHeight: 1.5 }}>{note}</p> : null}
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
const qStyle: CSSProperties = { margin: '16px 0 4px', fontSize: 14.5, fontWeight: 700, color: colors.text }
const aStyle: CSSProperties = { margin: '0 0 6px', fontSize: 14, lineHeight: 1.6, color: colors.muted }

export default function ObsAssetsPage() {
  return (
    <div style={{ background: colors.bg, minHeight: '100vh', color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <header style={{ background: `linear-gradient(100deg, ${colors.navy}, ${colors.blue})`, borderRadius: 16, padding: '26px 26px 22px', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.16)', color: colors.gold, fontWeight: 800, fontSize: 17, letterSpacing: 0.5 }}>▶</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 }}>CSDtv Broadcast</p>
              <h1 style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>OBS Ad Controller Setup</h1>
            </div>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.55, opacity: 0.95 }}>
            Everything to run commercials in OBS: download the controller and the commercials, follow the steps, and you&apos;re on air. Takes about 15 minutes.
          </p>
        </header>

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
        <AssetList category="scene" title="3. Scenes" emptyLabel="No scenes have been uploaded yet." note="Scene collections are starting templates. Their media and source paths point at the machine they came from, so after importing one in OBS you'll usually need to re-point sources to this computer's files." />

        {/* Setup steps */}
        <section style={{ background: colors.cardBg, border: `1px solid ${colors.line}`, borderRadius: 14, padding: '20px 22px', marginTop: 18 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>4. Setup</h2>
          <p style={stepStyle}><strong>1. Install Node.js.</strong> Download the macOS Installer (.pkg) from <span style={codeStyle}>nodejs.org</span> and click through to Finish. The controller needs it. Do <strong>not</strong> use nvm; a double-clicked launcher can&apos;t find nvm-installed Node. Use the plain .pkg installer.</p>
          <p style={stepStyle}><strong>2. Unzip the controller</strong> somewhere permanent, like Documents. Don&apos;t leave it in Downloads.</p>
          <p style={stepStyle}><strong>3. Add the OBS sources.</strong> In your OBS scene, create three sources named exactly <span style={codeStyle}>Commercials</span> (media source, videos), <span style={codeStyle}>CommercialsImage</span> (image source, image ads), and <span style={codeStyle}>StartingSoon</span> (media source, the pre-show slate). Leave their files empty. Put <span style={codeStyle}>StartingSoon</span> below the two Commercials sources so ads cover it.</p>
          <p style={stepStyle}><strong>4. Turn on the OBS WebSocket.</strong> In OBS go to <span style={codeStyle}>Tools → WebSocket Server Settings</span>, check <span style={codeStyle}>Enable WebSocket Server</span>, keep the port at <span style={codeStyle}>4455</span>, and set the password to <strong>the same password you used to open this page</strong>. (Ask Justin if you&apos;re not sure.)</p>
          <p style={stepStyle}><strong>5. Put that password in the config.</strong> Open <span style={codeStyle}>config.json</span> in the controller folder and type the same password between the quotes on the <span style={codeStyle}>&quot;password&quot;</span> line. It&apos;s the one password used everywhere here. While you&apos;re in there, make sure <span style={codeStyle}>&quot;scene&quot;</span> matches your actual OBS scene name (it ships as <span style={codeStyle}>Live</span>), or ads load but stay hidden.</p>
          <p style={stepStyle}><strong>6. Run the controller.</strong> Double-click <strong>CSDtv Ad Controller</strong> (the app with the CSDtv icon). It starts in the background and opens the Ad Control panel in your browser. No Terminal. To stop it later, quit the app. The first time, macOS blocks it because the app isn&apos;t signed by Apple, see <em>&ldquo;macOS says it can&apos;t verify the app&rdquo;</em> below to clear it.</p>
          <p style={stepStyle}><strong>7. Add the Ad Control dock.</strong> In OBS choose <span style={codeStyle}>Docks → Custom Browser Docks</span> and add one pointing to <span style={codeStyle}>http://127.0.0.1:4466</span>.</p>
          <p style={{ ...stepStyle, marginBottom: 0 }}><strong>8. Load the commercials.</strong> In the Ad Control dock, click <strong>Download missing</strong> and every commercial drops straight into the <span style={codeStyle}>ads</span> folder. No downloading and moving files by hand. Run it again anytime to pick up new ones. For the pre-show, put your starting-soon video in the <span style={codeStyle}>preshow</span> folder and click <strong>Reload folder</strong>.</p>
        </section>

        {/* Troubleshooting */}
        <section style={{ background: colors.cardBg, border: `1px solid ${colors.line}`, borderRadius: 14, padding: '20px 22px', marginTop: 18, marginBottom: 40 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>5. If something goes wrong</h2>

          <p style={qStyle}>The launcher says Node isn&apos;t installed, but I installed it</p>
          <p style={aStyle}>Open Terminal and run <span style={codeStyle}>which node</span>. If it prints nothing, Node didn&apos;t install, or you used nvm. Reinstall with the <strong>.pkg</strong> from nodejs.org and open a fresh Terminal. If it prints a path, quit the app and open it again.</p>

          <p style={qStyle}>macOS says it can&apos;t verify the app</p>
          <p style={aStyle}>If you see &ldquo;Apple could not verify CSDtv Ad Controller is free of malware,&rdquo; that&apos;s just because the app isn&apos;t signed by Apple, not an actual problem. Click <strong>Done</strong> (not Move to Trash). Open the Apple menu → <strong>System Settings → Privacy &amp; Security</strong>, scroll to the Security section, and click <strong>Open Anyway</strong> next to the CSDtv Ad Controller message. Authenticate, then click <strong>Open</strong>. It launches normally after that. You only do this once per Mac.</p>
          <p style={aStyle}>Comfortable with Terminal? This does the same thing in one step, point it at wherever you unzipped the folder: <span style={codeStyle}>xattr -dr com.apple.quarantine &quot;/path/to/csdtv-obs-controller/CSDtv Ad Controller.app&quot;</span></p>

          <p style={qStyle}>The panel says &quot;OBS offline&quot;</p>
          <p style={aStyle}>Make sure OBS is running and the WebSocket server is enabled. Confirm the port is <span style={codeStyle}>4455</span> and that the password in <span style={codeStyle}>config.json</span> exactly matches the OBS Server Password. A mismatched password is the most common cause. Ask Justin to confirm the password.</p>

          <p style={qStyle}>It says &quot;Connected to OBS&quot; but no ad appears</p>
          <p style={aStyle}>Check the source names are exactly <span style={codeStyle}>Commercials</span>, <span style={codeStyle}>CommercialsImage</span>, and <span style={codeStyle}>StartingSoon</span>. Check that <span style={codeStyle}>&quot;scene&quot;</span> in <span style={codeStyle}>config.json</span> matches your real scene name, and that the sources are in that scene and not hidden.</p>

          <p style={qStyle}>An image ad shows blank</p>
          <p style={aStyle}>Confirm you added the <span style={codeStyle}>CommercialsImage</span> image source.</p>

          <p style={qStyle}>A commercial won&apos;t show up in the list</p>
          <p style={aStyle}>Make sure the file is in the <span style={codeStyle}>ads</span> folder and click <strong>Reload folder</strong>. Videos should be <span style={codeStyle}>.mp4</span> or <span style={codeStyle}>.mov</span>; images <span style={codeStyle}>.png</span> or <span style={codeStyle}>.jpg</span>.</p>

          <p style={qStyle}>Starting Soon won&apos;t start</p>
          <p style={aStyle}>Put a video in the <span style={codeStyle}>preshow</span> folder and click <strong>Reload folder</strong>. The panel says when a starting-soon video is ready.</p>

          <p style={{ ...qStyle }}>The panel and OBS look out of sync</p>
          <p style={{ ...aStyle, marginBottom: 0 }}>They resync within a second. If not, right-click the browser source in OBS → Refresh.</p>
        </section>
      </div>
    </div>
  )
}
