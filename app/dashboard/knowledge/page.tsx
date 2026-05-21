'use client'

import { useEffect, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../components/Loader'
import { isStudentInternRole } from '@/lib/roles'
import { sanitizeArticleHtml, stripArticleHtml } from '@/lib/sanitize-article-html'

interface Article {
  id: string
  title: string
  content: string
  category: string
  created_by: string
  updated_by: string | null
  updated_at: string
  pinned: boolean
  author?: { name: string } | null
  editor?: { name: string } | null
}

interface CurrentUser { id: string; name: string; role: string }

const CATEGORIES = ['Process', 'Reference', 'Policy', 'Workflow', 'Other']
const CAT_STYLES: Record<string, { bg: string; color: string }> = {
  Process:   { bg: 'rgba(30,108,181,0.12)',  color: '#5ba3e0' },
  Reference: { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8' },
  Policy:    { bg: 'rgba(155,133,224,0.12)', color: '#9b85e0' },
  Workflow:  { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  Other:     { bg: 'rgba(232,160,32,0.12)',  color: '#e8a020' },
}

const STARTER_ARTICLES = [
  { title: 'Livestream setup process', category: 'Process', content: '<p>Step by step guide for setting up a livestream...</p>' },
  { title: 'Board meeting workflow', category: 'Workflow', content: '<p>Complete board meeting production checklist and workflow...</p>' },
  { title: 'Equipment checkout policy', category: 'Policy', content: '<p>Rules and procedures for checking out equipment...</p>' },
]

export default function KnowledgePage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

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

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your article here. Keep it practical and step-by-step.' }),
    ],
    content: '',
    immediatelyRender: false,
  })

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [articlesRes, userRes] = await Promise.all([
      supabase.from('knowledge_base').select('*, author:team!knowledge_base_created_by_fkey(name), editor:team!knowledge_base_updated_by_fkey(name)').order('pinned', { ascending: false }).order('updated_at', { ascending: false }),
      supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single(),
    ])
    setArticles(articlesRes.data || [])
    setCurrentUser(userRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const saveArticle = async () => {
    const htmlContent = editor?.getHTML() || ''
    const isEmpty = htmlContent === '<p></p>' || htmlContent.trim() === ''
    if (!form.title || isEmpty || !currentUser) return
    setSaveError('')
    if (editing && selected) {
      const { data, error } = await supabase.from('knowledge_base')
        .update({ title: form.title, content: htmlContent, category: form.category, updated_at: new Date().toISOString(), updated_by: currentUser.id })
        .eq('id', selected.id)
        .select('*, author:team!knowledge_base_created_by_fkey(name), editor:team!knowledge_base_updated_by_fkey(name)')
        .single()
      if (error) { setSaveError('Failed to save article. Please try again.'); return }
      if (data) { setArticles(prev => prev.map(a => a.id === data.id ? data : a)); setSelected(data) }
    } else {
      const { data, error } = await supabase.from('knowledge_base')
        .insert({ title: form.title, content: htmlContent, category: form.category, created_by: currentUser.id, updated_by: currentUser.id })
        .select('*, author:team!knowledge_base_created_by_fkey(name), editor:team!knowledge_base_updated_by_fkey(name)')
        .single()
      if (error) { setSaveError('Failed to create article. Please try again.'); return }
      if (data) { setArticles(prev => [data, ...prev]); setSelected(data); setShowMobileDetail(true) }
    }
    setEditing(false)
    setShowNew(false)
    setForm({ title: '', category: 'Process' })
  }

  const openArticle = (article: Article) => {
    setSelected(article)
    setEditing(false)
    setShowMobileDetail(true)
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
    if (selected?.id === article.id) setSelected(null)
  }

  const readOnlyKb = isStudentInternRole(currentUser?.role)

  const filtered = articles.filter(a => {
    const matchSearch = search === '' || a.title.toLowerCase().includes(search.toLowerCase()) || stripArticleHtml(a.content).toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'all' || a.category === catFilter
    return matchSearch && matchCat
  })

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
        <button onClick={() => setShowMobileDetail(false)} className="mobile-back-btn" style={{ display: 'none', background: 'none', border: 'none', color: '#5ba3e0', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit', padding: '4px 0', minHeight: '44px', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          {selected && !editing && !readOnlyKb && (
            <>
            <button
              onClick={() => togglePin(selected)}
              style={{ fontSize: '15px', padding: '8px 16px', borderRadius: '8px', background: selected.pinned ? 'rgba(232,160,32,0.1)' : 'transparent', border: `0.5px solid ${selected.pinned ? 'rgba(232,160,32,0.3)' : border}`, color: selected.pinned ? '#e8a020' : muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>
              {selected.pinned ? '📌 Pinned' : 'Pin'}
            </button>
            <button
              onClick={() => {
                setEditing(true)
                setForm({ title: selected.title, category: selected.category })
                editor?.commands.setContent(selected.content || '')
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
            <div style={{ margin: '0 20px', border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden', background: inputBg }}>
              <Toolbar />
              <EditorContent editor={editor} className="tiptap-editor" />
            </div>
            <div style={{ display: 'flex', gap: '8px', margin: '14px 20px 20px' }}>
              <button onClick={saveArticle} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>Save article</button>
              <button onClick={() => { setEditing(false); setShowNew(false); setSaveError('') }} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>Cancel</button>
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
              Updated {new Date(selected.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <div className="article-content" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(selected.content || '') }} />
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
          <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: 0 }}>Knowledge base</h1>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>{articles.length} articles</p>
        </div>
        {!readOnlyKb && (
        <button
          onClick={() => {
            setShowNew(true)
            setSelected(null)
            setForm({ title: '', category: 'Process' })
            editor?.commands.setContent('')
            setShowMobileDetail(true)
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New article
        </button>
        )}
      </div>

      <div className="kb-layout" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>

        <div className={`kb-list ${showMobileDetail ? 'kb-list-hidden' : ''}`}>
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
                      <button key={s.title} onClick={() => { setForm({ title: s.title, category: s.category }); setShowNew(true); setShowMobileDetail(true); editor?.commands.setContent(s.content) }} style={{ fontSize: '14px', padding: '8px 14px', borderRadius: '8px', background: 'var(--surface-2)', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                        + {s.title}
                      </button>
                    ))}
                  </div>
                  )}
                </div>
              ) : (
                <p style={{ color: muted, fontSize: '14px' }}>No articles match your search</p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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

        {(selected || showNew) && (
          <div className={`kb-detail ${showMobileDetail ? 'kb-detail-visible' : 'kb-detail-desktop'}`} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden', minHeight: '400px' }}>
            <DetailPanel />
          </div>
        )}
      </div>

      <style>{`
        @media (min-width: 768px) {
          .kb-layout { grid-template-columns: 340px 1fr !important; }
          .kb-list { display: block !important; }
          .kb-list-hidden { display: block !important; }
          .kb-detail { display: block !important; }
          .kb-detail-desktop { display: block !important; }
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