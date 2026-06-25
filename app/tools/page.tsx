import Link from 'next/link'
import type { Metadata } from 'next'
import { PUBLIC_TOOLS } from '@/lib/public-tools'

export const metadata: Metadata = {
  title: 'Tools',
  description: 'Free tools and resources from Canyons School District.',
}

const c = {
  bg: '#f8f9fc',
  card: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  text: '#1a1f36',
  muted: '#6b7280',
}

export default function ToolsPage() {
  return (
    <div style={{ background: c.bg, minHeight: '100vh', color: c.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 72px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>Tools</h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: c.muted }}>Free tools and resources from Canyons School District.</p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {PUBLIC_TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', background: c.card, border: `1px solid ${c.border}`, borderLeft: `5px solid ${t.accent}`, borderRadius: 14, padding: '20px 22px' }}
            >
              <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{t.title}</span>
              <span style={{ fontSize: 14, color: c.muted, marginTop: 8, lineHeight: 1.5, flex: 1 }}>{t.description}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.accent, marginTop: 16 }}>Open {'→'}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
