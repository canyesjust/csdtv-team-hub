'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import KnowledgeArticlesTab from './components/KnowledgeArticlesTab'
import QuickLinksTab from './components/QuickLinksTab'
import Loader from '../components/Loader'

type LibraryTab = 'articles' | 'links'

function tabFromParams(searchParams: URLSearchParams): LibraryTab {
  return searchParams.get('tab') === 'links' ? 'links' : 'articles'
}

function LibraryPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlTab = tabFromParams(searchParams)
  const [activeTab, setActiveTab] = useState<LibraryTab>(urlTab)

  useEffect(() => {
    setActiveTab(urlTab)
  }, [urlTab])

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const switchTab = useCallback(
    (next: LibraryTab) => {
      setActiveTab(next)
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', next)
      if (next === 'links') params.delete('article')
      router.replace(`/dashboard/library?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const tabBtn = (id: LibraryTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => switchTab(id)}
      style={{
        fontSize: '14px',
        padding: '10px 16px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: activeTab === id ? 'var(--brand-primary)' : muted,
        borderBottom: activeTab === id ? '2px solid var(--brand-primary)' : '2px solid transparent',
        fontWeight: activeTab === id ? 600 : 400,
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

      {activeTab === 'articles' ? <KnowledgeArticlesTab /> : <QuickLinksTab />}
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
