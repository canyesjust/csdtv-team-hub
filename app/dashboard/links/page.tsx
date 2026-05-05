'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Loader from '../components/Loader'

interface QuickLink {
  id: string
  title: string
  url: string
  description: string | null
  category: string
  active: boolean
  sort_order: number
}

interface CurrentUser { id: string; name: string; role: string }

const CAT_STYLES: Record<string, { bg: string; color: string; emoji: string }> = {
  Tools:         { bg: 'rgba(30,108,181,0.12)',  color: '#5ba3e0', emoji: '🛠' },
  Storage:       { bg: 'rgba(232,160,32,0.12)',  color: '#e8a020', emoji: '📁' },
  Communication: { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', emoji: '💬' },
  Production:    { bg: 'rgba(155,133,224,0.12)', color: '#9b85e0', emoji: '🎬' },
  District:      { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', emoji: '🏫' },
  General:       { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', emoji: '🔗' },
}

const CATEGORIES = Object.keys(CAT_STYLES)

export default function QuickLinksPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [links, setLinks] = useState<QuickLink[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title: '', url: '', description: '', category: 'Tools' })
  const [catFilter, setCatFilter] = useState('all')
  const [saving, setSaving] = useState(false)

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [linksRes, userRes] = await Promise.all([
      supabase.from('quick_links').select('*').eq('active', true).order('sort_order'),
      supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single(),
    ])
    setLinks(linksRes.data || [])
    setCurrentUser(userRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const addLink = async () => {
    if (!form.title || !form.url || !currentUser) return
    setSaving(true)
    const url = form.url.startsWith('http') ? form.url : `https://${form.url}`
    const { data } = await supabase.from('quick_links').insert({ title: form.title, url, description: form.description || null, category: form.category, created_by: currentUser.id, sort_order: links.length, active: true }).select().single()
    if (data) { setLinks(prev => [...prev, data]); setForm({ title: '', url: '', description: '', category: 'Tools' }); setShowNew(false) }
    setSaving(false)
  }

  const deleteLink = async (id: string) => {
    await supabase.from('quick_links').update({ active: false }).eq('id', id)
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  const isManager = currentUser?.role === 'Manager'
  const filtered = catFilter === 'all' ? links : links.filter(l => l.category === catFilter)
  const grouped = filtered.reduce((acc, link) => {
    if (!acc[link.category]) acc[link.category] = []
    acc[link.category].push(link)
    return acc
  }, {} as Record<string, QuickLink[]>)

  const inputStyle: React.CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px',
    padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: '44px',
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: 0 }}>Quick links</h1>
          <p style={{ fontSize: '15px', color: muted, margin: '2px 0 0' }}>Useful tools and resources for the team</p>
        </div>
        {isManager && (
          <button onClick={() => setShowNew(!showNew)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', padding: '10px 18px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add link
          </button>
        )}
      </div>

      {showNew && isManager && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '18px', marginBottom: '18px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 14px' }}>Add new link</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Link title" style={inputStyle} />
            <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="URL (e.g. drive.google.com)" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Short description (optional)" style={inputStyle} />
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addLink} disabled={saving} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '44px' }}>
              {saving ? 'Adding...' : 'Add link'}
            </button>
            <button onClick={() => setShowNew(false)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '10px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '44px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category filter pills */}
      {links.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => setCatFilter('all')} style={{ fontSize: '15px', padding: '7px 16px', borderRadius: '20px', border: `0.5px solid ${catFilter === 'all' ? '#1e6cb5' : border}`, background: catFilter === 'all' ? 'rgba(30,108,181,0.12)' : cardBg, color: catFilter === 'all' ? '#5ba3e0' : muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '36px' }}>
            All
          </button>
          {[...new Set(links.map(l => l.category))].map(cat => {
            const cs = CAT_STYLES[cat] || CAT_STYLES.General
            const active = catFilter === cat
            return (
              <button key={cat} onClick={() => setCatFilter(active ? 'all' : cat)} style={{ fontSize: '15px', padding: '7px 16px', borderRadius: '20px', border: `0.5px solid ${active ? cs.color : border}`, background: active ? cs.bg : cardBg, color: active ? cs.color : muted, cursor: 'pointer', fontFamily: 'inherit', minHeight: '36px' }}>
                {cs.emoji} {cat}
              </button>
            )
          })}
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '60px 20px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px' }}>
          <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 6px' }}>
            {links.length === 0 ? 'No links yet' : 'No links in this category'}
          </p>
          {isManager && links.length === 0 && (
            <p style={{ fontSize: '15px', color: muted, margin: '0 0 16px' }}>
              Add links your team uses every day — Drive, Gmail, production tools
            </p>
          )}
        </div>
      ) : (
        Object.entries(grouped).map(([category, catLinks]) => {
          const cs = CAT_STYLES[category] || CAT_STYLES.General
          return (
            <div key={category} style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', background: cs.bg, color: cs.color }}>
                  {cs.emoji} {category}
                </span>
                <span style={{ fontSize: '14px', color: muted }}>{catLinks.length} {catLinks.length === 1 ? 'link' : 'links'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {catLinks.map(link => (
                  <div key={link.id} style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden', transition: 'border-color 0.15s, transform 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = cs.color; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = border; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
                  >
                    <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', textDecoration: 'none' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: cs.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cs.color} strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{link.title}</p>
                        {link.description && <p style={{ fontSize: '13px', color: muted, margin: '0 0 4px', lineHeight: 1.4 }}>{link.description}</p>}
                        <p style={{ fontSize: '12px', color: muted, margin: 0, opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {link.url.replace(/^https?:\/\//, '').split('/')[0]}
                        </p>
                      </div>
                    </a>
                    {isManager && (
                      <div style={{ borderTop: `0.5px solid ${border}`, padding: '6px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => { if (confirm('Delete this link?')) deleteLink(link.id) }} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px', borderRadius: '4px', opacity: 0.7 }}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}