'use client'

import { useEffect, useState, useCallback, useMemo, useRef, Suspense, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { getSchoolName } from '@/lib/schools'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Loader from '../components/Loader'
import { ZoneHeader } from '../components/ZoneHeader'
import { uiStyles, statusBadge, statusTone } from '@/lib/ui/styles'
import { toast } from '@/lib/toast'

interface Production {
  id: string; production_number: number; title: string
  type: string | null; request_type_label: string | null; status: string | null
  organizer_name: string | null; organizer_email: string | null; school_department: string | null
  is_on_behalf: boolean | null
  submitter_name: string | null
  submitter_email: string | null
  livestream_url: string | null
  youtube_link_email_sent_at: string | null
  start_datetime: string | null; end_datetime: string | null; filming_location: string | null
  school_year: string | null; synced_at: string | null
  additional_notes: string | null; video_description: string | null
  team_notes: string | null
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
  checklist_items?: { completed: boolean }[]
}

interface TeamMember { id: string; name: string; avatar_color: string; email: string }
interface CurrentUser { id: string; name: string; email: string }

interface PanelChecklist { id: string; title: string; completed: boolean; sort_order: number }
interface PanelActivity { id: string; action: string; detail: string | null; created_at: string; team: { name: string } | null }

const PIPELINE_STATUSES = ['Idea/Request', 'In Progress'] as const
const APPROVED_STATUSES = ['Approved/Scheduled'] as const
const TERMINAL_STATUSES = ['Complete', 'Abandoned'] as const

const STATUS_TONE_MAP: Record<string, keyof typeof statusTone | null> = {
  'In Progress': 'warning',
  'Approved/Scheduled': 'success',
  'Complete': 'info',
  'Abandoned': null,
  'Idea/Request': null,
}

const STATUS_DISPLAY: Record<string, string> = {
  'Idea/Request': 'Idea / Request',
  'In Progress': 'In Progress',
  'Approved/Scheduled': 'Approved / Scheduled',
  'Complete': 'Complete',
  'Abandoned': 'Abandoned',
}

// Production type accent colors — sourced from the district site's request types
const TYPE_COLORS: Record<string, string> = {
  'Photo Headshots': '#e8a020',
  'Create a Video(Film, Edit, Publish)': '#5ba3e0',
  'LiveStream Meeting': '#22c55e',
  'Record Meeting': '#9b85e0',
  'Podcast': '#f97316',
  'Board Meeting': '#ef4444',
  'Other, Unsure, Or Consultation': '#64748b',
}

type FocusFilter = 'all' | 'today' | 'this-week' | 'overdue' | 'unstaffed' | 'upcoming'
type Scope = 'all' | 'mine' | 'unassigned'
type View = 'pipeline' | 'list'

function daysFromToday(d: string | null): number | null {
  if (!d) return null
  const eventDay = new Date(d)
  eventDay.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((eventDay.getTime() - today.getTime()) / 86400000)
}

function isOverdueProd(p: Production): boolean {
  if (!p.start_datetime) return false
  if (p.status === 'Complete' || p.status === 'Abandoned') return false
  return new Date(p.start_datetime).getTime() < Date.now()
}

function isPastProd(p: Production): boolean {
  if (!p.start_datetime) return false
  return new Date(p.start_datetime).getTime() < Date.now()
}

function relativeTime(d: string | null): string {
  if (!d) return ''
  const diffMs = Date.now() - new Date(d).getTime()
  if (diffMs < 0) return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function primaryContactLabel(prod: Production): string {
  if (prod.organizer_name) return prod.organizer_name
  if (prod.organizer_email) return prod.organizer_email
  if (prod.is_on_behalf) return 'Organizer not yet synced'
  return prod.submitter_name || prod.submitter_email || 'No organizer listed'
}

function ProductionsPageContent() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [productions, setProductions] = useState<Production[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [view, setView] = useState<View>('pipeline')
  const initialScope: Scope = searchParams.get('scope') === 'mine' ? 'mine' : searchParams.get('scope') === 'unassigned' ? 'unassigned' : 'all'
  const [scope, setScope] = useState<Scope>(initialScope)
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all')
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set())
  const [conflictsExpanded, setConflictsExpanded] = useState(true)
  const [overdueExpanded, setOverdueExpanded] = useState(true)
  const [selectedProdId, setSelectedProdId] = useState<string | null>(null)
  const [panelChecklist, setPanelChecklist] = useState<PanelChecklist[]>([])
  const [panelActivity, setPanelActivity] = useState<PanelActivity[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelTeamNotes, setPanelTeamNotes] = useState('')
  const [savingTeamNotes, setSavingTeamNotes] = useState(false)
  const [teamNotesSavedFlash, setTeamNotesSavedFlash] = useState(false)
  const [memberToAdd, setMemberToAdd] = useState('')
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [showOverflow, setShowOverflow] = useState(false)
  const overflowRef = useRef<HTMLDivElement | null>(null)

  const text     = 'var(--text-primary)'
  const muted    = 'var(--text-muted)'
  const border   = 'var(--border-subtle)'
  const cardBg   = 'var(--surface-1)'
  const surface2 = 'var(--surface-2)'
  const colBg    = 'var(--surface-2)'
  const hoverBg  = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  const success = statusTone.success.color
  const successBg = statusTone.success.background
  const warning = statusTone.warning.color
  const warningBg = statusTone.warning.background
  const danger = statusTone.danger.color
  const dangerBg = statusTone.danger.background
  const info = statusTone.info.color

  // Sort: overdue first → upcoming soonest → no date → past most-recent
  const sortProductions = useCallback((data: Production[]): Production[] => {
    const now = Date.now()
    return [...data].sort((a, b) => {
      const aTs = a.start_datetime ? new Date(a.start_datetime).getTime() : null
      const bTs = b.start_datetime ? new Date(b.start_datetime).getTime() : null
      const aOverdue = isOverdueProd(a)
      const bOverdue = isOverdueProd(b)
      const aPast = aTs !== null && aTs < now
      const bPast = bTs !== null && bTs < now
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      if (aOverdue && bOverdue) return (bTs ?? 0) - (aTs ?? 0)
      if (aTs === null && bTs === null) return b.production_number - a.production_number
      if (aTs === null) return 1
      if (bTs === null) return -1
      if (aPast && !bPast) return 1
      if (!aPast && bPast) return -1
      if (aPast && bPast) return bTs - aTs
      return aTs - bTs
    })
  }, [])

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const [prodsRes, teamRes] = await Promise.all([
      supabase.from('productions').select('*, production_members(user_id, team(name, avatar_color)), checklist_items(completed)'),
      supabase.from('team').select('id, name, avatar_color, email').eq('active', true).order('name'),
    ])
    const prodsData = prodsRes.data
    setTeam(teamRes.data || [])
    if (session) {
      const { data: user } = await supabase.from('team').select('id, name, email').eq('supabase_user_id', session.user.id).single()
      if (user) setCurrentUser(user)
    }
    // Defensive normalization in case the sync sends prefixed values from the district site
    const cleaned = (prodsData || []).map(p => ({
      ...p,
      status: p.status ? p.status.replace(/^\d+\s*-\s*/, '') : p.status
    }))
    setProductions(sortProductions(cleaned))

    const { data: dismissedData } = await supabase.from('dismissed_conflicts').select('production_a_id, production_b_id')
    const dSet = new Set<string>()
    ;(dismissedData || []).forEach((d: any) => { dSet.add(`${d.production_a_id}-${d.production_b_id}`); dSet.add(`${d.production_b_id}-${d.production_a_id}`) })
    setDismissedConflicts(dSet)

    const latestSync = (prodsData || []).reduce<string | null>((max, p) =>
      p.synced_at && (!max || p.synced_at > max) ? p.synced_at : max, null)
    if (latestSync) setLastSync(latestSync)
    setLoading(false)
  }, [supabase, sortProductions])

  useEffect(() => { loadData() }, [loadData])

  // Close overflow on outside click / Escape
  useEffect(() => {
    if (!showOverflow) return
    const onDown = (e: MouseEvent) => {
      if (!overflowRef.current) return
      if (!overflowRef.current.contains(e.target as Node)) setShowOverflow(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowOverflow(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showOverflow])

  // Body scroll lock + Escape close for drawer on mobile
  useEffect(() => {
    if (!selectedProdId || typeof window === 'undefined') return
    const isMobile = window.matchMedia('(max-width: 1023px)').matches
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [selectedProdId])

  useEffect(() => {
    if (!selectedProdId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedProdId(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedProdId])

  const selectProduction = useCallback(async (prodId: string) => {
    if (selectedProdId === prodId) { setSelectedProdId(null); return }
    setSelectedProdId(prodId)
    setPanelLoading(true)
    const prod = productions.find(p => p.id === prodId)
    setPanelTeamNotes(prod?.team_notes || '')
    setMemberToAdd('')
    setNewChecklistTitle('')
    try {
      const [checkRes, actRes] = await Promise.all([
        supabase.from('checklist_items').select('id, title, completed, sort_order').eq('production_id', prodId).order('sort_order'),
        supabase.from('production_activity').select('id, action, detail, created_at, team:team(name)').eq('production_id', prodId).order('created_at', { ascending: false }).limit(5),
      ])
      // Checklist is the critical data for this panel; activity is optional.
      if (checkRes.error) {
        toast('Failed to load production details', 'error')
        setPanelChecklist([])
      } else {
        setPanelChecklist(checkRes.data || [])
      }
      if (actRes.error) {
        setPanelActivity([])
      } else {
        setPanelActivity((actRes.data as any) || [])
      }
    } catch {
      toast('Failed to load production details', 'error')
      setPanelChecklist([])
      setPanelActivity([])
    } finally {
      setPanelLoading(false)
    }
  }, [selectedProdId, supabase, productions])

  // Sync panelTeamNotes when underlying production changes
  useEffect(() => {
    if (!selectedProdId) return
    const prod = productions.find(p => p.id === selectedProdId)
    if (prod && prod.team_notes !== panelTeamNotes) {
      setPanelTeamNotes(prod.team_notes || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProdId])

  const logPanelActivity = useCallback(async (action: string, detail: string | null) => {
    if (!selectedProdId || !currentUser) return
    const { data } = await supabase.from('production_activity')
      .insert({ production_id: selectedProdId, user_id: currentUser.id, action, detail })
      .select('id, action, detail, created_at, team:team(name)').single()
    if (data) setPanelActivity(prev => [data as any, ...prev].slice(0, 5))
  }, [selectedProdId, currentUser, supabase])

  const togglePanelChecklistItem = async (item: PanelChecklist) => {
    const updated = !item.completed
    const { error } = await supabase.from('checklist_items').update({ completed: updated, completed_at: updated ? new Date().toISOString() : null }).eq('id', item.id)
    if (error) { toast('Failed to update checklist', 'error'); return }
    const nextChecklist = panelChecklist.map(c => c.id === item.id ? { ...c, completed: updated } : c)
    setPanelChecklist(nextChecklist)
    // Rebuild the production's checklist_items from the new panel state — order-independent
    const totalCompleted = nextChecklist.filter(c => c.completed).length
    const synthetic = nextChecklist.map((_, i) => ({ completed: i < totalCompleted }))
    setProductions(prev => prev.map(p => p.id === selectedProdId ? { ...p, checklist_items: synthetic } : p))
  }

  const addPanelChecklistItem = async () => {
    const title = newChecklistTitle.trim()
    if (!title || !selectedProdId) return
    const { data, error } = await supabase.from('checklist_items')
      .insert({ production_id: selectedProdId, title, completed: false, sort_order: panelChecklist.length })
      .select('id, title, completed, sort_order').single()
    if (error || !data) { toast('Failed to add checklist item', 'error'); return }
    const nextChecklist = [...panelChecklist, data]
    setPanelChecklist(nextChecklist)
    setNewChecklistTitle('')
    const synthetic = nextChecklist.map(c => ({ completed: c.completed }))
    setProductions(prev => prev.map(p => p.id === selectedProdId ? { ...p, checklist_items: synthetic } : p))
  }

  const removePanelChecklistItem = async (itemId: string) => {
    if (!selectedProdId) return
    const { error } = await supabase.from('checklist_items').delete().eq('id', itemId)
    if (error) { toast('Failed to remove checklist item', 'error'); return }
    const nextChecklist = panelChecklist.filter(c => c.id !== itemId)
    setPanelChecklist(nextChecklist)
    const synthetic = nextChecklist.map(c => ({ completed: c.completed }))
    setProductions(prev => prev.map(p => p.id === selectedProdId ? { ...p, checklist_items: synthetic } : p))
  }

  const savePanelTeamNotes = async () => {
    if (!selectedProdId) return
    const prod = productions.find(p => p.id === selectedProdId)
    if (!prod || prod.team_notes === panelTeamNotes) return
    setSavingTeamNotes(true)
    const { error } = await supabase.from('productions').update({ team_notes: panelTeamNotes || null }).eq('id', selectedProdId)
    setSavingTeamNotes(false)
    if (error) { toast('Failed to save notes', 'error'); return }
    setProductions(prev => prev.map(p => p.id === selectedProdId ? { ...p, team_notes: panelTeamNotes || null } : p))
    setTeamNotesSavedFlash(true)
    setTimeout(() => setTeamNotesSavedFlash(false), 2000)
  }

  const addPanelMember = async () => {
    if (!memberToAdd || !selectedProdId) return
    const prod = productions.find(p => p.id === selectedProdId)
    if (!prod) return
    if ((prod.production_members || []).some(m => m.user_id === memberToAdd)) {
      setMemberToAdd('')
      return
    }
    const member = team.find(m => m.id === memberToAdd)
    const { error } = await supabase.from('production_members').insert({ production_id: selectedProdId, user_id: memberToAdd })
    if (error) { toast('Failed to add team member', 'error'); return }
    setProductions(prev => prev.map(p => p.id === selectedProdId
      ? { ...p, production_members: [...(p.production_members || []), { user_id: memberToAdd, team: member ? { name: member.name, avatar_color: member.avatar_color } : null }] }
      : p))
    setMemberToAdd('')
    await logPanelActivity('Added team member', member?.name || null)

    // Send assignment email to added member (mirrors detail page behavior)
    if (member?.email) {
      try {
        const { data: { session } } = await supabase.auth.refreshSession()
        if (session) {
          const d = prod.start_datetime ? new Date(prod.start_datetime) : null
          const dateStr = d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'
          const timeStr = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
          const venue = getSchoolName(prod.filming_location) || getSchoolName(prod.school_department) || prod.filming_location || 'TBD'
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
              type: 'production_assignment',
              recipientEmail: member.email,
              recipientName: member.name.split(' ')[0],
              subject: `You've been added to #${prod.production_number} ${prod.title}`,
              body: `You've been assigned to production #${prod.production_number} — ${prod.title}.\n\nDate: ${dateStr}${timeStr ? ` at ${timeStr}` : ''}\nLocation: ${venue}\nType: ${prod.request_type_label || 'Production'}\n\nView the production details and checklist in the Team Hub.`,
              actionUrl: `/dashboard/productions/${prod.production_number}`,
              actionLabel: 'View Production',
            }),
          })
        }
      } catch { /* ignore email failure */ }
    }
  }

  const removePanelMember = async (memberId: string, memberName: string | null) => {
    if (!selectedProdId) return
    const { error } = await supabase.from('production_members').delete().eq('production_id', selectedProdId).eq('user_id', memberId)
    if (error) { toast('Failed to remove team member', 'error'); return }
    setProductions(prev => prev.map(p => p.id === selectedProdId
      ? { ...p, production_members: (p.production_members || []).filter(m => m.user_id !== memberId) }
      : p))
    await logPanelActivity('Removed team member', memberName)
  }

  const dismissConflict = async (aId: string, bId: string) => {
    if (!currentUser) return
    await supabase.from('dismissed_conflicts').insert({ production_a_id: aId, production_b_id: bId, dismissed_by: currentUser.id })
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

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

  // Scope-aware base set
  const scopedProductions = useMemo(() => productions.filter(p => {
    if (scope === 'mine') return currentUser !== null && (p.production_members || []).some(m => m.user_id === currentUser.id)
    if (scope === 'unassigned') return (p.production_members || []).length === 0
    return true
  }), [productions, scope, currentUser])

  const allTypes = useMemo(() => Array.from(new Set(productions.map(p => getTypeLabel(p)))).filter(Boolean).sort(), [productions])

  // Counts (scope-aware) for focus chips & briefing
  const counts = useMemo(() => {
    let today = 0, thisWeek = 0, overdue = 0, unstaffed = 0, upcoming = 0
    scopedProductions.forEach(p => {
      const d = daysFromToday(p.start_datetime)
      const isFutureUpcoming = d !== null && d >= 0 && p.status !== 'Complete' && p.status !== 'Abandoned'
      if (d === 0) today++
      if (d !== null && d >= 0 && d <= 7) thisWeek++
      if (isOverdueProd(p)) overdue++
      if ((p.production_members || []).length === 0 && isFutureUpcoming) unstaffed++
      if (isFutureUpcoming) upcoming++
    })
    return { today, thisWeek, overdue, unstaffed, upcoming, all: scopedProductions.length }
  }, [scopedProductions])

  const ytPendingOnly = searchParams.get('ytPending') === '1'

  const briefingText = useMemo(() => {
    const parts: string[] = []
    if (counts.thisWeek > 0) parts.push(`${counts.thisWeek} this week`)
    if (counts.overdue > 0) parts.push(`${counts.overdue} overdue`)
    if (counts.unstaffed > 0) parts.push(`${counts.unstaffed} unstaffed`)
    parts.push(`${counts.all} total`)
    return parts.join(' · ')
  }, [counts])

  // Filter pipeline: focus → status → type → search (scope is already applied via scopedProductions)
  const filtered = useMemo(() => scopedProductions.filter(p => {
    if (ytPendingOnly) {
      if (p.status !== 'Complete') return false
      if (p.youtube_link_email_sent_at) return false
      if (!(p.livestream_url && String(p.livestream_url).trim())) return false
    }
    if (focusFilter === 'today' && daysFromToday(p.start_datetime) !== 0) return false
    if (focusFilter === 'this-week') {
      const d = daysFromToday(p.start_datetime)
      if (d === null || d < 0 || d > 7) return false
    }
    if (focusFilter === 'overdue' && !isOverdueProd(p)) return false
    if (focusFilter === 'unstaffed') {
      const isFuture = !isPastProd(p) && p.status !== 'Complete' && p.status !== 'Abandoned'
      if (!((p.production_members || []).length === 0 && isFuture)) return false
    }
    if (focusFilter === 'upcoming') {
      const d = daysFromToday(p.start_datetime)
      if (d === null || d < 0) return false
      if (p.status === 'Complete' || p.status === 'Abandoned') return false
    }
    if (typeFilter !== 'all' && getTypeLabel(p) !== typeFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const hit = p.title.toLowerCase().includes(q)
        || (p.organizer_name || '').toLowerCase().includes(q)
        || (p.organizer_email || '').toLowerCase().includes(q)
        || (p.submitter_name || '').toLowerCase().includes(q)
        || (p.submitter_email || '').toLowerCase().includes(q)
        || getTypeLabel(p).toLowerCase().includes(q)
        || String(p.production_number).includes(search)
      if (!hit) return false
    }
    return true
  }), [scopedProductions, ytPendingOnly, focusFilter, typeFilter, statusFilter, search])

  const overdueProds = useMemo(() => filtered.filter(isOverdueProd), [filtered])

  const conflicts = useMemo(() => {
    const upcoming = filtered.filter(p => p.start_datetime && p.status !== 'Complete' && p.status !== 'Abandoned' && new Date(p.start_datetime) >= new Date())
    const all: { a: Production; b: Production }[] = []
    for (let i = 0; i < upcoming.length; i++) {
      for (let j = i + 1; j < upcoming.length; j++) {
        const da = new Date(upcoming[i].start_datetime!)
        const db = new Date(upcoming[j].start_datetime!)
        if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate() && Math.abs(da.getTime() - db.getTime()) < 3600000) {
          all.push({ a: upcoming[i], b: upcoming[j] })
        }
      }
    }
    return all.filter(c => !dismissedConflicts.has(`${c.a.id}-${c.b.id}`))
  }, [filtered, dismissedConflicts])

  // Pipeline groups
  const inProgress  = useMemo(() => filtered.filter(p => p.status === 'In Progress'), [filtered])
  const ideaRequest = useMemo(() => filtered.filter(p => p.status === 'Idea/Request'), [filtered])
  const approved    = useMemo(() => filtered.filter(p => APPROVED_STATUSES.includes(p.status as any)), [filtered])
  const other       = useMemo(() => filtered.filter(p => {
    const s = p.status || ''
    return TERMINAL_STATUSES.includes(s as any) || (!PIPELINE_STATUSES.includes(s as any) && !APPROVED_STATUSES.includes(s as any) && !TERMINAL_STATUSES.includes(s as any))
  }), [filtered])

  // ---------- Render helpers ----------
  const renderStatusPill = (status: string | null, large = false): ReactNode => {
    if (!status) {
      const style = { fontSize: large ? '12px' : '11px', fontWeight: 600, padding: large ? '3px 10px' : '2px 8px', borderRadius: '6px', background: surface2, color: muted, whiteSpace: 'nowrap' as const }
      return <span style={style}>Unknown</span>
    }
    const tone = STATUS_TONE_MAP[status]
    const label = STATUS_DISPLAY[status] || status
    if (!tone) return <span style={{ fontSize: large ? '12px' : '11px', fontWeight: 600, padding: large ? '3px 10px' : '2px 8px', borderRadius: '6px', background: surface2, color: muted, whiteSpace: 'nowrap' as const }}>{label}</span>
    return <span style={{ ...statusBadge(tone, true), fontSize: large ? '12px' : '11px', whiteSpace: 'nowrap' as const }}>{label}</span>
  }

  const renderTypePill = (p: Production): ReactNode => {
    const label = getTypeLabel(p)
    const color = getTypeColor(p)
    return <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', background: `${color}1A`, color, fontWeight: 500, whiteSpace: 'nowrap' as const, border: `1px solid ${color}40` }}>{label}</span>
  }

  const focusChip = (key: FocusFilter, label: string, count: number, tone: keyof typeof statusTone | null) => {
    const active = focusFilter === key
    const accent = tone ? statusTone[tone].color : muted
    const accentBg = tone ? statusTone[tone].background : surface2
    return (
      <button
        key={key}
        onClick={() => setFocusFilter(key)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '8px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
          border: `1px solid ${active ? accent : border}`,
          background: active ? accentBg : cardBg,
          color: active ? accent : muted,
          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          whiteSpace: 'nowrap' as const,
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: active ? accentBg : surface2, color: active ? accent : muted, border: active ? `1px solid ${accent}` : 'none' }}>{count}</span>
      </button>
    )
  }

  const scopeBtn = (key: Scope, label: string) => {
    const active = scope === key
    return (
      <button
        onClick={() => setScope(key)}
        style={{
          padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          border: `1px solid ${active ? 'var(--brand-primary)' : border}`,
          background: active ? 'var(--brand-primary)' : cardBg,
          color: active ? '#fff' : muted,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {label}
      </button>
    )
  }

  // ---------- Production card (pipeline) ----------
  const ProductionCard = ({ prod }: { prod: Production }) => {
    const past      = isPastProd(prod)
    const overdue   = isOverdueProd(prod)
    const typeColor = getTypeColor(prod)
    const progress  = getProgress(prod)
    const members   = prod.production_members || []
    const isOpen    = selectedProdId === prod.id

    const noTeam       = members.length === 0 && !past
    const daysUntil    = daysFromToday(prod.start_datetime)
    const approaching  = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7
    const checklistDone = progress ? progress.pct === 100 : false
    const needsAttention = noTeam || (approaching && !checklistDone && !past) || overdue

    let healthColor: string | null = null
    let healthTip: string | null = null
    if (overdue) { healthColor = danger; healthTip = 'Overdue — not marked complete' }
    else if (noTeam) { healthColor = danger; healthTip = 'Nobody assigned' }
    else if (approaching && !checklistDone) {
      healthColor = warning
      healthTip = `${daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days away`} — checklist incomplete`
    } else if (checklistDone) { healthColor = success; healthTip = 'Checklist complete' }

    return (
      <div onClick={() => selectProduction(prod.id)} style={{ display: 'block', opacity: past && !overdue ? 0.5 : 1, transition: 'opacity 0.15s', cursor: 'pointer' }}>
        <div
          style={{
            background: isOpen ? 'rgba(91,163,224,0.10)' : cardBg,
            border: `1px solid ${isOpen ? 'var(--brand-primary)' : needsAttention && healthColor ? `${healthColor}55` : border}`,
            borderRadius: '12px', padding: '14px 16px', marginBottom: '8px',
            cursor: 'pointer', transition: 'all 0.15s',
            borderLeft: `3px solid ${overdue ? danger : typeColor}`,
          }}
          onMouseEnter={e => { if (!isOpen) { (e.currentTarget as HTMLDivElement).style.background = hoverBg; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isOpen ? 'rgba(91,163,224,0.10)' : cardBg; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{ fontSize: '11px', color: muted }}>#{prod.production_number}</span>
                {overdue && <span style={{ ...statusBadge('danger', true), fontSize: '10px', padding: '1px 6px' }}>Overdue</span>}
                {past && !overdue && <span style={{ fontSize: '10px', color: muted, background: surface2, padding: '1px 6px', borderRadius: '4px' }}>Past</span>}
                {healthColor && !past && <span title={healthTip || ''} style={{ width: '8px', height: '8px', borderRadius: '50%', background: healthColor, display: 'inline-block', flexShrink: 0 }} />}
              </div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2 as any, WebkitBoxOrient: 'vertical' as any }}>{prod.title}</p>
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
              <span style={{ ...statusBadge('danger', true), fontSize: '10px', padding: '2px 8px', flexShrink: 0 }}>Unassigned</span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: progress ? '8px' : '0' }}>
            {renderTypePill(prod)}
            <span style={{ fontSize: '12px', color: muted }}>{primaryContactLabel(prod)}</span>
            {prod.start_datetime && <span style={{ fontSize: '12px', color: muted }}>· {formatDate(prod.start_datetime)}</span>}
          </div>

          {progress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '4px', background: surface2, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${progress.pct}%`, height: '100%', background: progress.pct === 100 ? success : typeColor, borderRadius: '2px' }} />
              </div>
              <span style={{ fontSize: '11px', color: muted, flexShrink: 0 }}>{progress.done}/{progress.total}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---------- Production row (list view) ----------
  const ProductionRow = ({ prod, isLast }: { prod: Production; isLast: boolean }) => {
    const past      = isPastProd(prod)
    const overdue   = isOverdueProd(prod)
    const typeColor = getTypeColor(prod)
    const progress  = getProgress(prod)
    const members   = prod.production_members || []
    const isOpen    = selectedProdId === prod.id

    return (
      <div
        onClick={() => selectProduction(prod.id)}
        style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', borderBottom: isLast ? 'none' : `1px solid ${border}`, transition: 'background 0.1s', opacity: past && !overdue ? 0.5 : 1, cursor: 'pointer', background: isOpen ? 'rgba(91,163,224,0.10)' : 'transparent', position: 'relative' as const, borderLeft: `3px solid ${overdue ? danger : typeColor}` }}
        onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = hoverBg }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isOpen ? 'rgba(91,163,224,0.10)' : 'transparent' }}
      >
        <span style={{ fontSize: '13px', color: muted, minWidth: '40px' }}>#{prod.production_number}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{prod.title}</p>
          <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>{primaryContactLabel(prod)}</p>
        </div>
        {renderTypePill(prod)}
        {progress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, minWidth: '80px' }}>
            <div style={{ flex: 1, height: '4px', background: surface2, borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${progress.pct}%`, height: '100%', background: progress.pct === 100 ? success : typeColor, borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '11px', color: muted }}>{progress.pct}%</span>
          </div>
        )}
        {prod.start_datetime && (
          <span style={{ fontSize: '12px', color: overdue ? danger : past ? muted : text, flexShrink: 0, whiteSpace: 'nowrap' as const }}>
            {formatDate(prod.start_datetime)}
            {overdue && <span style={{ ...statusBadge('danger', true), marginLeft: '6px', fontSize: '10px', padding: '1px 6px' }}>Overdue</span>}
            {past && !overdue && <span style={{ marginLeft: '6px', fontSize: '10px', color: muted, background: surface2, padding: '1px 6px', borderRadius: '4px' }}>Past</span>}
          </span>
        )}
        {members.length > 0 && (
          <div style={{ display: 'flex', flexShrink: 0 }}>
            {members.slice(0, 3).map((m, i) => m.team && (
              <div key={m.user_id} title={m.team.name} style={{ width: '22px', height: '22px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', marginLeft: i > 0 ? '-6px' : 0, border: `2px solid ${cardBg}` }}>
                {m.team.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
        )}
        {renderStatusPill(prod.status)}
      </div>
    )
  }

  const colHeader = (label: string, count: number, tone: keyof typeof statusTone | null) => {
    const color = tone ? statusTone[tone].color : muted
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '0 2px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 700, color: text, textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>{label}</span>
        <span style={{ fontSize: '11px', color: muted, background: surface2, padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>{count}</span>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )

  const selectedProd = productions.find(p => p.id === selectedProdId) || null
  const syncRecent = lastSync ? (Date.now() - new Date(lastSync).getTime()) < 24 * 60 * 60 * 1000 : false

  return (
    <div className="prod-shell" style={{ maxWidth: '1760px', margin: '0 auto' }}>
      <div className="prod-layout" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* HEADER */}
          <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' as const }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 700, color: text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Productions</h1>
              <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{briefingText}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {lastSync && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: muted, padding: '6px 10px', background: cardBg, border: `1px solid ${border}`, borderRadius: '8px' }} title={`Last sync: ${new Date(lastSync).toLocaleString()}`}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: syncRecent ? success : muted }} />
                  Synced {relativeTime(lastSync)}
                </span>
              )}
              <div ref={overflowRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowOverflow(v => !v)}
                  aria-label="More options"
                  aria-expanded={showOverflow}
                  style={{ width: '38px', height: '38px', borderRadius: '10px', background: cardBg, color: muted, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                </button>
                {showOverflow && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: '240px', background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '6px', zIndex: 50, boxShadow: 'var(--shadow-raised)' }}>
                    <div style={{ padding: '6px 10px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: muted, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>View</p>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {(['pipeline', 'list'] as const).map(v => (
                          <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: `1px solid ${view === v ? 'var(--brand-primary)' : border}`, background: view === v ? 'var(--brand-primary)' : cardBg, color: view === v ? '#fff' : text, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' as const }}>{v}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: '6px 10px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: muted, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Type</p>
                      <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setShowOverflow(false) }} style={{ width: '100%', background: surface2, border: `1px solid ${border}`, borderRadius: '6px', padding: '6px 8px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none' }}>
                        <option value="all">All types</option>
                        {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ padding: '6px 10px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: muted, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Status</p>
                      <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setShowOverflow(false) }} style={{ width: '100%', background: surface2, border: `1px solid ${border}`, borderRadius: '6px', padding: '6px 8px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none' }}>
                        <option value="all">All statuses</option>
                        <option value="Idea/Request">Idea / Request</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Approved/Scheduled">Approved / Scheduled</option>
                        <option value="Complete">Complete</option>
                        <option value="Abandoned">Abandoned</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {ytPendingOnly && (
            <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '12px', border: `1px solid ${info}`, background: dark ? 'rgba(91,163,224,0.08)' : 'rgba(91,163,224,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' as const }}>
              <p style={{ margin: 0, fontSize: '13px', color: text }}>
                Showing completed productions that have a synced livestream/video link and no logged organizer link email yet.
              </p>
              <Link href="/dashboard/productions" style={{ fontSize: '13px', fontWeight: 600, color: info, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                Clear filter
              </Link>
            </div>
          )}

          {/* FOCUS ZONE */}
          <section style={uiStyles.zoneSection}>
            <ZoneHeader label="Focus" hint="Cut to what needs attention" />
            <div className="focus-chips" style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px' }}>
              {focusChip('all', 'All', counts.all, null)}
              {focusChip('upcoming', 'Upcoming', counts.upcoming, 'info')}
              {focusChip('today', 'Today', counts.today, 'info')}
              {focusChip('this-week', 'This week', counts.thisWeek, 'warning')}
              {focusChip('overdue', 'Overdue', counts.overdue, 'danger')}
              {focusChip('unstaffed', 'Unstaffed', counts.unstaffed, 'danger')}
            </div>
          </section>

          {/* SCOPE / SEARCH */}
          <section style={{ marginBottom: '20px' }}>
            <div className="scope-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {scopeBtn('all', 'All')}
                {scopeBtn('mine', 'Mine')}
                {scopeBtn('unassigned', 'Unassigned')}
              </div>
              <div className="search-wrap" style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 12px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, organizer, type, number..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: text, fontFamily: 'inherit' }} />
                {search && <button onClick={() => setSearch('')} aria-label="Clear search" style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>}
              </div>
            </div>
            {(typeFilter !== 'all' || statusFilter !== 'all') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const, marginTop: '10px', fontSize: '12px', color: muted }}>
                {typeFilter !== 'all' && (
                  <span style={{ ...statusBadge('info', true), fontSize: '11px' }}>
                    Type: {typeFilter} <button onClick={() => setTypeFilter('all')} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '4px', padding: 0, fontSize: '12px', lineHeight: 1 }}>×</button>
                  </span>
                )}
                {statusFilter !== 'all' && (
                  <span style={{ ...statusBadge('info', true), fontSize: '11px' }}>
                    Status: {statusFilter} <button onClick={() => setStatusFilter('all')} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '4px', padding: 0, fontSize: '12px', lineHeight: 1 }}>×</button>
                  </span>
                )}
              </div>
            )}
          </section>

          {/* ALERTS — slim, click-through */}
          {(overdueProds.length > 0 || conflicts.length > 0) && (
            <section style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
              {overdueProds.length > 0 && focusFilter !== 'overdue' && (
                <div style={{ background: dangerBg, border: `1px solid ${danger}40`, borderRadius: '10px', overflow: 'hidden' }}>
                  <button onClick={() => setOverdueExpanded(v => !v)} aria-expanded={overdueExpanded} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: danger }}>
                      {overdueProds.length} overdue production{overdueProds.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span onClick={e => { e.stopPropagation(); setFocusFilter('overdue'); setOverdueExpanded(false) }} style={{ fontSize: '12px', color: danger, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Show only overdue</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={danger} strokeWidth="2.5" style={{ transform: overdueExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                    </span>
                  </button>
                  {overdueExpanded && (
                    <div style={{ borderTop: `1px solid ${danger}30`, padding: '8px 14px' }}>
                      {overdueProds.slice(0, 8).map(p => (
                        <div key={p.id} onClick={() => selectProduction(p.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', cursor: 'pointer', gap: '10px' }}>
                          <span style={{ fontSize: '12px', color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>#{p.production_number} {p.title}</span>
                          <span style={{ fontSize: '11px', color: danger, fontWeight: 600, flexShrink: 0 }}>{p.start_datetime ? new Date(p.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                        </div>
                      ))}
                      {overdueProds.length > 8 && <p style={{ fontSize: '11px', color: muted, margin: '6px 0 0', textAlign: 'center' as const }}>+{overdueProds.length - 8} more</p>}
                    </div>
                  )}
                </div>
              )}
              {conflicts.length > 0 && (
                <div style={{ background: dangerBg, border: `1px solid ${danger}40`, borderRadius: '10px', overflow: 'hidden' }}>
                  <button onClick={() => setConflictsExpanded(v => !v)} aria-expanded={conflictsExpanded} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: danger }}>
                      {conflicts.length} scheduling conflict{conflicts.length !== 1 ? 's' : ''}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={danger} strokeWidth="2.5" style={{ transform: conflictsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  {conflictsExpanded && (
                    <div style={{ borderTop: `1px solid ${danger}30`, padding: '8px 14px' }}>
                      {conflicts.slice(0, 5).map((c, i) => {
                        const d = new Date(c.a.start_datetime!)
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
                            <p style={{ fontSize: '12px', color: muted, margin: 0, flex: 1 }}>
                              <span style={{ color: text, fontWeight: 500 }}>{d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                              {' '}— <strong style={{ color: text }}>#{c.a.production_number}</strong> &amp; <strong style={{ color: text }}>#{c.b.production_number}</strong>
                            </p>
                            <button onClick={() => dismissConflict(c.a.id, c.b.id)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', background: cardBg, border: `1px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Dismiss</button>
                          </div>
                        )
                      })}
                      {conflicts.length > 5 && <p style={{ fontSize: '11px', color: muted, margin: '6px 0 0', textAlign: 'center' as const }}>+{conflicts.length - 5} more</p>}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* PIPELINE VIEW */}
          {view === 'pipeline' && (
            <div className="pipeline-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '16px', alignItems: 'start' }}>
              {inProgress.length > 0 && (
                <div style={{ background: colBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '14px' }}>
                  {colHeader('In Progress', inProgress.length, 'warning')}
                  {inProgress.map(p => <ProductionCard key={p.id} prod={p} />)}
                </div>
              )}
              <div style={{ background: colBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '14px' }}>
                {colHeader('Idea / Request', ideaRequest.length, null)}
                {ideaRequest.length === 0 ? (
                  <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '20px 0', margin: 0 }}>No incoming requests</p>
                ) : ideaRequest.map(p => <ProductionCard key={p.id} prod={p} />)}
              </div>
              <div style={{ background: colBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '14px' }}>
                {colHeader('Approved / Scheduled', approved.length, 'success')}
                {approved.length === 0 ? (
                  <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '20px 0', margin: 0 }}>No approved productions</p>
                ) : approved.map(p => <ProductionCard key={p.id} prod={p} />)}
              </div>
              {other.length > 0 && (
                <div style={{ background: colBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '14px' }}>
                  {colHeader('Complete / Other', other.length, 'info')}
                  {other.slice(0, 10).map(p => <ProductionCard key={p.id} prod={p} />)}
                  {other.length > 10 && (
                    <p style={{ fontSize: '12px', color: muted, textAlign: 'center' as const, padding: '6px 0 0', margin: 0 }}>
                      +{other.length - 10} more — switch to List view
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* LIST VIEW */}
          {view === 'list' && (
            <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
              {filtered.length === 0 ? (
                <p style={{ fontSize: '14px', color: muted, textAlign: 'center' as const, padding: '48px 20px', margin: 0 }}>
                  No productions match your filters
                </p>
              ) : filtered.map((prod, i) => <ProductionRow key={prod.id} prod={prod} isLast={i === filtered.length - 1} />)}
            </div>
          )}
        </main>

        {/* DETAIL DRAWER */}
        {selectedProd && (
          <>
            <div className="drawer-backdrop" onClick={() => setSelectedProdId(null)} />
            <aside className="drawer-panel" style={{ flexShrink: 0, background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', overflowY: 'auto' as const }}>
              <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '14px 18px 10px', borderBottom: `1px solid ${border}`, position: 'sticky' as const, top: 0, background: cardBg, zIndex: 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '11px', color: muted, margin: '0 0 2px', fontWeight: 600 }}>#{selectedProd.production_number}</p>
                  <h2 style={{ fontSize: '17px', fontWeight: 700, color: text, margin: 0, lineHeight: 1.25 }}>{selectedProd.title}</h2>
                </div>
                <button onClick={() => setSelectedProdId(null)} aria-label="Close detail" style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
              </header>

              {panelLoading ? (
                <div style={{ textAlign: 'center' as const, padding: '40px 0', color: muted }}>Loading...</div>
              ) : (
                <div style={{ padding: '14px 18px' }}>
                  {/* STATUS PILLS */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' as const }}>
                    {renderStatusPill(selectedProd.status, true)}
                    {renderTypePill(selectedProd)}
                    {isOverdueProd(selectedProd) && <span style={{ ...statusBadge('danger', true), fontSize: '12px', padding: '3px 10px' }}>Overdue</span>}
                  </div>

                  {/* QUICK ACTIONS */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' as const }}>
                    <Link href={`/dashboard/productions/${selectedProd.production_number}`} style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--brand-primary)', textDecoration: 'none', padding: '8px 10px', background: surface2, border: `1px solid ${border}`, borderRadius: '8px', textAlign: 'center' as const }}>
                      Open full details →
                    </Link>
                    {selectedProd.organizer_email && (
                      <a href={`mailto:${selectedProd.organizer_email}?subject=${encodeURIComponent(`#${selectedProd.production_number} ${selectedProd.title}`)}`} style={{ fontSize: '12px', fontWeight: 600, color: text, textDecoration: 'none', padding: '8px 10px', background: surface2, border: `1px solid ${border}`, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        Email
                      </a>
                    )}
                  </div>

                  {/* FACTS */}
                  <div style={{ background: surface2, borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', border: `1px solid ${border}` }}>
                    {selectedProd.start_datetime && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                        <span style={{ color: muted }}>Date</span>
                        <span style={{ color: text, fontWeight: 500 }}>{new Date(selectedProd.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {new Date(selectedProd.start_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                    )}
                    {selectedProd.end_datetime && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                        <span style={{ color: muted }}>End</span>
                        <span style={{ color: text, fontWeight: 500 }}>{new Date(selectedProd.end_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                    )}
                    {(selectedProd.filming_location || selectedProd.school_department) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                        <span style={{ color: muted }}>Location</span>
                        <span style={{ color: text, fontWeight: 500, textAlign: 'right' as const }}>{getSchoolName(selectedProd.filming_location) || getSchoolName(selectedProd.school_department) || selectedProd.filming_location || ''}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ color: muted }}>Organizer</span>
                      <span style={{ textAlign: 'right' as const, minWidth: 0 }}>
                        <span style={{ display: 'block', color: text, fontWeight: 500 }}>{primaryContactLabel(selectedProd)}</span>
                        {selectedProd.organizer_email && <a href={`mailto:${selectedProd.organizer_email}`} style={{ display: 'block', fontSize: '12px', color: 'var(--brand-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{selectedProd.organizer_email}</a>}
                        {selectedProd.is_on_behalf && selectedProd.submitter_name && (
                          <span style={{ display: 'block', fontSize: '11px', color: muted, marginTop: '2px' }}>
                            Submitted by {selectedProd.submitter_name}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* SYNCED REQUEST NOTES (read-only) */}
                  {(selectedProd.additional_notes || selectedProd.video_description) && (
                    <div style={{ marginBottom: '14px', padding: '10px 12px', background: surface2, borderRadius: '10px', borderLeft: `3px solid var(--brand-primary)` }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: '0 0 4px' }}>Request notes</p>
                      <p style={{ fontSize: '13px', color: text, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>{selectedProd.additional_notes || selectedProd.video_description}</p>
                    </div>
                  )}

                  {/* TEAM (interactive) */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: 0 }}>Team</p>
                      <span style={{ fontSize: '11px', color: muted, fontWeight: 600 }}>{(selectedProd.production_members || []).length}</span>
                    </div>
                    {(selectedProd.production_members || []).length === 0 ? (
                      <p style={{ fontSize: '12px', color: muted, margin: '0 0 8px', fontStyle: 'italic' as const }}>No team assigned yet.</p>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '8px' }}>
                        {(selectedProd.production_members || []).map(m => m.team && (
                          <span key={m.user_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '3px 4px 3px 4px', borderRadius: '20px', background: surface2, color: text, fontWeight: 500, border: `1px solid ${border}` }}>
                            <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e' }}>{m.team.name.slice(0, 2).toUpperCase()}</span>
                            <span style={{ paddingRight: '2px' }}>{m.team.name}</span>
                            <button onClick={() => removePanelMember(m.user_id, m.team?.name || null)} aria-label={`Remove ${m.team.name}`} style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 4px 0 0', borderRadius: '50%' }} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = danger} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = muted}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select value={memberToAdd} onChange={e => setMemberToAdd(e.target.value)} style={{ flex: 1, fontSize: '12px', padding: '7px 10px', background: surface2, border: `1px solid ${border}`, borderRadius: '8px', color: text, fontFamily: 'inherit', cursor: 'pointer' }}>
                        <option value="">+ Add team member…</option>
                        {team.filter(m => !(selectedProd.production_members || []).some(pm => pm.user_id === m.id)).map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <button onClick={addPanelMember} disabled={!memberToAdd} style={{ fontSize: '12px', fontWeight: 600, padding: '7px 14px', background: memberToAdd ? 'var(--brand-primary)' : surface2, color: memberToAdd ? '#fff' : muted, border: `1px solid ${memberToAdd ? 'var(--brand-primary)' : border}`, borderRadius: '8px', cursor: memberToAdd ? 'pointer' : 'not-allowed', fontFamily: 'inherit', minWidth: '72px' }}>
                        Add
                      </button>
                    </div>
                  </div>

                  {/* TEAM NOTES (interactive) */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: 0 }}>Team notes</p>
                      {savingTeamNotes ? <span style={{ fontSize: '11px', color: muted, fontStyle: 'italic' as const }}>Saving…</span>
                        : teamNotesSavedFlash ? <span style={{ fontSize: '11px', color: success, fontWeight: 600 }}>Saved</span> : null}
                    </div>
                    <textarea
                      value={panelTeamNotes}
                      onChange={e => setPanelTeamNotes(e.target.value)}
                      onBlur={savePanelTeamNotes}
                      placeholder="Internal notes for the crew (saves on blur)…"
                      rows={3}
                      style={{ width: '100%', fontSize: '13px', padding: '8px 10px', background: surface2, border: `1px solid ${border}`, borderRadius: '8px', color: text, fontFamily: 'inherit', resize: 'vertical' as const, lineHeight: 1.4 }}
                    />
                  </div>

                  {/* CHECKLIST (interactive) */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: 0 }}>Checklist</p>
                      {panelChecklist.length > 0 && <span style={{ fontSize: '11px', color: muted, fontWeight: 600 }}>{panelChecklist.filter(c => c.completed).length}/{panelChecklist.length}</span>}
                    </div>
                    {panelChecklist.length === 0 ? (
                      <p style={{ fontSize: '12px', color: muted, margin: '0 0 8px', fontStyle: 'italic' as const }}>No checklist items yet.</p>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '2px', marginBottom: '8px' }}>
                          {panelChecklist.map(item => (
                            <div key={item.id} className="cl-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', transition: 'background 0.1s' }}>
                              <button onClick={() => togglePanelChecklistItem(item)} aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                                <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `1.5px solid ${item.completed ? success : border}`, background: item.completed ? success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                                  {item.completed && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                                </div>
                              </button>
                              <span onClick={() => togglePanelChecklistItem(item)} style={{ flex: 1, fontSize: '13px', color: item.completed ? muted : text, textDecoration: item.completed ? 'line-through' : 'none', lineHeight: 1.3, cursor: 'pointer' }}>{item.title}</span>
                              <button onClick={() => removePanelChecklistItem(item.id)} aria-label="Remove item" className="cl-remove" style={{ background: 'transparent', border: 'none', color: muted, cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 4px', opacity: 0.4, transition: 'opacity 0.15s, color 0.15s' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = danger; (e.currentTarget as HTMLButtonElement).style.opacity = '1' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = muted; (e.currentTarget as HTMLButtonElement).style.opacity = '0.4' }}>×</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ height: '4px', background: surface2, borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                          <div style={{ width: `${(panelChecklist.filter(c => c.completed).length / panelChecklist.length) * 100}%`, height: '100%', background: panelChecklist.every(c => c.completed) ? success : 'var(--brand-primary)', borderRadius: '2px', transition: 'width 0.3s' }} />
                        </div>
                      </>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        value={newChecklistTitle}
                        onChange={e => setNewChecklistTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPanelChecklistItem() } }}
                        placeholder="Add checklist item…"
                        style={{ flex: 1, fontSize: '12px', padding: '7px 10px', background: surface2, border: `1px solid ${border}`, borderRadius: '8px', color: text, fontFamily: 'inherit', outline: 'none' }}
                      />
                      <button onClick={addPanelChecklistItem} disabled={!newChecklistTitle.trim()} style={{ fontSize: '12px', fontWeight: 600, padding: '7px 14px', background: newChecklistTitle.trim() ? 'var(--brand-primary)' : surface2, color: newChecklistTitle.trim() ? '#fff' : muted, border: `1px solid ${newChecklistTitle.trim() ? 'var(--brand-primary)' : border}`, borderRadius: '8px', cursor: newChecklistTitle.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                        Add
                      </button>
                    </div>
                  </div>

                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: '0 0 6px' }}>Recent activity</p>
                    {panelActivity.length === 0 ? (
                      <p style={{ fontSize: '12px', color: muted, margin: 0, fontStyle: 'italic' as const }}>No recent activity yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
                        {panelActivity.map(a => (
                          <div key={a.id} style={{ fontSize: '12px', color: muted, padding: '4px 0', borderBottom: `1px solid ${border}` }}>
                            <span style={{ color: text, fontWeight: 500 }}>{a.team?.name || 'System'}</span>
                            {' '}{a.action.replace(/_/g, ' ')}
                            {a.detail && <span style={{ color: muted }}> — {a.detail}</span>}
                            <span style={{ display: 'block', fontSize: '11px', color: muted, marginTop: '2px' }}>{relativeTime(a.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </aside>
          </>
        )}
      </div>

      <style>{`
        .drawer-panel {
          width: 400px;
          position: sticky;
          top: 80px;
          max-height: calc(100vh - 100px);
        }
        .drawer-backdrop { display: none; }
        .cl-row:hover {
          background: ${hoverBg};
        }
        .cl-row:hover .cl-remove {
          opacity: 1 !important;
        }
        @media (max-width: 1023px) {
          .drawer-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 80;
          }
          .drawer-panel {
            position: fixed !important;
            inset: auto 0 0 0 !important;
            top: auto !important;
            width: 100% !important;
            max-height: 90vh !important;
            border-radius: 16px 16px 0 0 !important;
            z-index: 90;
            box-shadow: var(--shadow-raised);
            padding-bottom: env(safe-area-inset-bottom);
          }
        }
      `}</style>
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
