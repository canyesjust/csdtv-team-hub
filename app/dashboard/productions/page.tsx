'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { getSchoolName } from '@/lib/schools'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Loader from '../components/Loader'

interface Production {
  id: string; production_number: number; title: string
  type: string | null; request_type_label: string | null; status: string | null
  organizer_name: string | null; organizer_email: string | null; school_department: string | null
  start_datetime: string | null; end_datetime: string | null; filming_location: string | null
  school_year: string | null; synced_at: string | null
  additional_notes: string | null; video_description: string | null
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
  checklist_items?: { completed: boolean }[]
}

interface TeamMember { id: string; name: string; avatar_color: string }

interface PanelChecklist { id: string; title: string; completed: boolean; sort_order: number }
interface PanelActivity { id: string; action: string; detail: string | null; created_at: string; team: { name: string } | null }

const STATUS_GROUPS = {
  pipeline: ['Idea/Request', 'In Progress'],
  approved: ['Approved/Scheduled'],
  other: ['Complete', 'Abandoned'],
}

const TYPE_COLORS: Record<string, string> = {
  'Photo Headshots': '#e8a020',
  'Create a Video(Film, Edit, Publish)': '#5ba3e0',
  'LiveStream Meeting': '#22c55e',
  'Record Meeting': '#9b85e0',
  'Podcast': '#f97316',
  'Board Meeting': '#ef4444',
  'Other, Unsure, Or Consultation': '#64748b',
}

