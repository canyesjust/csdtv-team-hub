'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { Editor } from '@tiptap/react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../components/Loader'
import { toast } from '@/lib/toast'
import { sanitizeArticleHtml, stripArticleHtml } from '@/lib/sanitize-article-html'

const ArticleRichEditor = dynamic(() => import('../components/ArticleRichEditor'), { ssr: false })

interface Idea {
  id: string
  title: string
  description: string
  created_by: string
  updated_by: string | null
  archived_at: string | null
  archived_by: string | null
  created_at: string
  updated_at: string
  author?: { name: string } | null
  editor?: { name: string } | null
}

interface CurrentUser {
  id: string
  name: string
  role: string
}

type Tab = 'active' | 'archived'

const IDEA_SELECT =
  '*, author:team!project_ideas_created_by_fkey(name), editor:team!project_ideas_updated_by_fkey(name)'

export default function IdeasPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [ideas, setIdeas] = useState<Idea[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('active')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Idea | null>(null)
  const [editing, setEditing] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [showMobileDetail, setShowMobileDetail] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const [composeInitialHtml, setComposeInitialHtml] = useState('')

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'
  const warning = '#e8a020'

  const isManager = currentUser?.role === 'Manager'

  const beginCompose = useCallback(
    (opts: { title: string; content: string; mode: 'new' | 'edit' }) => {
      setEditor(null)
      setComposeInitialHtml(opts.content)
      setEditorKey(k => k + 1)
      setFormTitle(opts.title)
      setSaveError('')
      setShowMobileDetail(true)
      if (opts.mode === 'new') {
        setShowNew(true)
        setSelected(null)
        setEditing(false)
      } else {
        setEditing(true)
        setShowNew(false)
      }
    },
    [],
  )

  const cancelCompose = useCallback(() => {
    const wasNew = showNew
    setEditing(false)
    setShowNew(false)
    setSaveError('')
    setEditor(null)
    setComposeInitialHtml('')
    setEditorKey(k => k + 1)
    if (wasNew) setShowMobileDetail(false)
  }, [showNew])

  const resetEditorInstance = useCallback(() => {
    setEditor(null)
    setComposeInitialHtml('')
    setEditorKey(k => k + 1)
  }, [])

  const loadData = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const [ideasRes, userRes] = await Promise.all([
      supabase.from('project_ideas').select(IDEA_SELECT).order('updated_at', { ascending: false }),
      supabase.from('team').select('id, name, role').eq('supabase_user_id', session.user.id).single(),
    ])
    if (ideasRes.error) {
      toast('Failed to load ideas. Run db/project_ideas.sql in Supabase if this is a new install.', 'error')
      setIdeas([])
    } else {
      setIdeas((ideasRes.data as Idea[]) || [])
    }
    setCurrentUser(userRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeIdeas = useMemo(() => ideas.filter(i => !i.archived_at), [ideas])
  const archivedIdeas = useMemo(() => ideas.filter(i => i.archived_at), [ideas])

  const listIdeas = tab === 'active' ? activeIdeas : archivedIdeas

  const filtered = listIdeas.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      i.title.toLowerCase().includes(q) ||
      stripArticleHtml(i.description).toLowerCase().includes(q)
    )
  })

  const upsertInState = (row: Idea) => {
    setIdeas(prev => {
      const next = prev.filter(i => i.id !== row.id)
      return [row, ...next].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
    })
  }

  const saveIdea = async () => {
    const htmlContent = sanitizeArticleHtml(editor?.getHTML() || '')
    const isEmpty = htmlContent === '<p></p>' || stripArticleHtml(htmlContent) === ''
    if (!formTitle.trim() || isEmpty || !currentUser) return
    setSaveError('')

    if (editing && selected) {
      const { data, error } = await supabase
        .from('project_ideas')
        .update({
          title: formTitle.trim(),
          description: htmlContent,
          updated_at: new Date().toISOString(),
          updated_by: currentUser.id,
        })
        .eq('id', selected.id)
        .select(IDEA_SELECT)
        .single()
      if (error) {
        setSaveError('Failed to save. Please try again.')
        return
      }
      if (data) {
        upsertInState(data as Idea)
        setSelected(data as Idea)
        toast('Idea updated', 'success')
      }
    } else {
      const { data, error } = await supabase
        .from('project_ideas')
        .insert({
          title: formTitle.trim(),
          description: htmlContent,
          created_by: currentUser.id,
          updated_by: currentUser.id,
        })
        .select(IDEA_SELECT)
        .single()
      if (error) {
        setSaveError('Failed to create idea. Please try again.')
        return
      }
      if (data) {
        upsertInState(data as Idea)
        setSelected(data as Idea)
        setTab('active')
        setShowMobileDetail(true)
        toast('Idea added', 'success')
      }
    }
    setEditing(false)
    setShowNew(false)
    setFormTitle('')
    resetEditorInstance()
  }

  const openIdea = (idea: Idea) => {
    if (editing || showNew) cancelCompose()
    setSelected(idea)
    setShowMobileDetail(true)
  }

  const startEdit = (idea: Idea) => {
    beginCompose({
      title: idea.title,
      content: idea.description || '',
      mode: 'edit',
    })
  }

  const archiveIdea = async (idea: Idea) => {
    if (!currentUser) return
    if (!confirm(`Archive "${idea.title}"?`)) return
    const { data, error } = await supabase
      .from('project_ideas')
      .update({
        archived_at: new Date().toISOString(),
        archived_by: currentUser.id,
        updated_at: new Date().toISOString(),
        updated_by: currentUser.id,
      })
      .eq('id', idea.id)
      .select(IDEA_SELECT)
      .single()
    if (error) {
      toast('Failed to archive', 'error')
      return
    }
    if (data) {
      upsertInState(data as Idea)
      if (selected?.id === idea.id) setSelected(data as Idea)
      toast('Idea archived', 'success')
    }
  }

  const restoreIdea = async (idea: Idea) => {
    if (!currentUser) return
    const { data, error } = await supabase
      .from('project_ideas')
      .update({
        archived_at: null,
        archived_by: null,
        updated_at: new Date().toISOString(),
        updated_by: currentUser.id,
      })
      .eq('id', idea.id)
      .select(IDEA_SELECT)
      .single()
    if (error) {
      toast('Failed to restore', 'error')
      return
    }
    if (data) {
      upsertInState(data as Idea)
      setTab('active')
      if (selected?.id === idea.id) setSelected(data as Idea)
      toast('Idea restored', 'success')
    }
  }

  const deleteIdea = async (idea: Idea) => {
    if (!isManager) return
    if (!confirm(`Permanently delete "${idea.title}"? This cannot be undone.`)) return
    const { error } = await supabase.from('project_ideas').delete().eq('id', idea.id)
    if (error) {
      toast('Failed to delete', 'error')
      return
    }
    setIdeas(prev => prev.filter(i => i.id !== idea.id))
    if (selected?.id === idea.id) setSelected(null)
    toast('Idea deleted', 'success')
  }

  const inputStyle: React.CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '15px',
    color: text,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '44px',
  }

  const tbBtn = (label: string, action: () => void, active: boolean, extraStyle?: React.CSSProperties) => (
    <button
      key={label}
      type="button"
      onClick={action}
      style={{
        fontSize: '13px',
        padding: '4px 10px',
        borderRadius: '6px',
        border: `0.5px solid ${active ? '#1e6cb5' : border}`,
        background: active ? 'rgba(30,108,181,0.15)' : 'transparent',
        color: active ? '#5ba3e0' : muted,
        cursor: 'pointer',
        fontFamily: 'inherit',
        minHeight: '30px',
        ...extraStyle,
      }}
    >
      {label}
    </button>
  )

  const Toolbar = () => (
    <div
      style={{
        display: 'flex',
        gap: '4px',
        padding: '8px 10px',
        borderBottom: `0.5px solid ${border}`,
        flexWrap: 'wrap',
        background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
      }}
    >
      {tbBtn('B', () => editor?.chain().focus().toggleBold().run(), !!editor?.isActive('bold'), {
        fontWeight: 700,
      })}
      {tbBtn('I', () => editor?.chain().focus().toggleItalic().run(), !!editor?.isActive('italic'), {
        fontStyle: 'italic',
      })}
      {tbBtn('H2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), !!editor?.isActive('heading', { level: 2 }))}
      {tbBtn('H3', () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), !!editor?.isActive('heading', { level: 3 }))}
      {tbBtn('• List', () => editor?.chain().focus().toggleBulletList().run(), !!editor?.isActive('bulletList'))}
      {tbBtn('1. List', () => editor?.chain().focus().toggleOrderedList().run(), !!editor?.isActive('orderedList'))}
      {tbBtn('—', () => editor?.chain().focus().setHorizontalRule().run(), false)}
    </div>
  )

  const DetailPanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: `0.5px solid ${border}`,
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (showNew || editing) cancelCompose()
            else setShowMobileDetail(false)
          }}
          className="ideas-mobile-back"
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            color: '#5ba3e0',
            cursor: 'pointer',
            fontSize: '14px',
            fontFamily: 'inherit',
            padding: '4px 0',
            minHeight: '44px',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {selected && !editing && !showNew && (
            <>
              <button
                type="button"
                onClick={() => startEdit(selected)}
                style={{
                  fontSize: '14px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: `0.5px solid ${border}`,
                  color: muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  minHeight: '44px',
                }}
              >
                Edit
              </button>
              {!selected.archived_at ? (
                <button
                  type="button"
                  onClick={() => void archiveIdea(selected)}
                  style={{
                    fontSize: '14px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'rgba(232,160,32,0.08)',
                    border: '0.5px solid rgba(232,160,32,0.35)',
                    color: warning,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minHeight: '44px',
                  }}
                >
                  Archive
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void restoreIdea(selected)}
                  style={{
                    fontSize: '14px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'rgba(34,197,94,0.08)',
                    border: '0.5px solid rgba(34,197,94,0.35)',
                    color: '#22c55e',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minHeight: '44px',
                  }}
                >
                  Restore
                </button>
              )}
              {isManager && (
                <button
                  type="button"
                  onClick={() => void deleteIdea(selected)}
                  style={{
                    fontSize: '14px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'rgba(239,68,68,0.06)',
                    border: '0.5px solid rgba(239,68,68,0.2)',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minHeight: '44px',
                  }}
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' as const, padding: editing || showNew ? '0' : '20px' }}>
        {editing || showNew ? (
          <div>
            <div style={{ padding: '16px 20px 0' }}>
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Idea title"
                style={{ ...inputStyle, fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}
              />
            </div>
            <div
              style={{
                margin: '0 20px',
                border: `0.5px solid ${border}`,
                borderRadius: '10px',
                overflow: 'hidden',
                background: inputBg,
              }}
            >
              <Toolbar />
              <ArticleRichEditor
                key={editorKey}
                placeholder="Describe the idea — goals, audience, timing, open questions…"
                initialContent={composeInitialHtml}
                onEditorReady={setEditor}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', margin: '14px 20px 20px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void saveIdea()}
                style={{
                  fontSize: '14px',
                  padding: '10px 20px',
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
                Save
              </button>
              <button
                type="button"
                onClick={cancelCompose}
                style={{
                  fontSize: '14px',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: muted,
                  border: `0.5px solid ${border}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  minHeight: '44px',
                }}
              >
                Cancel
              </button>
              {saveError && <span style={{ fontSize: '13px', color: '#ef4444' }}>{saveError}</span>}
            </div>
          </div>
        ) : selected ? (
          <div>
            {selected.archived_at && (
              <p
                style={{
                  fontSize: '12px',
                  color: warning,
                  margin: '0 0 12px',
                  padding: '8px 12px',
                  background: 'rgba(232,160,32,0.1)',
                  borderRadius: '8px',
                }}
              >
                Archived {new Date(selected.archived_at).toLocaleDateString()}
              </p>
            )}
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: text, margin: '0 0 6px', lineHeight: 1.3 }}>
              {selected.title}
            </h2>
            <p style={{ fontSize: '14px', color: muted, margin: '0 0 24px' }}>
              {selected.author?.name && `Added by ${selected.author.name} · `}
              Updated{' '}
              {new Date(selected.updated_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <div
              className="article-content"
              dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(selected.description || '') }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: 0 }}>Ideas</h1>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>
            Future projects and brainstorms — not district productions yet
          </p>
        </div>
        {!showNew && !editing && (
        <button
          type="button"
          onClick={() => beginCompose({ title: '', content: '', mode: 'new' })}
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New idea
        </button>
        )}
      </div>

      <p
        className="ideas-page-intro"
        style={{
          fontSize: '13px',
          color: muted,
          margin: '0 0 16px',
          lineHeight: 1.5,
          maxWidth: '720px',
        }}
      >
        When an idea is ready for the district workflow, create it in the productions system — it will appear under{' '}
        <Link href="/dashboard/productions" style={{ color: '#5ba3e0', textDecoration: 'none' }}>
          Productions
        </Link>{' '}
        as <strong style={{ fontWeight: 600, color: text }}>Idea / Request</strong>.
      </p>

      <div
        className={`ideas-layout${showMobileDetail && (showNew || editing) ? ' ideas-compose-mode' : ''}`}
        style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}
      >
        <div className={`ideas-list ${showMobileDetail ? 'ideas-list-hidden' : ''}`}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {(['active', 'archived'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t)
                  if (t === 'archived' && selected && !selected.archived_at) setSelected(null)
                  if (t === 'active' && selected?.archived_at) setSelected(null)
                }}
                style={{
                  fontSize: '14px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: `0.5px solid ${tab === t ? '#1e6cb5' : border}`,
                  background: tab === t ? 'rgba(30,108,181,0.12)' : cardBg,
                  color: tab === t ? '#5ba3e0' : muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: tab === t ? 600 : 500,
                }}
              >
                {t === 'active' ? `Active (${activeIdeas.length})` : `Archived (${archivedIdeas.length})`}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: cardBg,
              border: `0.5px solid ${border}`,
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '10px',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={muted}
              strokeWidth="2"
              style={{ flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ideas..."
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                fontSize: '14px',
                color: text,
                fontFamily: 'inherit',
                width: '100%',
                minHeight: '24px',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: 'center' as const,
                padding: '40px 20px',
                background: cardBg,
                border: `0.5px solid ${border}`,
                borderRadius: '14px',
              }}
            >
              <p style={{ fontSize: '15px', color: muted, margin: 0 }}>
                {tab === 'active' ? 'No active ideas yet' : 'No archived ideas'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filtered.map(idea => {
                const isSelected = selected?.id === idea.id
                const editedBy = idea.editor?.name || idea.author?.name
                return (
                  <div
                    key={idea.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openIdea(idea)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') openIdea(idea)
                    }}
                    style={{
                      padding: '14px 16px',
                      background: isSelected
                        ? dark
                          ? 'rgba(30,108,181,0.15)'
                          : 'rgba(30,108,181,0.06)'
                        : cardBg,
                      border: `0.5px solid ${isSelected ? '#1e6cb5' : border}`,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = hoverBg
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = cardBg
                    }}
                  >
                    <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: '0 0 5px' }}>{idea.title}</p>
                    <p
                      style={{
                        fontSize: '14px',
                        color: muted,
                        margin: '0 0 4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      {stripArticleHtml(idea.description).slice(0, 90) || 'No description'}
                    </p>
                    {editedBy && (
                      <p style={{ fontSize: '11px', color: muted, margin: 0, opacity: 0.6 }}>
                        Last edited by {editedBy}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          className={`ideas-detail ${showMobileDetail ? 'ideas-detail-visible' : 'ideas-detail-desktop'}`}
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
          {selected || showNew || editing ? (
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
                Select an idea
              </p>
              <p style={{ fontSize: '14px', color: muted, margin: 0, maxWidth: '320px', lineHeight: 1.5 }}>
                Choose an idea from the list, or use <strong style={{ fontWeight: 600, color: text }}>New idea</strong> to
                start one.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .ideas-layout { grid-template-columns: minmax(280px, 360px) minmax(0, 1fr) !important; }
          .ideas-list { display: block !important; }
          .ideas-list-hidden { display: block !important; }
          .ideas-detail { display: flex !important; }
          .ideas-detail-desktop { display: flex !important; }
        }
        @media (max-width: 767px) {
          .ideas-list-hidden { display: none !important; }
          .ideas-detail { display: none; }
          .ideas-detail-visible { display: flex !important; }
          .ideas-mobile-back { display: flex !important; }
          .ideas-compose-mode .ideas-page-intro { display: none; }
          .ideas-detail-visible { min-height: calc(100dvh - 140px); }
        }
        .tiptap-editor .ProseMirror {
          min-height: 240px;
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
        .article-content ul { list-style: disc; padding-left: 22px; margin: 0 0 14px; }
        .article-content ol { list-style: decimal; padding-left: 22px; margin: 0 0 14px; }
        .article-content li { margin-bottom: 6px; }
        .article-content strong { font-weight: 600; }
        .article-content em { font-style: italic; color: ${muted}; }
        .article-content hr { border: none; border-top: 0.5px solid ${border}; margin: 28px 0; }
        .article-content a { color: #5ba3e0; }
      `}</style>
    </div>
  )
}
