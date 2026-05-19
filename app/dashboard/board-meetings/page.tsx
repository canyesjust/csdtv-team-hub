'use client'

import { useState } from 'react'
import { useTheme } from '@/lib/theme'
import MeetingsTab from './components/MeetingsTab'
import PeopleTab from './components/PeopleTab'
import OutputChannelsTab from './components/OutputChannelsTab'
import MediaTab from './components/MediaTab'
import TemplatesTab from './components/TemplatesTab'

type Tab = 'meetings' | 'people' | 'channels' | 'media' | 'templates'

export default function BoardMeetingsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [tab, setTab] = useState<Tab>('meetings')
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        fontSize: '14px',
        padding: '10px 16px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: tab === id ? 'var(--brand-primary)' : muted,
        borderBottom: tab === id ? '2px solid var(--brand-primary)' : '2px solid transparent',
        fontWeight: tab === id ? 600 : 400,
        minHeight: '44px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )

  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 600, color: text, margin: '0 0 4px' }}>Board Meetings</h1>
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 8px' }}>
        Agenda extraction, media library, playlists, people, and output channels for live board broadcasts.
      </p>
      <p style={{ margin: '0 0 20px' }}>
        <a href="/dashboard/voting-records" style={{ color: 'var(--brand-primary)', fontSize: '14px' }}>Voting records →</a>
      </p>

      <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, marginBottom: '20px', overflowX: 'auto', background: cardBg, borderRadius: '10px 10px 0 0', padding: '0 6px' }}>
        {tabBtn('meetings', 'Meetings')}
        {tabBtn('people', 'People')}
        {tabBtn('channels', 'Output Channels')}
        {tabBtn('media', 'Media')}
        {tabBtn('templates', 'Templates')}
      </div>

      {tab === 'meetings' && <MeetingsTab />}
      {tab === 'people' && <PeopleTab />}
      {tab === 'channels' && <OutputChannelsTab />}
      {tab === 'media' && <MediaTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}
