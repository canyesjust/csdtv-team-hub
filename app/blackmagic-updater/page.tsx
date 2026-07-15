import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blackmagic Update Checker',
  description:
    'Free desktop app that checks which Blackmagic Design software is installed on your Mac or PC, compares it against the current release, and links you straight to the download.',
}

export const dynamic = 'force-dynamic'

const c = {
  bg: '#f8f9fc',
  card: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  text: '#1a1f36',
  muted: '#6b7280',
  accent: '#0e1116',
  green: '#1a7f37',
  amber: '#8a5a00',
}

const GH = 'https://github.com/canyesjust/csdtv-team-hub/releases/latest/download'
const DOWNLOAD_MAC = `${GH}/Blackmagic-Update-Checker-macOS.zip`
const DOWNLOAD_WIN = `${GH}/Blackmagic-Update-Checker-Windows.zip`
const DOWNLOAD_SRC = '/downloads/blackmagic-update-checker.zip'

type CatalogProduct = {
  name: string
  family?: string
  latest?: { windows?: string; macos?: string }
  latest_beta?: string
  verified?: boolean
}

type Catalog = {
  _updated?: string
  _source?: string
  products?: CatalogProduct[]
}

async function getCatalog(): Promise<Catalog | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL
  if (!base) return null
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/catalog`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as Catalog
  } catch {
    return null
  }
}

export default async function BlackmagicUpdaterPage() {
  const catalog = await getCatalog()
  const products = catalog?.products ?? []

  return (
    <div style={{ background: c.bg, minHeight: '100vh', color: c.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px 24px 72px' }}>
        <header style={{ marginBottom: 20 }}>
          <a href="/tools" style={{ fontSize: 14, color: c.muted, textDecoration: 'none' }}>← Tools</a>
          <h1 style={{ margin: '10px 0 0', fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>Blackmagic Update Checker</h1>
          <p style={{ margin: '10px 0 0', fontSize: 16, color: c.muted, lineHeight: 1.5 }}>
            A small desktop app that finds the Blackmagic Design software installed on your Mac or PC, tells you what&apos;s
            out of date, and links you straight to the right download.
          </p>
        </header>

        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: '22px 24px', marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Download</div>
          <div style={{ fontSize: 14, color: c.muted, marginTop: 4 }}>Free. Pick your platform, unzip, and open the app.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <a
              href={DOWNLOAD_MAC}
              style={{ background: c.accent, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '12px 20px', borderRadius: 10, whiteSpace: 'nowrap' }}
            >
              Download for macOS
            </a>
            <a
              href={DOWNLOAD_WIN}
              style={{ background: c.accent, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '12px 20px', borderRadius: 10, whiteSpace: 'nowrap' }}
            >
              Download for Windows
            </a>
          </div>
          <div style={{ fontSize: 13, color: c.muted, marginTop: 14, lineHeight: 1.5 }}>
            First launch, the app is unsigned. On macOS, right-click it and choose <strong>Open</strong>. On Windows, if
            SmartScreen warns, click <strong>More info → Run anyway</strong>. Prefer the raw script or want to build it
            yourself? <a href={DOWNLOAD_SRC} style={{ color: c.text }}>Download the source</a>.
          </div>
        </div>

        <Section title="What it does">
          <p style={p}>
            Blackmagic ships a lot of separate apps and drivers: DaVinci Resolve, Desktop Video, ATEM Software Control,
            Camera Setup, HyperDeck, Videohub, and more. Keeping them current across a fleet of machines is tedious. This
            app scans your computer, reads the version of each Blackmagic product it finds, and compares it to the latest
            release. Anything outdated is flagged, and one click opens the correct download page.
          </p>
        </Section>

        <Section title="How to run it">
          <p style={p}>
            Unzip the download, then:
          </p>
          <p style={p}>
            <strong>macOS</strong> — open Terminal, drag the folder in to <code style={code}>cd</code> to it, and run{' '}
            <code style={code}>python3 blackmagic_updater.py</code>.
          </p>
          <p style={p}>
            <strong>Windows</strong> — double-click <code style={code}>blackmagic_updater.py</code>, or run{' '}
            <code style={code}>py blackmagic_updater.py</code> from Command Prompt.
          </p>
          <p style={{ ...p, color: c.muted }}>
            The <code style={code}>build</code> folder has scripts to turn it into a signed double-click app (.app / .exe)
            for wider distribution. See <code style={code}>BUILD.md</code> inside the download.
          </p>
        </Section>

        <Section title="How it stays current">
          <p style={p}>
            The app doesn&apos;t rely on a version list someone has to maintain. It pulls a live catalog from this site,
            which reads Blackmagic&apos;s own download feed and always returns the current release for each product. When
            Blackmagic ships an update, the app sees it automatically.
          </p>
          <p style={{ ...p, color: c.muted }}>
            Downloads open on blackmagicdesign.com, where Blackmagic requires a short registration form before the file is
            served. The app takes you to the right page; you grab the file there.
          </p>
        </Section>

        {products.length > 0 && (
          <Section title="Current versions (live)">
            <p style={{ ...p, color: c.muted, marginBottom: 14 }}>
              Pulled just now from the catalog{catalog?._updated ? ` · updated ${catalog._updated}` : ''}.
            </p>
            <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden', background: c.card }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: c.muted }}>
                    <th style={th}>Product</th>
                    <th style={th}>Latest</th>
                    <th style={th}>Beta</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod, i) => {
                    const latest = prod.latest?.macos || prod.latest?.windows || '—'
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${c.border}` }}>
                        <td style={td}>{prod.name}</td>
                        <td style={{ ...td, fontWeight: 700 }}>
                          {latest}
                          {prod.verified === false && <span style={{ color: c.amber }}> ?</span>}
                        </td>
                        <td style={{ ...td, color: c.muted }}>{prod.latest_beta || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>{title}</h2>
      {children}
    </section>
  )
}

const p: React.CSSProperties = { margin: '0 0 10px', fontSize: 15, lineHeight: 1.6 }
const code: React.CSSProperties = { background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 5, fontSize: 13.5 }
const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, fontSize: 13 }
const td: React.CSSProperties = { padding: '10px 14px' }
