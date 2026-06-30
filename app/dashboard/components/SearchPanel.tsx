'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { useRouter } from 'next/navigation'

interface SearchResult {
  id: string
  title: string
  type: 'production' | 'task' | 'knowledge' | 'idea'
  subtitle: string | null
  href: string
}

interface Props {
  onClose: () => void
}

export default function SearchPanel({ onClose }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const text   = 'var(--text-primary)'
  const muted  = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const bg     = 'var(--surface-1)'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    const [prodsRes, tasksRes, kbRes, ideasRes] = await Promise.all([
      supabase.from('productions').select('id, title, production_number, request_type_label, organizer_name').ilike('title', `%${q}%`).limit(5),
      supabase.from('tasks').select('id, title, status').ilike('title', `%${q}%`).neq('status', 'complete').limit(5),
      supabase.from('knowledge_base').select('id, title, category').ilike('title', `%${q}%`).limit(5),
      supabase.from('project_ideas').select('id, title, archived_at').ilike('title', `%${q}%`).is('archived_at', null).limit(5),
    ])
    const combined: SearchResult[] = [
      ...(prodsRes.data || []).map(p => ({ id: p.id, title: p.title, type: 'production' as const, subtitle: p.request_type_label || p.organizer_name, href: `/dashboard/productions/${p.production_number}` })),
      ...(tasksRes.data || []).map(t => ({ id: t.id, title: t.title, type: 'task' as const, subtitle: t.status, href: `/dashboard/tasks` })),
      ...(kbRes.data || []).map(k => ({ id: k.id, title: k.title, type: 'knowledge' as const, subtitle: k.category, href: `/dashboard/library?tab=articles` })),
      ...(ideasRes.data || []).map(i => ({ id: i.id, title: i.title, type: 'idea' as const, subtitle: 'Idea', href: `/dashboard/ideas` })),
    ]
    setResults(combined)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300)
    return () => clearTimeout(timer)
  }, [query, search])

  const typeIcon = (type: SearchResult['type']) => {
    if (type === 'production') return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
    )
    if (type === 'task') return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
    )
    if (type === 'idea') return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    )
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
    )
  }

  const typeColor = (type: SearchResult['type']) => {
    if (type === 'production') return 'var(--brand-primary)'
    if (type === 'task') return '#e8a020'
    if (type === 'idea') return '#22c55e'
    return '#9b85e0'
  }

  const handleSelect = (result: SearchResult) => {
    router.push(result.href)
    onClose()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', width: '560px', maxWidth: '90vw', background: bg, border: `0.5px solid ${border}`, borderRadius: '12px', boxShadow: dark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)', zIndex: 100, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: results.length > 0 ? `0.5px solid ${border}` : 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search productions, tasks, ideas, library..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '15px', color: text, fontFamily: 'inherit' }}
            onKeyDown={e => e.key === 'Escape' && onClose()}
          />
          {loading && <div style={{ width: '14px', height: '14px', border: `2px solid ${border}`, borderTopColor: 'var(--brand-primary)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
          <button onClick={onClose} style={{ background: 'none', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontSize: '13px', padding: '3px 8px', borderRadius: '4px', fontFamily: 'inherit' }}>Esc</button>
        </div>

        {results.length > 0 && (
          <div style={{ maxHeight: '360px', overflowY: 'auto' as const }}>
            {results.map(result => (
              <div
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelect(result)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', cursor: 'pointer', borderBottom: `0.5px solid ${border}` }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = hoverBg}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${typeColor(result.type)}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: typeColor(result.type), flexShrink: 0 }}>
                  {typeIcon(result.type)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{result.title}</p>
                  {result.subtitle && <p style={{ fontSize: '13px', color: muted, margin: '1px 0 0', textTransform: 'capitalize' as const }}>{result.subtitle}</p>}
                </div>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '6px', background: `${typeColor(result.type)}18`, color: typeColor(result.type), flexShrink: 0 }}>{result.type}</span>
              </div>
            ))}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && !loading && (
          <p style={{ color: muted, fontSize: '15px', textAlign: 'center' as const, padding: '20px' }}>No results for "{query}"</p>
        )}

        {query.length === 0 && (
          <div style={{ padding: '12px 16px' }}>
            <p style={{ fontSize: '13px', color: muted, margin: 0 }}>Search productions, tasks, ideas, and library articles</p>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}