'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Editor } from '@tiptap/react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../../components/Loader'
import { isStudentInternRole } from '@/lib/roles'
import { stripArticleHtml } from '@/lib/sanitize-article-html'
import KnowledgeArticlesImportModal from './KnowledgeArticlesImportModal'
import ArticleBody from './ArticleBody'
import { downloadArticlesExport, mapArticlesForExport } from '@/lib/library/kb-export'
import { fetchKnowledgeBaseArticles, type KbArticleWithAuthors } from '@/lib/library/kb-articles'
import { printLibraryArticle } from '@/lib/library/print-article'
import { toast } from '@/lib/toast'

function ArticleEditorShell() {
  return (
    <div
      className="tiptap-editor"
      style={{
        minHeight: '280px',
        padding: '14px 16px',
        boxSizing: 'border-box',
      }}
      aria-hidden
    >
      <div
        style={{
          height: '14px',
          width: '72%',
          borderRadius: '6px',
          background: 'var(--surface-3)',
          marginBottom: '10px',
          opacity: 0.5,
        }}
      />
      <div
        style={{
          height: '14px',
          width: '88%',
          borderRadius: '6px',
          background: 'var(--surface-3)',
          marginBottom: '10px',
          opacity: 0.35,
        }}
      />
      <div
        style={{
          height: '14px',
          width: '54%',
          borderRadius: '6px',
          background: 'var(--surface-3)',
          opacity: 0.35,
        }}
      />
    </div>
  )
}

const ArticleRichEditor = dynamic(() => import('../../components/ArticleRichEditor'), {
  ssr: false,
  loading: ArticleEditorShell,
})

type Article = KbArticleWithAuthors

interface CurrentUser { id: string; name: string; role: string }

