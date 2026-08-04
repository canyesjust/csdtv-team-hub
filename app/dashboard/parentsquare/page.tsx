'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchEffectiveTeam } from '@/lib/effective-team-client'
import { uiStyles } from '@/lib/ui/styles'

const APPS = [
  {
    name: 'ParentSquare',
    description: 'For parents and guardians — messages, alerts, forms, and sign-ups.',
    ios: 'https://apps.apple.com/us/app/parentsquare/id908126679',
    android: 'https://play.google.com/store/apps/details?id=com.parentsquare.psapp&hl=en_US',
  },
  {
    name: 'StudentSquare',
    description: 'For students — the ParentSquare experience built for student accounts.',
    ios: 'https://apps.apple.com/us/app/studentsquare-app/id1415402057',
    android: 'https://play.google.com/store/apps/details?id=com.parentsquare.studentsquare&hl=en_US',
  },
] as const

const storeLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 10,
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
}

export default function ParentSquarePage() {
  const [isManager, setIsManager] = useState(false)

  useEffect(() => {
    fetchEffectiveTeam().then(t => setIsManager(t?.team?.role === 'Manager'))
  }, [])

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>ParentSquare</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Tools and resources for managing ParentSquare communication.
          </p>
        </div>
        {isManager && (
          <Link href="/dashboard/parentsquare/access" style={{ fontSize: 13, fontWeight: 600, color: 'var(--link)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Manage access
          </Link>
        )}
      </div>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Download the apps</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Official ParentSquare mobile apps, for sharing with families and students.
        </p>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {APPS.map(app => (
            <div key={app.name} style={{ ...uiStyles.card, padding: '20px' }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>{app.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>{app.description}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href={app.ios} target="_blank" rel="noopener noreferrer" style={storeLinkStyle}>
                  App Store
                </a>
                <a href={app.android} target="_blank" rel="noopener noreferrer" style={storeLinkStyle}>
                  Google Play
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