function ProductionsPageContent() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [productions, setProductions] = useState<Production[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline')
  const [scope, setScope] = useState<'all' | 'mine' | 'unassigned'>(searchParams.get('scope') === 'mine' ? 'mine' : searchParams.get('scope') === 'unassigned' ? 'unassigned' : 'all')
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set())
  const [selectedProdId, setSelectedProdId] = useState<string | null>(null)
  const [panelChecklist, setPanelChecklist] = useState<PanelChecklist[]>([])
  const [panelActivity, setPanelActivity] = useState<PanelActivity[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const text    = dark ? '#f0f4ff' : '#1a1f36'
  const muted   = dark ? '#94a3b8' : '#6b7280'
  const border  = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg  = dark ? '#0d1525' : '#ffffff'
  const colBg   = dark ? 'rgba(255,255,255,0.02)' : '#f8fafc'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : '#f1f5f9'

  const isOverdue = (p: Production) => !!p.start_datetime && new Date(p.start_datetime) < new Date() && p.status !== 'Complete' && p.status !== 'Abandoned'
  const isPast = (p: Production) => !!p.start_datetime && new Date(p.start_datetime) < new Date()

  const sortProductions = (data: Production[]): Production[] => {
    const now = new Date()
    return [...data].sort((a, b) => {
      const aDate = a.start_datetime ? new Date(a.start_datetime) : null
      const bDate = b.start_datetime ? new Date(b.start_datetime) : null
      const aOverdue = isOverdue(a)
      const bOverdue = isOverdue(b)
      const aIsPast = aDate ? aDate < now : false
      const bIsPast = bDate ? bDate < now : false

      // Overdue items FIRST — most recent overdue at top
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      if (aOverdue && bOverdue) return (bDate?.getTime() || 0) - (aDate?.getTime() || 0)

      // Both have no date — sort by production number descending
      if (!aDate && !bDate) return b.production_number - a.production_number
      // No date goes to bottom
      if (!aDate) return 1
      if (!bDate) return -1
      // Completed past items sink below upcoming
      if (aIsPast && !bIsPast) return 1
      if (!aIsPast && bIsPast) return -1
      // Both past (completed) — most recent first
      if (aIsPast && bIsPast) return bDate.getTime() - aDate.getTime()
      // Both upcoming — soonest first
      return aDate.getTime() - bDate.getTime()
    })
  }

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const [prodsRes, teamRes] = await Promise.all([
      supabase.from('productions').select('*, production_members(user_id, team(name, avatar_color)), checklist_items(completed)'),
      supabase.from('team').select('id, name, avatar_color').eq('active', true),
    ])
    if (session) {
      const { data: user } = await supabase.from('team').select('id').eq('supabase_user_id', session.user.id).single()
      if (user) setCurrentUserId(user.id)
    }
    const sorted = sortProductions(prodsRes.data || [])
    setProductions(sorted)
    setTeam(teamRes.data || [])
    // Load dismissed conflicts
    const { data: dismissedData } = await supabase.from('dismissed_conflicts').select('production_a_id, production_b_id')
    const dSet = new Set<string>()
    ;(dismissedData || []).forEach((d: any) => { dSet.add(`${d.production_a_id}-${d.production_b_id}`); dSet.add(`${d.production_b_id}-${d.production_a_id}`) })
    setDismissedConflicts(dSet)
    const latestSync = (prodsRes.data || []).reduce<string | null>((max, p) =>
      p.synced_at && (!max || p.synced_at > max) ? p.synced_at : max, null)
    if (latestSync) setLastSync(latestSync)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const selectProduction = useCallback(async (prodId: string) => {
    if (selectedProdId === prodId) { setSelectedProdId(null); return }
    setSelectedProdId(prodId)
    setPanelLoading(true)
    const prod = productions.find(p => p.id === prodId)
    if (!prod) { setPanelLoading(false); return }
    const [checkRes, actRes] = await Promise.all([
      supabase.from('checklist_items').select('id, title, completed, sort_order').eq('production_id', prodId).order('sort_order'),
      supabase.from('production_activity').select('id, action, detail, created_at, team:team(name)').eq('production_id', prodId).order('created_at', { ascending: false }).limit(5),
    ])
    setPanelChecklist(checkRes.data || [])
    setPanelActivity((actRes.data as any) || [])
    setPanelLoading(false)
  }, [selectedProdId, productions, supabase])

  const togglePanelChecklistItem = async (item: PanelChecklist) => {
    const updated = !item.completed
    await supabase.from('checklist_items').update({ completed: updated, completed_at: updated ? new Date().toISOString() : null }).eq('id', item.id)
    setPanelChecklist(prev => prev.map(c => c.id === item.id ? { ...c, completed: updated } : c))
    // Update the production's checklist_items in the list too
    setProductions(prev => prev.map(p => {
      if (p.id !== selectedProdId) return p
      const items = (p.checklist_items || []).map((ci, idx) => idx < panelChecklist.length ? { completed: panelChecklist[idx].id === item.id ? updated : panelChecklist[idx].completed } : ci)
      return { ...p, checklist_items: items }
    }))
  }

  const dismissConflict = async (aId: string, bId: string) => {
    if (!currentUserId) return
    await supabase.from('dismissed_conflicts').insert({ production_a_id: aId, production_b_id: bId, dismissed_by: currentUserId })
    setDismissedConflicts(prev => { const n = new Set(prev); n.add(`${aId}-${bId}`); n.add(`${bId}-${aId}`); return n })
  }

  const getTypeLabel = (p: Production) => p.request_type_label || p.type || 'Unknown'
  const getTypeColor = (p: Production) => TYPE_COLORS[getTypeLabel(p)] || '#64748b'

  const getProgress = (p: Production) => {
    const items = p.checklist_items || []
    if (items.length === 0) return null
    const done = items.filter(i => i.completed).length
    return { done, total: items.length, pct: Math.round((done / items.length) * 100) }
  }

  const formatDate = (d: string | null) => {
    if (!d) return null
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const allTypes = [...new Set(productions.map(p => getTypeLabel(p)))].filter(Boolean).sort()

  const filtered = productions.filter(p => {
    const matchSearch = search === '' ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.organizer_name?.toLowerCase().includes(search.toLowerCase()) ||
      getTypeLabel(p).toLowerCase().includes(search.toLowerCase()) ||
      String(p.production_number).includes(search)
    const matchType = typeFilter === 'all' || getTypeLabel(p) === typeFilter
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    const matchScope = scope === 'all' || (scope === 'mine' && currentUserId && (p.production_members || []).some(m => m.user_id === currentUserId)) || (scope === 'unassigned' && (p.production_members || []).length === 0)
    return matchSearch && matchType && matchStatus && matchScope
  })

  const pipeline    = filtered.filter(p => STATUS_GROUPS.pipeline.includes(p.status || ''))
  const approved    = filtered.filter(p => STATUS_GROUPS.approved.includes(p.status || ''))
  const other       = filtered.filter(p => STATUS_GROUPS.other.includes(p.status || '') || !p.status || (!STATUS_GROUPS.pipeline.includes(p.status) && !STATUS_GROUPS.approved.includes(p.status)))
  const inProgress  = pipeline.filter(p => p.status === 'In Progress')
  const ideaRequest = pipeline.filter(p => p.status === 'Idea/Request')

  const ProductionCard = ({ prod }: { prod: Production }) => {
    const past      = isPast(prod)
    const overdue   = isOverdue(prod)
    const typeLabel = getTypeLabel(prod)
    const typeColor = getTypeColor(prod)
    const progress  = getProgress(prod)
    const members   = prod.production_members || []

    // Health indicator
    const noTeam = members.length === 0 && !past
    const daysUntil = prod.start_datetime ? Math.ceil((new Date(prod.start_datetime).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
    const approaching = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7
    const checklistDone = progress ? progress.pct === 100 : false
    const needsAttention = noTeam || (approaching && !checklistDone && !past) || overdue
    const healthColor = overdue ? '#ef4444' : noTeam ? '#ef4444' : (approaching && !checklistDone) ? '#f59e0b' : (checklistDone ? '#22c55e' : null)
    const healthTip = overdue ? 'Overdue — not marked complete' : noTeam ? 'Nobody assigned' : (approaching && !checklistDone) ? `${daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days away`} — checklist incomplete` : checklistDone ? 'Checklist complete' : null

    return (
      <div onClick={() => selectProduction(prod.id)} style={{ textDecoration: 'none', display: 'block', opacity: past && !overdue ? 0.45 : 1, transition: 'opacity 0.15s', cursor: 'pointer' }}>
        <div
          style={{ background: selectedProdId === prod.id ? (dark ? 'rgba(30,108,181,0.15)' : 'rgba(30,108,181,0.08)') : cardBg, border: `0.5px solid ${selectedProdId === prod.id ? 'rgba(30,108,181,0.4)' : needsAttention ? (healthColor + '40') : border}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '8px', cursor: 'pointer', transition: 'all 0.15s', borderLeft: `3px solid ${overdue ? '#ef4444' : typeColor}` }}
          onMouseEnter={e => { if (selectedProdId !== prod.id) { (e.currentTarget as HTMLDivElement).style.background = hoverBg; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = selectedProdId === prod.id ? (dark ? 'rgba(30,108,181,0.15)' : 'rgba(30,108,181,0.08)') : cardBg; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '11px', color: muted, margin: '0 0 3px' }}>
                #{prod.production_number}
                {overdue && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#ef4444', background: 'rgba(239,68,68,0.12)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Overdue</span>}
                {past && !overdue && <span style={{ marginLeft: '6px', fontSize: '10px', color: muted, background: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0', padding: '1px 6px', borderRadius: '4px' }}>Past</span>}
                {healthColor && !past && <span title={healthTip || ''} style={{ marginLeft: '6px', display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: healthColor, verticalAlign: 'middle' }} />}
              </p>
              <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0, lineHeight: 1.3 }}>{prod.title}</p>
            </div>
            {members.length > 0 ? (
              <div style={{ display: 'flex', flexShrink: 0 }}>
                {members.slice(0, 3).map((m, i) => m.team && (
                  <div key={m.user_id} title={m.team.name} style={{ width: '22px', height: '22px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', marginLeft: i > 0 ? '-6px' : 0, border: `2px solid ${cardBg}`, zIndex: members.length - i, position: 'relative' }}>
                    {m.team.name.slice(0, 2).toUpperCase()}
                  </div>
                ))}
              </div>
            ) : !past ? (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 500, flexShrink: 0 }}>Unassigned</span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: progress ? '8px' : '0' }}>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', background: `${typeColor}18`, color: typeColor, fontWeight: 500 }}>{typeLabel}</span>
            {prod.organizer_name && <span style={{ fontSize: '12px', color: muted }}>{prod.organizer_name}</span>}
            {prod.start_datetime && <span style={{ fontSize: '12px', color: muted }}>· {formatDate(prod.start_datetime)}</span>}
          </div>

          {progress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '4px', background: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${progress.pct}%`, height: '100%', background: progress.pct === 100 ? '#22c55e' : typeColor, borderRadius: '2px' }} />
              </div>
              <span style={{ fontSize: '11px', color: muted, flexShrink: 0 }}>{progress.done}/{progress.total}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const ProductionRow = ({ prod }: { prod: Production }) => {
    const past      = isPast(prod)
    const overdue   = isOverdue(prod)
    const typeLabel = getTypeLabel(prod)
    const typeColor = getTypeColor(prod)
    const progress  = getProgress(prod)
    const members   = prod.production_members || []

    return (
      <div
        onClick={() => selectProduction(prod.id)}
        style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', borderBottom: `0.5px solid ${border}`, transition: 'background 0.1s', opacity: past && !overdue ? 0.45 : 1, cursor: 'pointer', background: selectedProdId === prod.id ? (dark ? 'rgba(30,108,181,0.15)' : 'rgba(30,108,181,0.08)') : 'transparent' }}
        onMouseEnter={e => { if (selectedProdId !== prod.id) (e.currentTarget as HTMLDivElement).style.background = hoverBg }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = selectedProdId === prod.id ? (dark ? 'rgba(30,108,181,0.15)' : 'rgba(30,108,181,0.08)') : 'transparent' }}
      >
        <span style={{ fontSize: '13px', color: muted, minWidth: '40px' }}>#{prod.production_number}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{prod.title}</p>
          {prod.organizer_name && <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>{prod.organizer_name}</p>}
        </div>
        <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: `${typeColor}18`, color: typeColor, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{typeLabel}</span>
        {progress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, minWidth: '80px' }}>
            <div style={{ flex: 1, height: '4px', background: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${progress.pct}%`, height: '100%', background: progress.pct === 100 ? '#22c55e' : typeColor, borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '11px', color: muted }}>{progress.pct}%</span>
          </div>
        )}
        {prod.start_datetime && (
          <span style={{ fontSize: '12px', color: overdue ? '#ef4444' : past ? muted : text, flexShrink: 0 }}>
            {formatDate(prod.start_datetime)}
            {overdue && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#ef4444', background: 'rgba(239,68,68,0.12)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Overdue</span>}
            {past && !overdue && <span style={{ marginLeft: '6px', fontSize: '10px', color: muted, background: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0', padding: '1px 6px', borderRadius: '4px' }}>Past</span>}
          </span>
        )}
        {members.length > 0 && (
          <div style={{ display: 'flex', flexShrink: 0 }}>
            {members.slice(0, 3).map((m, i) => m.team && (
              <div key={m.user_id} style={{ width: '22px', height: '22px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', marginLeft: i > 0 ? '-6px' : 0, border: `2px solid ${cardBg}` }}>
                {m.team.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
        )}
        <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: prod.status === 'Approved/Scheduled' ? 'rgba(34,197,94,0.12)' : prod.status === 'In Progress' ? 'rgba(245,158,11,0.12)' : prod.status === 'Complete' ? 'rgba(30,108,181,0.12)' : 'rgba(100,116,139,0.12)', color: prod.status === 'Approved/Scheduled' ? '#22c55e' : prod.status === 'In Progress' ? '#f59e0b' : prod.status === 'Complete' ? '#5ba3e0' : muted, flexShrink: 0 }}>
          {prod.status || 'Unknown'}
        </span>
      </div>
    )
  }

  const ColHeader = ({ label, count, color }: { label: string; count: number; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '0 2px' }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '13px', fontWeight: 700, color: text, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: '12px', color: muted, background: dark ? 'rgba(255,255,255,0.06)' : '#e2e8f0', padding: '1px 8px', borderRadius: '20px' }}>{count}</span>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )

  const selectedProd = productions.find(p => p.id === selectedProdId) || null

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', gap: '16px' }}>
      <div style={{ flex: 1, minWidth: 0, transition: 'all 0.2s' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: text, margin: 0 }}>Productions</h1>
          <p style={{ fontSize: '14px', color: muted, margin: '3px 0 0' }}>
            {scope === 'mine' ? `${filtered.length} assigned to you` : scope === 'unassigned' ? `${filtered.length} with nobody assigned` : `${productions.length} total · ${inProgress.length} in progress · ${approved.length} approved`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: muted }}>
            {lastSync ? `Synced ${new Date(lastSync).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
          </span>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: 500 }}>Live from productions site</span>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
          {(['all', 'mine', 'unassigned'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              style={{ padding: '10px 16px', border: 'none', background: scope === s ? '#1e6cb5' : 'transparent', color: scope === s ? '#fff' : muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: scope === s ? 500 : 400 }}
            >
              {s === 'all' ? 'All' : s === 'mine' ? 'Mine' : 'Unassigned'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, organizer, type, number..."
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: '14px', color: text, fontFamily: 'inherit', width: '100%', minHeight: '24px' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
          )}
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', minHeight: '44px', cursor: 'pointer' }}
        >
          <option value="all">All types</option>
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {view === 'list' && (
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', minHeight: '44px', cursor: 'pointer' }}
          >
            <option value="all">All statuses</option>
            <option value="Idea/Request">Idea/Request</option>
            <option value="In Progress">In Progress</option>
            <option value="Approved/Scheduled">Approved/Scheduled</option>
            <option value="Complete">Complete</option>
            <option value="Abandoned">Abandoned</option>
          </select>
        )}
        <div style={{ display: 'flex', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
          {(['pipeline', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{ padding: '10px 16px', border: 'none', background: view === v ? '#1e6cb5' : 'transparent', color: view === v ? '#fff' : muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: view === v ? 500 : 400, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {v === 'pipeline' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="5" height="18"/><rect x="10" y="3" width="5" height="18"/><rect x="17" y="3" width="4" height="18"/>
                  </svg>
                  Pipeline
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  List
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Health dot legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', fontSize: '12px', color: muted, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /> Unassigned</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /> Approaching — checklist incomplete</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Checklist complete</span>
      </div>

      {/* Scheduling conflicts */}
      {(() => {
        const upcoming = filtered.filter(p => p.start_datetime && p.status !== 'Complete' && p.status !== 'Abandoned' && new Date(p.start_datetime) >= new Date())
        const allConflicts: { a: Production; b: Production }[] = []
        for (let i = 0; i < upcoming.length; i++) {
          for (let j = i + 1; j < upcoming.length; j++) {
            const da = new Date(upcoming[i].start_datetime!)
            const db = new Date(upcoming[j].start_datetime!)
            if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate() && Math.abs(da.getTime() - db.getTime()) < 3600000) {
              allConflicts.push({ a: upcoming[i], b: upcoming[j] })
            }
          }
        }
        const conflicts = allConflicts.filter(c => !dismissedConflicts.has(`${c.a.id}-${c.b.id}`))
        if (conflicts.length === 0) return null
        return (
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', margin: '0 0 6px' }}>⚠ {conflicts.length} scheduling conflict{conflicts.length !== 1 ? 's' : ''}</p>
            {conflicts.slice(0, 5).map((c, i) => {
              const d = new Date(c.a.start_datetime!)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                  <p style={{ fontSize: '12px', color: muted, margin: 0, flex: 1 }}>{d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: <strong style={{ color: text }}>#{c.a.production_number} {c.a.title}</strong> and <strong style={{ color: text }}>#{c.b.production_number} {c.b.title}</strong></p>
                  <button onClick={() => dismissConflict(c.a.id, c.b.id)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Accept</button>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* PIPELINE VIEW */}
      {view === 'pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

          {/* LEFT: In Progress + Idea/Request */}
          <div>
            {inProgress.length > 0 && (
              <div style={{ background: colBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
                <ColHeader label="In Progress" count={inProgress.length} color="#f59e0b" />
                {inProgress.map(p => <ProductionCard key={p.id} prod={p} />)}
              </div>
            )}
            <div style={{ background: colBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px' }}>
              <ColHeader label="Idea / Request" count={ideaRequest.length} color="#94a3b8" />
              {ideaRequest.length === 0 ? (
                <p style={{ fontSize: '14px', color: muted, textAlign: 'center' as const, padding: '24px 0', margin: 0 }}>No incoming requests</p>
              ) : ideaRequest.map(p => <ProductionCard key={p.id} prod={p} />)}
            </div>
          </div>

          {/* RIGHT: Approved/Scheduled */}
          <div>
            <div style={{ background: colBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
              <ColHeader label="Approved / Scheduled" count={approved.length} color="#22c55e" />
              {approved.length === 0 ? (
                <p style={{ fontSize: '14px', color: muted, textAlign: 'center' as const, padding: '24px 0', margin: 0 }}>No approved productions</p>
              ) : approved.map(p => <ProductionCard key={p.id} prod={p} />)}
            </div>
            {other.length > 0 && (
              <div style={{ background: colBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px' }}>
                <ColHeader label="Complete / Other" count={other.length} color="#5ba3e0" />
                {other.slice(0, 10).map(p => <ProductionCard key={p.id} prod={p} />)}
                {other.length > 10 && (
                  <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '8px 0 0', margin: 0 }}>
                    {other.length - 10} more — switch to List view to see all
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {view === 'list' && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: '15px', color: muted, textAlign: 'center' as const, padding: '48px 20px', margin: 0 }}>
              No productions match your search
            </p>
          ) : filtered.map(prod => <ProductionRow key={prod.id} prod={prod} />)}
        </div>
      )}
      </div>

      {/* QUICK VIEW PANEL */}
      {selectedProd && (
        <div style={{ width: '420px', flexShrink: 0, position: 'sticky' as const, top: '0', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' as const, background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px' }}>
          {panelLoading ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 0', color: muted }}>Loading...</div>
          ) : (
            <div>
              {/* Panel header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>#{selectedProd.production_number}</p>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: text, margin: 0, lineHeight: 1.3 }}>{selectedProd.title}</h2>
                </div>
                <button onClick={() => setSelectedProdId(null)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', padding: '4px', fontSize: '18px', flexShrink: 0, minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Open full details link */}
              <Link href={`/dashboard/productions/${selectedProd.production_number}`} style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#5ba3e0', textDecoration: 'none', padding: '8px 12px', background: dark ? 'rgba(30,108,181,0.1)' : 'rgba(30,108,181,0.06)', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' as const }}>
                Open full details →
              </Link>

              {/* Status & type */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: selectedProd.status === 'Approved/Scheduled' ? 'rgba(34,197,94,0.12)' : selectedProd.status === 'In Progress' ? 'rgba(245,158,11,0.12)' : selectedProd.status === 'Complete' ? 'rgba(30,108,181,0.12)' : 'rgba(100,116,139,0.12)', color: selectedProd.status === 'Approved/Scheduled' ? '#22c55e' : selectedProd.status === 'In Progress' ? '#f59e0b' : selectedProd.status === 'Complete' ? '#5ba3e0' : muted }}>
                  {selectedProd.status || 'Unknown'}
                </span>
                <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: `${getTypeColor(selectedProd)}18`, color: getTypeColor(selectedProd) }}>
                  {getTypeLabel(selectedProd)}
                </span>
                {isOverdue(selectedProd) && <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 600 }}>Overdue</span>}
              </div>

              {/* Key details */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px', marginBottom: '16px', padding: '12px', background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', borderRadius: '8px' }}>
                {selectedProd.start_datetime && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: muted }}>Date</span>
                    <span style={{ color: text, fontWeight: 500 }}>{new Date(selectedProd.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {new Date(selectedProd.start_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                )}
                {selectedProd.end_datetime && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: muted }}>End</span>
                    <span style={{ color: text, fontWeight: 500 }}>{new Date(selectedProd.end_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                )}
                {(selectedProd.filming_location || selectedProd.school_department) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: muted }}>Location</span>
                    <span style={{ color: text, fontWeight: 500 }}>{getSchoolName(selectedProd.filming_location) || getSchoolName(selectedProd.school_department) || selectedProd.filming_location || ''}</span>
                  </div>
                )}
              </div>

              {/* Organizer */}
              {selectedProd.organizer_name && (
                <div style={{ marginBottom: '16px', padding: '12px', background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', borderRadius: '8px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px' }}>Organizer</p>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>{selectedProd.organizer_name}</p>
                  {selectedProd.organizer_email && <a href={`mailto:${selectedProd.organizer_email}`} style={{ fontSize: '13px', color: '#5ba3e0', textDecoration: 'none' }}>{selectedProd.organizer_email}</a>}
                </div>
              )}

              {/* Notes / Description */}
              {(selectedProd.additional_notes || selectedProd.video_description) && (
                <div style={{ marginBottom: '16px', padding: '12px', background: dark ? 'rgba(30,58,95,0.15)' : '#eff6ff', borderRadius: '8px', borderLeft: '3px solid #1e3a5f' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#1e3a5f', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px' }}>Notes</p>
                  <p style={{ fontSize: '13px', color: text, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>{selectedProd.additional_notes || selectedProd.video_description}</p>
                </div>
              )}

              {/* Team */}
              {(selectedProd.production_members || []).length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 8px' }}>Team</p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(selectedProd.production_members || []).map(m => m.team && (
                      <span key={m.user_id} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: m.team.avatar_color + '22', color: m.team.avatar_color, fontWeight: 500 }}>{m.team.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist */}
              {panelChecklist.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: 0 }}>Checklist</p>
                    <span style={{ fontSize: '11px', color: muted }}>{panelChecklist.filter(c => c.completed).length}/{panelChecklist.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '2px' }}>
                    {panelChecklist.map(item => (
                      <div key={item.id} onClick={() => togglePanelChecklistItem(item)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = hoverBg}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                      >
                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `1.5px solid ${item.completed ? '#22c55e' : border}`, background: item.completed ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                          {item.completed && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <span style={{ fontSize: '13px', color: item.completed ? muted : text, textDecoration: item.completed ? 'line-through' : 'none', lineHeight: 1.3 }}>{item.title}</span>
                      </div>
                    ))}
                  </div>
                  {/* Progress bar */}
                  <div style={{ marginTop: '8px', height: '4px', background: dark ? 'rgba(255,255,255,0.06)' : '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${(panelChecklist.filter(c => c.completed).length / panelChecklist.length) * 100}%`, height: '100%', background: panelChecklist.every(c => c.completed) ? '#22c55e' : '#5ba3e0', borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}

              {/* Recent activity */}
              {panelActivity.length > 0 && (
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 8px' }}>Recent Activity</p>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                    {panelActivity.map(a => (
                      <div key={a.id} style={{ fontSize: '12px', color: muted, padding: '4px 0', borderBottom: `0.5px solid ${border}` }}>
                        <span style={{ color: text, fontWeight: 500 }}>{a.team?.name || 'System'}</span>
                        {' '}{a.action.replace(/_/g, ' ')}
                        {a.detail && <span style={{ color: muted }}> — {a.detail}</span>}
                        <span style={{ display: 'block', fontSize: '11px', color: muted, marginTop: '2px' }}>{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProductionsPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>}>
      <ProductionsPageContent />
    </Suspense>
  )
}