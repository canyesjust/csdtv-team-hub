'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from '@/lib/theme'
import KnowledgeArticlesTab from './components/KnowledgeArticlesTab'
import QuickLinksTab from './components/QuickLinksTab'
import Loader from '../components/Loader'

type LibraryTab = 'articles' | 'links'

function LibraryPageContent() {
  const { theme } = useTheme()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab: LibraryTab = searchParams.get('tab') === 'links' ? 'links' : 'articles'

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const setTab = useCallback(
    (next: LibraryTab) => {
      const params = new URLSearchParams()
      params.set('tab', next)
      router.replace(`/dashboard/library?${params.toString()}`, { scroll: false })
    },
    [router],
  )

  const tabBtn = (id: LibraryTab, label: string) => (
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
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: 0 }}>Library</h1>
        <p style={{ fontSize: '15px', color: muted, margin: '4px 0 0' }}>
          Team articles and external quick links
        </p>
      </div>

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
        {tabBtn('articles', 'Articles')}
        {tabBtn('links', 'Quick links')}
      </div>

      {tab === 'articles' ? <KnowledgeArticlesTab /> : <QuickLinksTab />}
    </div>
  )
}

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <Loader />
        </div>
      }
    >
      <LibraryPageContent />
    </Suspense>
  )
}