const CATEGORIES = ['Process', 'Reference', 'Policy', 'Workflow', 'Other']
const CAT_STYLES: Record<string, { bg: string; color: string }> = {
  Process:   { bg: 'rgba(30,108,181,0.12)',  color: '#5ba3e0' },
  Reference: { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8' },
  Policy:    { bg: 'rgba(155,133,224,0.12)', color: '#9b85e0' },
  Workflow:  { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  Other:     { bg: 'rgba(232,160,32,0.12)',  color: '#e8a020' },
}

function formatArticleDate(value: string | null | undefined): string {
  if (!value) return 'Unknown date'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const STARTER_ARTICLES = [
  { title: 'Livestream setup process', category: 'Process', content: '<p>Step by step guide for setting up a livestream...</p>' },
  { title: 'Board meeting workflow', category: 'Workflow', content: '<p>Complete board meeting production checklist and workflow...</p>' },
  { title: 'Equipment checkout policy', category: 'Policy', content: '<p>Rules and procedures for checking out equipment...</p>' },
]

export default function KnowledgeArticlesTab() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [articles, setArticles] = useState<Article[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [selected, setSelected] = useState<Article | null>(null)
  const [editing, setEditing] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title: '', category: 'Process' })
  const [showMobileDetail, setShowMobileDetail] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [composeInitialHtml, setComposeInitialHtml] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const syncArticlesUrl = useCallback(
    (patch: (params: URLSearchParams) => void) => {
      if (!isMountedRef.current) return
      // Read live URL so a stale closure cannot overwrite tab=links after the user switches tabs.
      const params = new URLSearchParams(window.location.search)
      if (params.get('tab') === 'links') return
      params.set('tab', 'articles')
      patch(params)
      router.replace(`/dashboard/library?${params.toString()}`, { scroll: false })
    },
    [router],
  )

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  const beginCompose = useCallback(
    (opts: { title: string; category: string; content: string; mode: 'new' | 'edit' }) => {
      setEditor(null)
      setComposeInitialHtml(opts.content)
      setEditorKey((k) => k + 1)
      setForm({ title: opts.title, category: opts.category })
      setSaveError('')
      if (opts.mode === 'new') {
        setShowNew(true)
        setSelected(null)
        setEditing(false)
        syncArticlesUrl((params) => params.delete('article'))
      } else {
        setEditing(true)
        setShowNew(false)
        const id = selected?.id
        syncArticlesUrl((params) => {
          if (id) params.set('article', id)
        })
      }
      setShowMobileDetail(true)
    },
    [syncArticlesUrl, selected],
  )

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [articlesResult, userRes] = await Promise.all([
      fetchKnowledgeBaseArticles(supabase),
      supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single(),
    ])
    if (articlesResult.error) {
      console.error('Failed to load knowledge_base', articlesResult.error)
      toast(`Could not load articles: ${articlesResult.error}`, 'error')
    } else {
      setArticles(articlesResult.data)
    }
    setCurrentUser(userRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const articleId = searchParams.get('article')
    if (!articleId || articles.length === 0) return
    const match = articles.find(a => a.id === articleId)
    if (match) {
      setSelected(match)
      setShowMobileDetail(true)
    }
  }, [articles, searchParams])

  const saveArticle = async () => {
    const htmlContent = editor?.getHTML() || ''
    const isEmpty = htmlContent === '<p></p>' || htmlContent.trim() === ''
    if (!form.title || isEmpty || !currentUser) return
    setSaveError('')
    const savedId = editing && selected ? selected.id : null

    if (editing && selected) {
      const { error } = await supabase.from('knowledge_base')
        .update({ title: form.title, content: htmlContent, category: form.category, updated_at: new Date().toISOString(), updated_by: currentUser.id })
        .eq('id', selected.id)
      if (error) { setSaveError('Failed to save article. Please try again.'); return }
    } else {
      const { error } = await supabase.from('knowledge_base')
        .insert({ title: form.title, content: htmlContent, category: form.category, created_by: currentUser.id, updated_by: currentUser.id })
      if (error) { setSaveError('Failed to create article. Please try again.'); return }
      setShowMobileDetail(true)
    }

    setEditing(false)
    setShowNew(false)
    setForm({ title: '', category: 'Process' })

    const refreshed = await fetchKnowledgeBaseArticles(supabase)
    if (!isMountedRef.current) return
    if (!refreshed.error) {
      setArticles(refreshed.data)
      const nextSelected = savedId
        ? refreshed.data.find((a) => a.id === savedId) ?? null
        : refreshed.data[0] ?? null
      setSelected(nextSelected)
      if (nextSelected) {
        syncArticlesUrl((params) => params.set('article', nextSelected.id))
      }
    } else {
      await loadData()
    }
  }

  const openArticle = (article: Article) => {
    setSelected(article)
    setEditing(false)
    setShowNew(false)
    setShowMobileDetail(true)
    syncArticlesUrl((params) => params.set('article', article.id))
  }

  const clearArticleSelection = () => {
    setSelected(null)
    setEditing(false)
    setShowNew(false)
    setShowMobileDetail(false)
    syncArticlesUrl((params) => params.delete('article'))
  }

  const togglePin = async (article: Article) => {
    const newPinned = !article.pinned
    await supabase.from('knowledge_base').update({ pinned: newPinned }).eq('id', article.id)
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, pinned: newPinned } : a).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    }))
    if (selected?.id === article.id) setSelected(prev => prev ? { ...prev, pinned: newPinned } : prev)
  }

  const deleteArticle = async (article: Article) => {
    if (!confirm(`Delete "${article.title}"? This cannot be undone.`)) return
    await supabase.from('knowledge_base').delete().eq('id', article.id)
    setArticles(prev => prev.filter(a => a.id !== article.id))
    if (selected?.id === article.id) clearArticleSelection()
  }

  const readOnlyKb = isStudentInternRole(currentUser?.role)

  const filtered = articles.filter(a => {
    const matchSearch = search === '' || a.title.toLowerCase().includes(search.toLowerCase()) || stripArticleHtml(a.content).toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'all' || a.category === catFilter
    return matchSearch && matchCat
  })

  const exportArticles = () =>
    mapArticlesForExport(
      filtered.map((a) => ({
        title: a.title,
        category: a.category,
        content: a.content,
      })),
    )

  const handlePrint = () => {
    if (!selected) return
    const ok = printLibraryArticle({
      title: selected.title,
      category: selected.category,
      content: selected.content,
      updated_at: selected.updated_at,
      authorName: selected.author?.name ?? null,
    })
    if (!ok) toast('Could not open print view for this article', 'error')
  }

  const inputStyle: React.CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px',
    padding: '10px 14px', fontSize: '15px', color: text, fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: '44px',
  }

  const tbBtn = (label: string, action: () => void, active: boolean, extraStyle?: React.CSSProperties) => (
    <button key={label} onClick={action} style={{ fontSize: '13px', padding: '4px 10px', borderRadius: '6px', border: `0.5px solid ${active ? '#1e6cb5' : border}`, background: active ? 'rgba(30,108,181,0.15)' : 'transparent', color: active ? '#5ba3e0' : muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '30px', ...extraStyle }}>
      {label}
    </button>
  )

  const Toolbar = () => (
    <div style={{ display: 'flex', gap: '4px', padding: '8px 10px', borderBottom: `0.5px solid ${border}`, flexWrap: 'wrap', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
      {tbBtn('B', () => editor?.chain().focus().toggleBold().run(), !!editor?.isActive('bold'), { fontWeight: 700 })}
      {tbBtn('I', () => editor?.chain().focus().toggleItalic().run(), !!editor?.isActive('italic'), { fontStyle: 'italic' })}
      {tbBtn('H2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), !!editor?.isActive('heading', { level: 2 }))}
      {tbBtn('H3', () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), !!editor?.isActive('heading', { level: 3 }))}
      {tbBtn('• List', () => editor?.chain().focus().toggleBulletList().run(), !!editor?.isActive('bulletList'))}
      {tbBtn('1. List', () => editor?.chain().focus().toggleOrderedList().run(), !!editor?.isActive('orderedList'))}
      {tbBtn('—', () => editor?.chain().focus().setHorizontalRule().run(), false)}
    </div>
  )

  const DetailPanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `0.5px solid ${border}` }}>
        <button type="button" onClick={clearArticleSelection} className="mobile-back-btn" style={{ display: 'none', background: 'none', border: 'none', color: '#5ba3e0', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', padding: '4px 0', minHeight: '44px', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {selected && !editing && !showNew && (
            <button
              type="button"
              onClick={handlePrint}
              style={{ fontSize: '15px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}
            >
              Print
            </button>
          )}
          {selected && !editing && !readOnlyKb && (
            <>
            <button
              onClick={() => togglePin(selected)}
              style={{ fontSize: '15px', padding: '8px 16px', borderRadius: '8px', background: selected.pinned ? 'rgba(232,160,32,0.1)' : 'transparent', border: `0.5px solid ${selected.pinned ? 'rgba(232,160,32,0.3)' : border}`, color: selected.pinned ? '#e8a020' : muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>
              {selected.pinned ? '📌 Pinned' : 'Pin'}
            </button>
            <button
              onClick={() => {
                if (!selected) return
                beginCompose({
                  title: selected.title,
                  category: selected.category,
                  content: selected.content || '',
                  mode: 'edit',
                })
              }}
              style={{ fontSize: '15px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>
              Edit
            </button>
            <button onClick={() => deleteArticle(selected)} style={{ fontSize: '15px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>
              Delete
            </button>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' as const, padding: (editing || showNew) ? '0' : '20px' }}>
        {(editing || showNew) ? (
          <div>
            <div style={{ padding: '16px 20px 0' }}>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Article title" style={{ ...inputStyle, fontSize: '18px', fontWeight: 600, marginBottom: '10px' }} />
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={{ ...inputStyle, marginBottom: '12px' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div
              style={{
                margin: '0 20px',
                border: `0.5px solid ${border}`,
                borderRadius: '10px',
                overflow: 'hidden',
                background: inputBg,
                minHeight: '326px',
              }}
            >
              {editor ? <Toolbar /> : (
                <div style={{ height: '46px', borderBottom: `0.5px solid ${border}`, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }} />
              )}
              <ArticleRichEditor
                key={editorKey}
                placeholder="Write your article here. Keep it practical and step-by-step."
                initialContent={composeInitialHtml}
                onEditorReady={setEditor}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', margin: '14px 20px 20px' }}>
              <button onClick={saveArticle} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>Save article</button>
              <button onClick={() => { setEditing(false); setShowNew(false); setSaveError(''); setEditor(null) }} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>Cancel</button>
              {saveError && <span style={{ fontSize: '13px', color: '#ef4444' }}>{saveError}</span>}
            </div>
          </div>
        ) : selected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', padding: '3px 10px', borderRadius: '6px', background: (CAT_STYLES[selected.category] || CAT_STYLES.Other).bg, color: (CAT_STYLES[selected.category] || CAT_STYLES.Other).color, fontWeight: 500 }}>{selected.category}</span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: text, margin: '0 0 6px', lineHeight: 1.3 }}>{selected.title}</h2>
            <p style={{ fontSize: '14px', color: muted, margin: '0 0 28px' }}>
              {selected.author?.name && `By ${selected.author.name} · `}
              Updated {formatArticleDate(selected.updated_at)}
            </p>
            <ArticleBody html={selected.content || ''} />
          </div>
        ) : null}
      </div>
    </div>
  )

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>
            {filtered.length === articles.length
              ? `${articles.length} article${articles.length === 1 ? '' : 's'}`
              : `${filtered.length} of ${articles.length} shown`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {articles.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => downloadArticlesExport(exportArticles(), 'json')}
                disabled={filtered.length === 0}
                style={{
                  fontSize: '14px',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: filtered.length === 0 ? muted : text,
                  border: `0.5px solid ${border}`,
                  cursor: filtered.length === 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                  minHeight: '44px',
                  opacity: filtered.length === 0 ? 0.5 : 1,
                }}
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => downloadArticlesExport(exportArticles(), 'csv')}
                disabled={filtered.length === 0}
                style={{
                  fontSize: '14px',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: filtered.length === 0 ? muted : text,
                  border: `0.5px solid ${border}`,
                  cursor: filtered.length === 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                  minHeight: '44px',
                  opacity: filtered.length === 0 ? 0.5 : 1,
                }}
              >
                Export CSV
              </button>
            </>
          )}
        {!readOnlyKb && (
          <>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              style={{
                fontSize: '14px',
                padding: '10px 18px',
                borderRadius: '10px',
                background: 'transparent',
                color: text,
                border: `0.5px solid ${border}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                minHeight: '44px',
              }}
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => beginCompose({ title: '', category: 'Process', content: '', mode: 'new' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                padding: '10px 18px',
                borderRadius: '10px',
                background: '#1e6cb5',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                minHeight: '44px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New article
            </button>
          </>
        )}
        </div>
      </div>

      <div
        className="kb-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '16px',
          alignItems: 'stretch',
          minHeight: 'min(720px, calc(100vh - 240px))',
        }}
      >
        <div
          className={`kb-list ${showMobileDetail ? 'kb-list-hidden' : ''}`}
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '10px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: '14px', color: text, fontFamily: 'inherit', width: '100%', minHeight: '24px' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>}
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {['all', ...CATEGORIES].map(cat => {
              const active = catFilter === cat
              const cs = cat !== 'all' ? CAT_STYLES[cat] : null
              return (
                <button key={cat} onClick={() => setCatFilter(cat)} style={{ fontSize: '14px', padding: '6px 14px', borderRadius: '8px', border: `0.5px solid ${active && cs ? cs.color : border}`, background: active && cs ? cs.bg : active ? '#1e6cb5' : cardBg, color: active && cs ? cs.color : active ? '#fff' : muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '36px' }}>
                  {cat === 'all' ? 'All' : cat}
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 20px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px' }}>
              {articles.length === 0 ? (
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 6px' }}>No articles yet</p>
                  <p style={{ fontSize: '15px', color: muted, margin: '0 0 16px' }}>Start documenting your team's processes</p>
                  {!readOnlyKb && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {STARTER_ARTICLES.map(s => (
                      <button key={s.title} onClick={() => beginCompose({ title: s.title, category: s.category, content: s.content, mode: 'new' })} style={{ fontSize: '14px', padding: '8px 14px', borderRadius: '8px', background: 'var(--surface-2)', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                        + {s.title}
                      </button>
                    ))}
                  </div>
                  )}
                </div>
              ) : (
                <div>
                  <p style={{ color: muted, fontSize: '14px', margin: '0 0 10px' }}>
                    No articles match your search or category filter.
                  </p>
                  {(search || catFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => { setSearch(''); setCatFilter('all') }}
                      style={{
                        fontSize: '14px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: 'var(--surface-2)',
                        border: `0.5px solid ${border}`,
                        color: 'var(--link)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="kb-list-scroll"
              style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '2px' }}
            >
              {filtered.map(article => {
                const cs = CAT_STYLES[article.category] || CAT_STYLES.Other
                const isSelected = selected?.id === article.id
                const editedBy = article.editor?.name || article.author?.name
                return (
                  <div key={article.id} onClick={() => openArticle(article)} style={{ padding: '14px 16px', background: isSelected ? (dark ? 'rgba(30,108,181,0.15)' : 'rgba(30,108,181,0.06)') : cardBg, border: `0.5px solid ${isSelected ? '#1e6cb5' : border}`, borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = hoverBg }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = cardBg }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      {article.pinned && <span style={{ fontSize: '12px', color: '#e8a020', flexShrink: 0 }}>📌</span>}
                      <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0, flex: 1 }}>{article.title}</p>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: cs.bg, color: cs.color, flexShrink: 0, fontWeight: 500 }}>{article.category}</span>
                    </div>
                    <p style={{ fontSize: '14px', color: muted, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {stripArticleHtml(article.content).slice(0, 90)}
                    </p>
                    {editedBy && <p style={{ fontSize: '11px', color: muted, margin: 0, opacity: 0.6 }}>Last edited by {editedBy}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          className={`kb-detail ${showMobileDetail ? 'kb-detail-visible' : 'kb-detail-desktop'}`}
          style={{
            background: cardBg,
            border: `0.5px solid ${border}`,
            borderRadius: '14px',
            overflow: 'hidden',
            minHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {selected || showNew ? (
            <DetailPanel />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 32px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: '16px', fontWeight: 500, color: text, margin: '0 0 8px' }}>
                Select an article
              </p>
              <p style={{ fontSize: '14px', color: muted, margin: 0, maxWidth: '320px', lineHeight: 1.5 }}>
                Choose an article from the list to read it here, or create a new one.
              </p>
            </div>
          )}
        </div>
      </div>

      <KnowledgeArticlesImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setSearch('')
          setCatFilter('all')
          void loadData()
        }}
        text={text}
        muted={muted}
        border={border}
        cardBg={cardBg}
        inputBg={inputBg}
      />

      <style>{`
        @media (min-width: 768px) {
          .kb-layout { grid-template-columns: minmax(280px, 360px) minmax(0, 1fr) !important; }
          .kb-list { display: flex !important; }
          .kb-list-hidden { display: flex !important; }
          .kb-detail { display: flex !important; }
          .kb-detail-desktop { display: flex !important; }
          .kb-list-scroll { max-height: calc(100vh - 280px); }
        }
        @media (max-width: 767px) {
          .kb-list-hidden { display: none !important; }
          .kb-detail { display: none; }
          .kb-detail-visible { display: block !important; }
          .mobile-back-btn { display: flex !important; }
        }
        .tiptap-editor .ProseMirror {
          min-height: 280px;
          padding: 14px 16px;
          font-size: 15px;
          color: ${text};
          font-family: inherit;
          line-height: 1.7;
          outline: none;
        }
        .tiptap-editor .ProseMirror > * + * { margin-top: 10px; }
        .tiptap-editor .ProseMirror h2 { font-size: 17px; font-weight: 600; color: ${text}; margin: 20px 0 6px; }
        .tiptap-editor .ProseMirror h3 { font-size: 15px; font-weight: 600; color: ${text}; margin: 16px 0 4px; }
        .tiptap-editor .ProseMirror ul { list-style: disc; padding-left: 22px; }
        .tiptap-editor .ProseMirror ol { list-style: decimal; padding-left: 22px; }
        .tiptap-editor .ProseMirror li { margin-bottom: 5px; }
        .tiptap-editor .ProseMirror hr { border: none; border-top: 0.5px solid ${border}; margin: 16px 0; }
        .tiptap-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: ${muted};
          pointer-events: none;
          float: left;
          height: 0;
        }
        .article-content h2 {
          font-size: 17px; font-weight: 600; color: ${text};
          margin: 32px 0 12px; padding-bottom: 8px;
          border-bottom: 0.5px solid ${border};
        }
        .article-content h2:first-child { margin-top: 0; }
        .article-content h3 { font-size: 15px; font-weight: 600; color: ${text}; margin: 22px 0 8px; }
        .article-content p { font-size: 15px; color: ${text}; line-height: 1.8; margin: 0 0 14px; }
        .article-content ul { list-style: none; padding: 0; margin: 0 0 18px; }
        .article-content ul li {
          font-size: 15px; color: ${text}; line-height: 1.7;
          margin-bottom: 8px; padding-left: 20px; position: relative;
        }
        .article-content ul li::before {
          content: '·'; position: absolute; left: 5px;
          color: ${muted}; font-size: 20px; line-height: 1.3;
        }
        .article-content ol { list-style: none; padding: 0; margin: 0 0 18px; counter-reset: ol-counter; }
        .article-content ol li {
          font-size: 15px; color: ${text}; line-height: 1.7;
          margin-bottom: 10px; padding-left: 32px; position: relative;
          counter-increment: ol-counter;
        }
        .article-content ol li::before {
          content: counter(ol-counter);
          position: absolute; left: 0;
          width: 22px; height: 22px;
          background: rgba(30,108,181,0.12);
          color: #5ba3e0;
          border-radius: 50%;
          font-size: 12px; font-weight: 600;
          display: flex; align-items: center; justify-content: center;
          top: 2px;
        }
        .article-content strong { font-weight: 600; color: ${text}; }
        .article-content em { font-style: italic; color: ${muted}; }
        .article-content hr { border: none; border-top: 0.5px solid ${border}; margin: 28px 0; }
      `}</style>
    </div>
  )
}