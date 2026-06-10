'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { confirmDialog } from '@/lib/confirm'
import { isStudentInternRole } from '@/lib/roles'
import { toast } from '@/lib/toast'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'
import Loader from '../../components/Loader'

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

export default function QuickLinksTab() {
  const supabase = createClient()

  const [links, setLinks] = useState<QuickLink[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
    setLoadError(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }
    const [linksRes, userRes] = await Promise.all([
      fetch('/api/library/quick-links', { cache: 'no-store' }),
      resolveEffectiveTeamRow<CurrentUser>(supabase, 'id, name, role'),
    ])

    let linksData: QuickLink[] = []
    if (linksRes.ok) {
      const json = (await linksRes.json()) as { links?: QuickLink[]; error?: string }
      if (json.error) {
        setLoadError(json.error)
        if (json.error.includes('does not exist') || json.error.includes('relation')) {
          toast('Quick links table is missing — run db/quick_links.sql in Supabase', 'error')
        } else {
          toast(`Could not load quick links: ${json.error}`, 'error')
        }
      } else {
        linksData = json.links ?? []
      }
    } else {
      const json = (await linksRes.json().catch(() => ({}))) as { error?: string }
      const msg = json.error || `Request failed (${linksRes.status})`
      setLoadError(msg)
      toast(`Could not load quick links: ${msg}`, 'error')
    }
    setLinks(linksData)
    setCurrentUser(userRes)
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadData() }, [loadData])

  const canManage = currentUser != null && !isStudentInternRole(currentUser.role)

  const addLink = async () => {
    if (!form.title || !form.url || !currentUser) return
    setSaving(true)
    const url = form.url.startsWith('http') ? form.url : `https://${form.url}`
    const res = await fetch('/api/library/quick-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        url,
        description: form.description.trim() || null,
        category: form.category,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { link?: QuickLink; error?: string }
    if (!res.ok) {
      toast(json.error || 'Failed to add link', 'error')
      setSaving(false)
      return
    }
    if (json.link) {
      setLinks((prev) => [...prev, json.link!])
      setForm({ title: '', url: '', description: '', category: 'Tools' })
      setShowNew(false)
      toast('Link added', 'success')
    }
    setSaving(false)
  }

  const deleteLink = async (id: string) => {
    const res = await fetch(`/api/library/quick-links/${id}`, { method: 'PATCH' })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast(json.error || 'Failed to remove link', 'error')
      return
    }
    setLinks((prev) => prev.filter((l) => l.id !== id))
    toast('Link removed', 'success')
  }

  const filtered = catFilter === 'all' ? links : links.filter((l) => l.category === catFilter)
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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader />
      </div>
    )
  }

  if (loadError && links.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          background: cardBg,
          border: `0.5px solid ${border}`,
          borderRadius: '14px',
        }}
      >
        <p style={{ fontSize: '16px', fontWeight: 500, color: text, margin: '0 0 8px' }}>
          Quick links could not load
        </p>
        <p style={{ fontSize: '14px', color: muted, margin: '0 0 16px', lineHeight: 1.5 }}>
          {loadError.includes('does not exist') || loadError.includes('relation')
            ? 'The database table has not been created yet. Apply db/quick_links.sql in the Supabase SQL editor, then refresh.'
            : loadError}
        </p>
        <button
          type="button"
          onClick={() => void loadData()}
          style={{
            fontSize: '14px',
            padding: '10px 18px',
            borderRadius: '10px',
            background: '#1e6cb5',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <p style={{ fontSize: '15px', color: muted, margin: 0 }}>
          {links.length} link{links.length === 1 ? '' : 's'}
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
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
            Add link
          </button>
        )}
      </div>

      {showNew && canManage && (
        <div
          style={{
            background: cardBg,
            border: `0.5px solid ${border}`,
            borderRadius: '14px',
            padding: '18px',
            marginBottom: '18px',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 14px' }}>
            Add new link
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
              marginBottom: '10px',
            }}
          >
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Link title"
              style={inputStyle}
            />
            <input
              value={form.url}
              onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              placeholder="URL (e.g. drive.google.com)"
              style={inputStyle}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            <input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Short description (optional)"
              style={inputStyle}
            />
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              style={inputStyle}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => void addLink()}
              disabled={saving || !form.title.trim() || !form.url.trim()}
              style={{
                fontSize: '14px',
                padding: '10px 20px',
                borderRadius: '10px',
                background: '#1e6cb5',
                color: '#fff',
                border: 'none',
                cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                minHeight: '44px',
                opacity: !form.title.trim() || !form.url.trim() ? 0.5 : 1,
              }}
            >
              {saving ? 'Adding…' : 'Add link'}
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
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
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setCatFilter('all')}
            style={{
              fontSize: '15px',
              padding: '7px 16px',
              borderRadius: '20px',
              border: `0.5px solid ${catFilter === 'all' ? '#1e6cb5' : border}`,
              background: catFilter === 'all' ? 'rgba(30,108,181,0.12)' : cardBg,
              color: catFilter === 'all' ? '#5ba3e0' : muted,
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: '36px',
            }}
          >
            All
          </button>
          {[...new Set(links.map((l) => l.category))].map((cat) => {
            const cs = CAT_STYLES[cat] || CAT_STYLES.General
            const active = catFilter === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(active ? 'all' : cat)}
                style={{
                  fontSize: '15px',
                  padding: '7px 16px',
                  borderRadius: '20px',
                  border: `0.5px solid ${active ? cs.color : border}`,
                  background: active ? cs.bg : cardBg,
                  color: active ? cs.color : muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  minHeight: '36px',
                }}
              >
                {cs.emoji} {cat}
              </button>
            )
          })}
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: cardBg,
            border: `0.5px solid ${border}`,
            borderRadius: '14px',
          }}
        >
          <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 6px' }}>
            {links.length === 0 ? 'No links yet' : 'No links in this category'}
          </p>
          {canManage && links.length === 0 && (
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
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    padding: '4px 12px',
                    borderRadius: '20px',
                    background: cs.bg,
                    color: cs.color,
                  }}
                >
                  {cs.emoji} {category}
                </span>
                <span style={{ fontSize: '14px', color: muted }}>
                  {catLinks.length} {catLinks.length === 1 ? 'link' : 'links'}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '12px',
                }}
              >
                {catLinks.map((link) => (
                  <div
                    key={link.id}
                    style={{
                      background: cardBg,
                      border: `0.5px solid ${border}`,
                      borderRadius: '14px',
                      overflow: 'hidden',
                      transition: 'border-color 0.15s, transform 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLDivElement
                      el.style.borderColor = cs.color
                      el.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLDivElement
                      el.style.borderColor = border
                      el.style.transform = 'translateY(0)'
                    }}
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '16px',
                        textDecoration: 'none',
                      }}
                    >
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: cs.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cs.color} strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: text,
                            margin: '0 0 3px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {link.title}
                        </p>
                        {link.description && (
                          <p style={{ fontSize: '13px', color: muted, margin: '0 0 4px', lineHeight: 1.4 }}>
                            {link.description}
                          </p>
                        )}
                        <p
                          style={{
                            fontSize: '12px',
                            color: muted,
                            margin: 0,
                            opacity: 0.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {link.url.replace(/^https?:\/\//, '').split('/')[0]}
                        </p>
                      </div>
                    </a>
                    {canManage && (
                      <div
                        style={{
                          borderTop: `0.5px solid ${border}`,
                          padding: '6px 16px',
                          display: 'flex',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            if (await confirmDialog({ message: 'Remove this link from the library?', tone: 'danger', confirmLabel: 'Remove' })) void deleteLink(link.id)
                          }}
                          style={{
                            fontSize: '12px',
                            color: '#ef4444',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            opacity: 0.7,
                          }}
                        >
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
