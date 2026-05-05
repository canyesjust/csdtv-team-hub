'use client'

import { useTheme } from '@/lib/theme'

export default function StudentsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#8899bb' : '#6b7280'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: '0 0 8px' }}>Students</h1>
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 20px' }}>Student crew sign-ups, roster, and Monday class attendance.</p>
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: muted, margin: 0 }}>🛠 Building this section now — checking back shortly.</p>
      </div>
    </div>
  )
}