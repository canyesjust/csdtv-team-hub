'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from '@/lib/theme'
import Loader from '../components/Loader'
import MeetingsTab from './components/MeetingsTab'
import PeopleTab from './components/PeopleTab'
import OutputChannelsTab from './components/OutputChannelsTab'
import MediaTab from './components/MediaTab'
import TemplatesTab from './components/TemplatesTab'
import QRCodesTab from './components/QRCodesTab'
import BoardUpdateTab from './components/BoardUpdateTab'
import VotingRecordsTab from './components/VotingRecordsTab'
import BellTab from './components/BellTab'

type Tab = 'meetings' | 'people' | 'channels' | 'media' | 'templates' | 'qr' | 'email' | 'voting' | 'bell'

const VALID_TABS: Tab[] = ['meetings', 'people', 'channels', 'media', 'templates', 'qr', 'email', 'voting', 'bell']

function BoardMeetingsPageContent() {
  const { theme } = useTheme()
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab') || 'meetings'
  const tab: Tab = VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'meetings'

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const setTab = useCallback(
    (id: Tab) => {
      router.replace(`/dashboard/board-meetings?tab=${id}`, { scroll: false })
    },
    [router],
  )

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
      <p style={{ fontSize: '14px', color: muted, margin: '0 0 20px' }}>
        Agenda extraction, media library, playlists, people, output channels, board email, and voting records.
      </p>

      <div
        style={{
          display: 'flex',
          borderBottom: `0.5px solid ${border}`,
          marginBottom: '20px',
          overflowX: 'auto',
          background: cardBg,
          borderRadius: '10px 10px 0 0',
          padding: '0 6px',
        }}
      >
        {tabBtn('meetings', 'Meetings')}
        {tabBtn('people', 'People')}
        {tabBtn('channels', 'Output Channels')}
        {tabBtn('media', 'Media')}
        {tabBtn('templates', 'Templates')}
        {tabBtn('qr', 'QR codes')}
        {tabBtn('email', 'Board email')}
        {tabBtn('voting', 'Voting records')}
        {tabBtn('bell', 'Timer bell')}
      </div>

      {tab === 'meetings' && <MeetingsTab />}
      {tab === 'people' && <PeopleTab />}
      {tab === 'channels' && <OutputChannelsTab />}
      {tab === 'media' && <MediaTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'qr' && <QRCodesTab />}
      {tab === 'email' && <BoardUpdateTab />}
      {tab === 'voting' && <VotingRecordsTab />}
      {tab === 'bell' && <BellTab />}
    </div>
  )
}

export default function BoardMeetingsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh' }}>
          <Loader />
        </div>
      }
    >
      <BoardMeetingsPageContent />
    </Suspense>
  )
}
