'use client'

import { useEffect, useState, useCallback, useMemo, useRef, Suspense, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { getSchoolName } from '@/lib/schools'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Loader from '../components/Loader'
import { ZoneHeader } from '../components/ZoneHeader'
import { uiStyles, statusBadge, statusTone } from '@/lib/ui/styles'
import { toast } from '@/lib/toast'
import { sanitizeEmailSubject } from '@/lib/escape-html'
import { isStudentInternRole } from '@/lib/roles'
import { fetchEffectiveTeam } from '@/lib/effective-team-client'
import { isUnderstaffedProductionFocus } from '@/lib/dashboard/production-attention'
import {
  isBoardOrLivestreamProduction,
  isYtEmailPendingProduction,
  isYtMissingLinkProduction,
  organizerYoutubeEmailLogged,
  productionIdsFromOrganizerYoutubeActivity,
} from '@/lib/dashboard/youtube-link-followup'
import { hubRequestProductionComplete, hubRequestProductionInProgress, type ProductionStatusWire } from '@/lib/production-status-requests'
import { isOverdueProd as isOverdueProduction } from '@/lib/productions/detail-panel-shared'
import {
  ALL_SCHOOL_YEARS,
  PLANNING_SCHOOL_YEARS,
  buildSchoolYearFilterOptions,
  isNextSchoolYearOnlyProduction,
  matchesSchoolYearFilter,
  planningSchoolYearDividerLabel,
  planningSchoolYearFilterLabel,
} from '@/lib/school-year'

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
  event_location: string | null
  school_year: string | null; synced_at: string | null
  additional_notes: string | null; video_description: string | null
  team_notes: string | null
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
  checklist_items?: { completed: boolean }[]
}

interface TeamMember { id: string; name: string; avatar_color: string; email: string }
interface CurrentUser { id: string; name: string; email: string; role?: string }

interface PanelChecklist { id: string; title: string; completed: boolean; sort_order: number }
interface PanelActivity { id: string; action: string; detail: string | null; created_at: string; team: { name: string } | null }

interface EmailTemplate {
  id: string
  template_key: string | null
  label: string
  subject: string
  body: string
  sort_order: number
  active: boolean
}

function templateUsesYoutubeLink(t: EmailTemplate | undefined): boolean {
  if (!t) return false
  const key = (t.template_key || '').toLowerCase()
  if (key.includes('youtube')) return true
  return t.body.includes('{{youtube_link}}') || t.subject.includes('{{youtube_link}}')
}

const STATUS_TONE_MAP: Record<string, keyof typeof statusTone | null> = {
  'In Progress': 'warning',
  'Approved/Scheduled': 'success',
  'Complete Requested': 'review',
  'Complete': 'info',
  'Abandoned': null,
  'Idea/Request': null,
}

const STATUS_DISPLAY: Record<string, string> = {
  'Idea/Request': 'Idea / Request',
  'In Progress': 'In Progress',
  'Approved/Scheduled': 'Approved / Scheduled',
  'Complete Requested': 'Complete Requested',
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

type FocusFilter = 'all' | 'today' | 'this-week' | 'overdue' | 'understaffed' | 'upcoming' | 'live-email-pending' | 'missing-link'
type Scope = 'all' | 'mine' | 'unassigned'
type View = 'pipeline' | 'list'

function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const PRODUCTION_LIST_SELECT = `
  id,
  production_number,
  title,
  type,
  request_type_label,
  status,
  organizer_name,
  organizer_email,
  school_department,
  is_on_behalf,
  submitter_name,
  submitter_email,
  livestream_url,
  youtube_link_email_sent_at,
  start_datetime,
  end_datetime,
  filming_location,
  event_location,
  school_year,
  synced_at,
  additional_notes,
  video_description,
  team_notes,
  production_members(user_id, team(name, avatar_color)),
  checklist_items(completed)
`

function parseProductionInstant(iso: string): Date {
  const raw = iso.includes('T') ? iso : iso.replace(' ', 'T')
  return new Date(raw)
}

/** Whole calendar days from local today (0 = today, -1 = yesterday). Ignores clock time within the day. */
function daysFromToday(d: string | null): number | null {
  if (!d) return null
  const event = parseProductionInstant(d)
  if (Number.isNaN(event.getTime())) return null
  const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate())
  const today = new Date()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((eventDay.getTime() - todayDay.getTime()) / 86400000)
}

function isOverdueProd(p: Production): boolean {
  return isOverdueProduction(p)
}

function isPastProd(p: Production): boolean {
  if (!p.start_datetime) return false
  const df = daysFromToday(p.start_datetime)
  return df !== null && df < 0
}

/** Rows that inflate Focus chip counts — exclude only Complete and Abandoned (incl. approved past-due). */
function countsTowardFocusBubbles(p: Production): boolean {
  const s = p.status || ''
  return s !== 'Complete' && s !== 'Abandoned'
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
  const router = useRouter()
  const searchParams = useSearchParams()

  const closeDrawer = useCallback(() => {
    setSelectedProdId(null)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete('prod')
    const qs = params.toString()
    router.replace('/dashboard/productions' + (qs ? `?${qs}` : ''))
  }, [router, searchParams])

  const [productions, setProductions] = useState<Production[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [schoolYearFilter, setSchoolYearFilter] = useState(PLANNING_SCHOOL_YEARS)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [view, setView] = useState<View>('pipeline')
  const initialScope: Scope = searchParams.get('scope') === 'mine' ? 'mine' : searchParams.get('scope') === 'unassigned' ? 'unassigned' : 'all'
  const [scope, setScope] = useState<Scope>(initialScope)
  const [focusFilter, setFocusFilter] = useState<FocusFilter>(() => {
    if (typeof window === 'undefined') return 'all'
    const params = new URLSearchParams(window.location.search)
    if (params.get('ytPending') === '1' || params.get('ytEmailPending') === '1') return 'live-email-pending'
    if (params.get('ytMissingLink') === '1') return 'missing-link'
    return 'all'
  })
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set())
  const [conflictsExpanded, setConflictsExpanded] = useState(false)
  const [overdueExpanded, setOverdueExpanded] = useState(false)
  const [ideaStripExpanded, setIdeaStripExpanded] = useState(false)
  const [pastArchiveExpanded, setPastArchiveExpanded] = useState(false)
  const [abandonedExpanded, setAbandonedExpanded] = useState(false)
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
  /** Production IDs with logged “Emailed organizer” activity that looks like a YouTube/livestream template (backfill when DB column did not update). */
  const [organizerYoutubeEmailedIds, setOrganizerYoutubeEmailedIds] = useState<Set<string>>(() => new Set())
  /** Production IDs with completion requested logged in activity, used when status sync lags. */
  const [completeRequestedIds, setCompleteRequestedIds] = useState<Set<string>>(() => new Set())
  /** Production IDs explicitly moved back to In Progress after a completion request. */
  const [requestedInProgressIds, setRequestedInProgressIds] = useState<Set<string>>(() => new Set())
  const [overdueQuickActionId, setOverdueQuickActionId] = useState<string | null>(null)
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [showPanelEmailModal, setShowPanelEmailModal] = useState(false)
  const [panelEmailTemplate, setPanelEmailTemplate] = useState('')
  const [panelEmailBody, setPanelEmailBody] = useState('')
  const [panelEmailSubject, setPanelEmailSubject] = useState('')

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

  const panelEmailInputStyle = {
    background: surface2,
    border: `0.5px solid ${border}`,
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    color: text,
    fontFamily: 'inherit' as const,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    minHeight: '40px',
  }

  // Sort: overdue first → upcoming soonest → no date → past most-recent
  const sortProductions = useCallback((data: Production[]): Production[] => {
    return [...data].sort((a, b) => {
      const aTs = a.start_datetime ? parseProductionInstant(a.start_datetime).getTime() : null
      const bTs = b.start_datetime ? parseProductionInstant(b.start_datetime).getTime() : null
      const aOverdue = isOverdueProd(a)
      const bOverdue = isOverdueProd(b)
      const aPast = a.start_datetime ? (daysFromToday(a.start_datetime) ?? 1) < 0 : false
      const bPast = b.start_datetime ? (daysFromToday(b.start_datetime) ?? 1) < 0 : false
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
    const effective = session ? await fetchEffectiveTeam() : null
    const userPromise = effective?.team
      ? Promise.resolve({
          data: {
            id: effective.team.id,
            name: effective.team.name,
            email: effective.team.email ?? '',
            role: effective.team.role,
          } as CurrentUser,
          error: null,
        })
      : Promise.resolve({ data: null as CurrentUser | null, error: null })
    const [dismissedDataRes, userRes] = await Promise.all([
      supabase.from('dismissed_conflicts').select('production_a_id, production_b_id'),
      userPromise,
    ])

    let prodsData: Production[] | null = null
    let teamList: TeamMember[] = []

    if (userRes?.data && isStudentInternRole(userRes.data.role)) {
      const uid = userRes.data.id
      const [{ data: memRows }, tplRes] = await Promise.all([
        supabase.from('production_members').select('production_id').eq('user_id', uid),
        supabase.from('email_templates').select('*').order('sort_order'),
      ])
      setEmailTemplates((tplRes.data as EmailTemplate[]) || [])
      const ids = [...new Set((memRows || []).map(m => m.production_id).filter(Boolean))] as string[]
      if (ids.length === 0) {
        prodsData = []
      } else {
        const { data } = await supabase.from('productions').select(PRODUCTION_LIST_SELECT).in('id', ids)
        prodsData = data as Production[] | null
      }
      teamList = []
    } else {
      const [pRes, tRes, tplRes] = await Promise.all([
        supabase.from('productions').select(PRODUCTION_LIST_SELECT),
        supabase.from('team').select('id, name, avatar_color, email').eq('active', true).order('name'),
        supabase.from('email_templates').select('*').order('sort_order'),
      ])
      prodsData = pRes.data as Production[] | null
      teamList = (tRes.data as TeamMember[]) || []
      setEmailTemplates((tplRes.data as EmailTemplate[]) || [])
    }

    setTeam(teamList)
    if (userRes?.data) setCurrentUser(userRes.data as CurrentUser)
    // Defensive normalization in case the sync sends prefixed values from the district site
    const cleaned: Production[] = (prodsData || []).map((p: any) => ({
      ...p,
      status: p.status ? p.status.replace(/^\d+\s*-\s*/, '') : p.status,
      production_members: (p.production_members || []).map((m: any) => ({
        ...m,
        team: Array.isArray(m.team) ? (m.team[0] || null) : (m.team || null),
      })),
    }))
    setProductions(sortProductions(cleaned))

    const dismissedData = dismissedDataRes.data
    const dSet = new Set<string>()
    ;(dismissedData || []).forEach((d: any) => { dSet.add(`${d.production_a_id}-${d.production_b_id}`); dSet.add(`${d.production_b_id}-${d.production_a_id}`) })
    setDismissedConflicts(dSet)

    const organizerEmailActs: { production_id: string; detail: string | null }[] = []
    const completeRequestedActs: { production_id: string }[] = []
    const requestedInProgressActs: { production_id: string }[] = []
    const pendingYoutubeEmailIds = cleaned
      .filter(p => isYtEmailPendingProduction(p) && !p.youtube_link_email_sent_at)
      .map(p => p.id)
    if (pendingYoutubeEmailIds.length > 0) {
      const chunks = chunkIds(pendingYoutubeEmailIds, 120)
      const chunkResults = await Promise.all(
        chunks.map(ids =>
          supabase
            .from('production_activity')
            .select('production_id, detail')
            .eq('action', 'Emailed organizer')
            .in('production_id', ids)
        )
      )
      chunkResults.forEach(res => {
        if (res.data) organizerEmailActs.push(...(res.data as { production_id: string; detail: string | null }[]))
      })
    }
    const activeCompletionIds = cleaned
      .filter(p => p.status !== 'Complete' && p.status !== 'Abandoned')
      .map(p => p.id)
    if (activeCompletionIds.length > 0) {
      const chunks = chunkIds(activeCompletionIds, 120)
      const chunkResults = await Promise.all(
        chunks.map(ids =>
          supabase
            .from('production_activity')
            .select('production_id')
            .in('action', ['requested_complete', 'marked_complete'])
            .in('production_id', ids)
        )
      )
      chunkResults.forEach(res => {
        if (res.data) completeRequestedActs.push(...(res.data as { production_id: string }[]))
      })
      const inProgressResults = await Promise.all(
        chunks.map(ids =>
          supabase
            .from('production_activity')
            .select('production_id')
            .eq('action', 'requested_in_progress')
            .in('production_id', ids)
        )
      )
      inProgressResults.forEach(res => {
        if (res.data) requestedInProgressActs.push(...(res.data as { production_id: string }[]))
      })
    }
    setOrganizerYoutubeEmailedIds(productionIdsFromOrganizerYoutubeActivity(organizerEmailActs || []))
    setCompleteRequestedIds(new Set((completeRequestedActs || []).map(r => r.production_id)))
    setRequestedInProgressIds(new Set((requestedInProgressActs || []).map(r => r.production_id)))

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedProdId, closeDrawer])

  const selectProduction = useCallback(async (prodId: string) => {
    if (selectedProdId === prodId) { closeDrawer(); return }
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
  }, [selectedProdId, supabase, productions, closeDrawer])

  useEffect(() => {
    const wantedNumber = searchParams.get('prod')
    if (!wantedNumber || productions.length === 0) return
    const match = productions.find(p => String(p.production_number) === wantedNumber)
    if (match && match.id !== selectedProdId) void selectProduction(match.id)
  }, [productions, searchParams, selectedProdId, selectProduction])

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

  const panelProd = useMemo(
    () => (selectedProdId ? productions.find(p => p.id === selectedProdId) ?? null : null),
    [productions, selectedProdId],
  )

  const getPanelSyncedYoutubeLink = useCallback((): string => {
    if (!panelProd) return ''
    return (panelProd.livestream_url?.trim() || '').trim()
  }, [panelProd])

  const substitutePanelEmailVars = useCallback((str: string): string => {
    if (!panelProd) return str
    const name = panelProd.organizer_name?.split(' ')[0] || 'there'
    const title = panelProd.title
    const type = panelProd.request_type_label || panelProd.type || 'production'
    const date = panelProd.start_datetime
      ? new Date(panelProd.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'TBD'
    const dateShort = panelProd.start_datetime
      ? new Date(panelProd.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'TBD'
    const venue = panelProd.event_location || getSchoolName(panelProd.filming_location) || 'TBD'
    const status = panelProd.status || ''
    const ytLink = getPanelSyncedYoutubeLink()
    return str
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{title\}\}/g, title)
      .replace(/\{\{type\}\}/g, type)
      .replace(/\{\{date_short\}\}/g, dateShort)
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{venue\}\}/g, venue)
      .replace(/\{\{youtube_link\}\}/g, ytLink)
      .replace(/\{\{status\}\}/g, status)
  }, [panelProd, getPanelSyncedYoutubeLink])

  useEffect(() => {
    setShowPanelEmailModal(false)
    setPanelEmailTemplate('')
    setPanelEmailBody('')
    setPanelEmailSubject('')
  }, [selectedProdId])

  useEffect(() => {
    if (!panelEmailTemplate || !panelProd) return
    const t = emailTemplates.find(x => x.id === panelEmailTemplate)
    if (!t) return
    setPanelEmailBody(substitutePanelEmailVars(t.body))
    setPanelEmailSubject(sanitizeEmailSubject(substitutePanelEmailVars(t.subject)))
  }, [panelProd?.livestream_url, panelEmailTemplate, panelProd, emailTemplates, substitutePanelEmailVars])

  const selectPanelEmailTemplate = useCallback((templateId: string) => {
    const t = emailTemplates.find(x => x.id === templateId)
    if (!t || !panelProd) return
    if (templateUsesYoutubeLink(t) && !getPanelSyncedYoutubeLink()) {
      toast('This production does not have a video/livestream link from sync yet. Sync from the productions site first, or pick another template.', 'error')
      return
    }
    setPanelEmailTemplate(templateId)
    setPanelEmailBody(substitutePanelEmailVars(t.body))
    setPanelEmailSubject(sanitizeEmailSubject(substitutePanelEmailVars(t.subject)))
  }, [emailTemplates, panelProd, getPanelSyncedYoutubeLink, substitutePanelEmailVars])

  const openPanelOrganizerEmail = useCallback(async () => {
    if (!panelProd?.organizer_email || !panelEmailBody || !selectedProdId) return
    const tpl = emailTemplates.find(t => t.id === panelEmailTemplate)
    if (templateUsesYoutubeLink(tpl) && !getPanelSyncedYoutubeLink()) {
      toast('No synced video/livestream link on this production yet. Run sync from the productions site before sending this template.', 'error')
      return
    }
    const tplLabel = tpl?.label
    await logPanelActivity('Emailed organizer', tplLabel ? `Template: ${tplLabel}` : 'Custom message')
    if (templateUsesYoutubeLink(tpl) && getPanelSyncedYoutubeLink()) {
      try {
        const res = await fetch('/api/productions/youtube-link-email-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ productionId: selectedProdId }),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok && body.sentAt) {
          setProductions(prev => prev.map(p => (p.id === selectedProdId ? { ...p, youtube_link_email_sent_at: body.sentAt } : p)))
          await logPanelActivity('YouTube link email', 'Logged send (mail client opened with tracked link)')
        } else {
          const fallbackAt = new Date().toISOString()
          const { error } = await supabase.from('productions').update({ youtube_link_email_sent_at: fallbackAt }).eq('id', selectedProdId)
          if (!error) {
            setProductions(prev => prev.map(p => (p.id === selectedProdId ? { ...p, youtube_link_email_sent_at: fallbackAt } : p)))
            await logPanelActivity('YouTube link email', 'Logged send (mail client opened with tracked link)')
          } else {
            toast('Could not save link-email timestamp on the production. The Live email filter uses Activity until fixed.', 'error')
          }
        }
      } catch {
        toast('Could not record link-email timestamp. Try again.', 'error')
      }
    }
    const mailto = `mailto:${panelProd.organizer_email}?subject=${encodeURIComponent(sanitizeEmailSubject(panelEmailSubject))}&body=${encodeURIComponent(panelEmailBody)}`
    window.location.href = mailto
    setTimeout(() => {
      setShowPanelEmailModal(false)
      setPanelEmailTemplate('')
      setPanelEmailBody('')
      setPanelEmailSubject('')
    }, 500)
  }, [panelProd, panelEmailBody, panelEmailSubject, panelEmailTemplate, emailTemplates, selectedProdId, supabase, logPanelActivity, getPanelSyncedYoutubeLink])

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
              subject: sanitizeEmailSubject(`You've been added to #${prod.production_number} ${prod.title}`),
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

  const toStatusWire = (p: Production): ProductionStatusWire => ({
    id: p.id,
    production_number: p.production_number,
    title: p.title,
    request_type_label: p.request_type_label,
    type: p.type,
    organizer_name: p.organizer_name,
    start_datetime: p.start_datetime,
  })

  const overdueStripInProgress = async (p: Production) => {
    if (!currentUser?.email) {
      toast('Missing profile email', 'error')
      return
    }
    setOverdueQuickActionId(p.id)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session?.access_token) {
        toast('Not signed in', 'error')
        return
      }
      const r = await hubRequestProductionInProgress({
        supabase,
        accessToken: session.access_token,
        production: toStatusWire(p),
        currentUserEmail: currentUser.email,
        currentUserId: currentUser.id,
      })
      if (!r.ok) {
        toast(r.message, 'error')
        return
      }
      setProductions(prev => prev.map(x => (x.id === p.id ? { ...x, status: 'In Progress' } : x)))
      setRequestedInProgressIds(prev => new Set(prev).add(p.id))
      toast('Marked In Progress', 'success')
    } finally {
      setOverdueQuickActionId(null)
    }
  }

  const overdueStripComplete = async (p: Production) => {
    if (!currentUser?.email) {
      toast('Missing profile email', 'error')
      return
    }
    if (!window.confirm(`Send complete request for #${p.production_number} ${p.title}?`)) return
    setOverdueQuickActionId(p.id)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session?.access_token) {
        toast('Not signed in', 'error')
        return
      }
      const r = await hubRequestProductionComplete({
        supabase,
        accessToken: session.access_token,
        production: toStatusWire(p),
        currentUserEmail: currentUser.email,
        currentUserId: currentUser.id,
      })
      if (!r.ok) {
        toast(r.message, 'error')
        return
      }
      setProductions(prev => prev.map(x => (x.id === p.id ? { ...x, status: 'Complete Requested' } : x)))
      setCompleteRequestedIds(prev => new Set(prev).add(p.id))
      toast('Complete request sent', 'success')
    } finally {
      setOverdueQuickActionId(null)
    }
  }

  const getTypeLabel = (p: Production) => p.request_type_label || p.type || 'Unknown'
  const getTypeColor = (p: Production) => TYPE_COLORS[getTypeLabel(p)] || '#64748b'
  const isStudentInternUser = useMemo(() => isStudentInternRole(currentUser?.role), [currentUser?.role])

  useEffect(() => {
    if (isStudentInternUser) setScope('mine')
  }, [isStudentInternUser])

  /** True if staff logged sending the organizer link email (column or activity). */
  const youtubeOrganizerEmailLogged = useCallback(
    (p: Production) => organizerYoutubeEmailLogged(p, organizerYoutubeEmailedIds),
    [organizerYoutubeEmailedIds],
  )
  const isCompleteRequested = useCallback((p: Production) => {
    if (p.status === 'Complete Requested') return true
    if (p.status === 'Complete' || p.status === 'Abandoned') return false
    if (requestedInProgressIds.has(p.id)) return false
    return completeRequestedIds.has(p.id)
  }, [completeRequestedIds, requestedInProgressIds])
  const getProgress = (p: Production) => {
    const items = p.checklist_items || []
    if (items.length === 0) return null
    const done = items.filter(i => i.completed).length
    return { done, total: items.length, pct: Math.round((done / items.length) * 100) }
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

  const yearOptions = useMemo(() => buildSchoolYearFilterOptions(productions), [productions])

  const yearScopedProductions = useMemo(() => productions.filter(p => (
    matchesSchoolYearFilter(
      { school_year: p.school_year, start_datetime: p.start_datetime, status: p.status },
      schoolYearFilter,
    )
  )), [productions, schoolYearFilter])

  // Scope-aware base set
  const scopedProductions = useMemo(() => yearScopedProductions.filter(p => {
    if (scope === 'mine') return currentUser !== null && (p.production_members || []).some(m => m.user_id === currentUser.id)
    if (scope === 'unassigned') return (p.production_members || []).length === 0
    return true
  }), [yearScopedProductions, scope, currentUser])

  const allTypes = useMemo(() => Array.from(new Set(productions.map(p => getTypeLabel(p)))).filter(Boolean).sort(), [productions])

  // Counts (scope-aware) for focus chips & briefing — omit Complete/Abandoned only
  const counts = useMemo(() => {
    let all = 0, today = 0, thisWeek = 0, overdue = 0, understaffed = 0, upcoming = 0, liveEmailPending = 0, missingLink = 0
    scopedProductions.forEach(p => {
      if (!countsTowardFocusBubbles(p)) return
      all++
      const d = daysFromToday(p.start_datetime)
      const isFutureUpcoming = d !== null && d >= 0 && p.status !== 'Complete' && p.status !== 'Abandoned'
      if (d === 0) today++
      if (d !== null && d >= 0 && d <= 7) thisWeek++
      if (isOverdueProd(p)) overdue++
      if (isUnderstaffedProductionFocus(p)) understaffed++
      if (isFutureUpcoming) upcoming++
      if (isYtEmailPendingProduction(p, organizerYoutubeEmailedIds)) liveEmailPending++
      if (isYtMissingLinkProduction(p)) missingLink++
    })
    return { today, thisWeek, overdue, understaffed, upcoming, liveEmailPending, missingLink, all }
  }, [scopedProductions, organizerYoutubeEmailedIds])

  const ytPendingOnly = searchParams.get('ytPending') === '1' || searchParams.get('ytEmailPending') === '1'
  const ytMissingLinkOnly = searchParams.get('ytMissingLink') === '1'

  const briefingText = useMemo(() => {
    const parts: string[] = []
    if (counts.thisWeek > 0) parts.push(`${counts.thisWeek} this week`)
    if (counts.overdue > 0) parts.push(`${counts.overdue} overdue`)
    if (counts.understaffed > 0) parts.push(`${counts.understaffed} understaffed`)
    parts.push(`${counts.all} total`)
    return parts.join(' · ')
  }, [counts])

  // Filter pipeline: focus → status → type → search (scope is already applied via scopedProductions)
  const filtered = useMemo(() => scopedProductions.filter(p => {
    if (ytPendingOnly && !isYtEmailPendingProduction(p, organizerYoutubeEmailedIds)) return false
    if (ytMissingLinkOnly && !isYtMissingLinkProduction(p)) return false
    if (focusFilter === 'today' && daysFromToday(p.start_datetime) !== 0) return false
    if (focusFilter === 'this-week') {
      const d = daysFromToday(p.start_datetime)
      if (d === null || d < 0 || d > 7) return false
    }
    if (focusFilter === 'overdue' && !isOverdueProd(p)) return false
    if (focusFilter === 'understaffed' && !isUnderstaffedProductionFocus(p)) return false
    if (focusFilter === 'upcoming') {
      const d = daysFromToday(p.start_datetime)
      if (d === null || d < 0) return false
      if (p.status === 'Complete' || p.status === 'Abandoned') return false
    }
    if (focusFilter === 'live-email-pending' && !isYtEmailPendingProduction(p, organizerYoutubeEmailedIds)) return false
    if (focusFilter === 'missing-link' && !isYtMissingLinkProduction(p)) return false
    if (typeFilter !== 'all' && getTypeLabel(p) !== typeFilter) return false
    const effectiveStatus = isCompleteRequested(p) ? 'Complete Requested' : p.status
    if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false
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
  }), [scopedProductions, ytPendingOnly, ytMissingLinkOnly, focusFilter, typeFilter, statusFilter, search, organizerYoutubeEmailedIds, isCompleteRequested])

  const overdueProds = useMemo(() => filtered.filter(isOverdueProd), [filtered])

  const conflicts = useMemo(() => {
    const upcoming = filtered.filter(p => {
      if (!p.start_datetime || p.status === 'Complete' || p.status === 'Abandoned') return false
      const df = daysFromToday(p.start_datetime)
      return df !== null && df >= 0
    })
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

  // Pipeline groups — keep all non-complete/non-abandoned visible regardless of date.
  const inProgress = useMemo(() => filtered.filter(p => p.status === 'In Progress' && !isCompleteRequested(p)), [filtered, isCompleteRequested])
  const ideaForward = useMemo(() => filtered.filter(p => p.status === 'Idea/Request' && !isCompleteRequested(p)), [filtered, isCompleteRequested])
  const approvedForward = useMemo(() => filtered.filter(p => p.status === 'Approved/Scheduled' && !isCompleteRequested(p)), [filtered, isCompleteRequested])
  const completeRequestedForward = useMemo(() => filtered.filter(p => isCompleteRequested(p)), [filtered, isCompleteRequested])
  const pastArchiveProds = useMemo(() => filtered.filter(p => {
    return p.status === 'Complete'
  }), [filtered])
  const abandonedProds = useMemo(() => filtered.filter(p => p.status === 'Abandoned'), [filtered])
  const miscPipelineProds = useMemo(() => filtered.filter(p => {
    const s = p.status || ''
    if (isCompleteRequested(p)) return false
    return s !== '' && !['Idea/Request', 'In Progress', 'Approved/Scheduled', 'Complete Requested', 'Complete', 'Abandoned'].includes(s)
  }), [filtered, isCompleteRequested])

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
    const effectiveStatus = isCompleteRequested(prod) ? 'Complete Requested' : prod.status
    const overdue   = isOverdueProd({ ...prod, status: effectiveStatus })
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
            borderRadius: '10px', padding: '10px 12px', marginBottom: '6px',
            cursor: 'pointer', transition: 'all 0.15s',
            borderLeft: `3px solid ${overdue ? danger : typeColor}`,
          }}
          onMouseEnter={e => { if (!isOpen) { (e.currentTarget as HTMLDivElement).style.background = hoverBg; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isOpen ? 'rgba(91,163,224,0.10)' : cardBg; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', color: muted }}>#{prod.production_number}</span>
                {overdue && <span style={{ ...statusBadge('danger', true), fontSize: '10px', padding: '1px 6px' }}>Overdue</span>}
                {past && !overdue && <span style={{ fontSize: '10px', color: muted, background: surface2, padding: '1px 6px', borderRadius: '4px' }}>Past</span>}
                {healthColor && !past && <span title={healthTip || ''} style={{ width: '8px', height: '8px', borderRadius: '50%', background: healthColor, display: 'inline-block', flexShrink: 0 }} />}
              </div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: text, margin: 0, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1 as any, WebkitBoxOrient: 'vertical' as any }}>{prod.title}</p>
            </div>
            {members.length > 0 ? (
              <div style={{ display: 'flex', flexShrink: 0 }}>
                {members.slice(0, 3).map((m, i) => m.team && (
                  <div key={m.user_id} title={m.team.name} style={{ width: '20px', height: '20px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', marginLeft: i > 0 ? '-6px' : 0, border: `2px solid ${cardBg}`, zIndex: members.length - i, position: 'relative' }}>
                    {m.team.name.slice(0, 2).toUpperCase()}
                  </div>
                ))}
              </div>
            ) : !past ? (
              <span style={{ ...statusBadge('danger', true), fontSize: '10px', padding: '2px 8px', flexShrink: 0 }}>Unassigned</span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: progress ? '6px' : '0' }}>
            {renderTypePill(prod)}
            <span style={{ fontSize: '11px', color: muted }}>{primaryContactLabel(prod)}</span>
            {prod.start_datetime && <span style={{ fontSize: '11px', color: muted }}>· {formatDate(prod.start_datetime)}</span>}
          </div>

          {progress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '4px', background: surface2, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${progress.pct}%`, height: '100%', background: progress.pct === 100 ? success : typeColor, borderRadius: '2px' }} />
              </div>
              <span style={{ fontSize: '11px', color: muted, flexShrink: 0 }}>{progress.done}/{progress.total}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <Link
              href={`/dashboard/productions/${prod.production_number}`}
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--brand-primary)',
                textDecoration: 'none',
                padding: '3px 7px',
                border: `1px solid ${border}`,
                borderRadius: '6px',
                background: surface2,
              }}
            >
              Open page →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const renderPipelineCardsWithUpcomingDivider = (prods: Production[]) => {
    const current: Production[] = []
    const upcoming: Production[] = []
    for (const p of prods) {
      if (isNextSchoolYearOnlyProduction({ school_year: p.school_year, start_datetime: p.start_datetime })) {
        upcoming.push(p)
      } else {
        current.push(p)
      }
    }
    if (upcoming.length === 0) {
      return prods.map(p => <ProductionCard key={p.id} prod={p} />)
    }
    return (
      <>
        {current.map(p => <ProductionCard key={p.id} prod={p} />)}
        <div
          role="separator"
          style={{
            margin: '12px 0 8px',
            paddingTop: '10px',
            borderTop: `1px dashed ${border}`,
            fontSize: '11px',
            fontWeight: 700,
            color: muted,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {planningSchoolYearDividerLabel()}
        </div>
        {upcoming.map(p => <ProductionCard key={p.id} prod={p} />)}
      </>
    )
  }

  // ---------- Production row (list view) ----------
  const ProductionRow = ({ prod, isLast }: { prod: Production; isLast: boolean }) => {
    const past      = isPastProd(prod)
    const effectiveStatus = isCompleteRequested(prod) ? 'Complete Requested' : prod.status
    const overdue   = isOverdueProd({ ...prod, status: effectiveStatus })
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
        {renderStatusPill(effectiveStatus)}
        <Link
          href={`/dashboard/productions/${prod.production_number}`}
          onClick={e => e.stopPropagation()}
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--brand-primary)',
            textDecoration: 'none',
            padding: '4px 8px',
            border: `1px solid ${border}`,
            borderRadius: '6px',
            background: surface2,
            flexShrink: 0,
          }}
        >
          Open page →
        </Link>
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
                        <option value="Complete Requested">Complete Requested</option>
                        <option value="Complete">Complete</option>
                        <option value="Abandoned">Abandoned</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {(ytPendingOnly || focusFilter === 'live-email-pending') && (
            <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '12px', border: `1px solid ${info}`, background: dark ? 'rgba(91,163,224,0.08)' : 'rgba(91,163,224,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' as const }}>
              <p style={{ margin: 0, fontSize: '13px', color: text }}>
                Board meetings and livestreams (approved or in progress) with a synced production link and no organizer YouTube email logged yet — matches the dashboard follow-up counts.
              </p>
              <Link href="/dashboard/productions" style={{ fontSize: '13px', fontWeight: 600, color: info, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                Clear filter
              </Link>
            </div>
          )}
          {(ytMissingLinkOnly || focusFilter === 'missing-link') && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${warning}`, background: dark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' as const }}>
              <p style={{ margin: 0, fontSize: '13px', color: text }}>
                Board meetings and livestreams (approved or in progress) missing a synced production link from the district site.
              </p>
              <Link href="/dashboard/productions" style={{ fontSize: '13px', fontWeight: 600, color: warning, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
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
              {focusChip('understaffed', 'Understaffed', counts.understaffed, 'danger')}
              {focusChip('live-email-pending', 'Live email', counts.liveEmailPending, 'info')}
              {focusChip('missing-link', 'Missing link', counts.missingLink, 'warning')}
            </div>
          </section>

          {/* SCOPE / SEARCH */}
          <section style={{ marginBottom: '20px' }}>
            <div className="scope-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const }}>
              {!isStudentInternUser && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  {scopeBtn('all', 'All')}
                  {scopeBtn('mine', 'Mine')}
                  {scopeBtn('unassigned', 'Unassigned')}
                </div>
              )}
              <div className="search-wrap" style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 12px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, organizer, type, number..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: text, fontFamily: 'inherit' }} />
                {search && <button onClick={() => setSearch('')} aria-label="Clear search" style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>}
              </div>
              <select value={schoolYearFilter} onChange={e => setSchoolYearFilter(e.target.value)} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 10px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none' }}>
                <option value={PLANNING_SCHOOL_YEARS}>{planningSchoolYearFilterLabel()}</option>
                <option value={ALL_SCHOOL_YEARS}>All school years</option>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {(typeFilter !== 'all' || statusFilter !== 'all' || schoolYearFilter !== PLANNING_SCHOOL_YEARS) && (
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
                {schoolYearFilter !== PLANNING_SCHOOL_YEARS && (
                  <span style={{ ...statusBadge('info', true), fontSize: '11px' }}>
                    Year: {schoolYearFilter === ALL_SCHOOL_YEARS ? 'All' : schoolYearFilter}
                    <button onClick={() => setSchoolYearFilter(PLANNING_SCHOOL_YEARS)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '4px', padding: 0, fontSize: '12px', lineHeight: 1 }}>×</button>
                  </span>
                )}
              </div>
            )}
          </section>

          {/* ALERTS — compact by default; side-by-side on wide screens */}
          {(overdueProds.length > 0 || conflicts.length > 0) && (
            <section style={{ marginBottom: '14px' }}>
              <div
                className="production-alerts-row"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap' as const,
                  gap: '8px',
                  alignItems: 'stretch',
                }}
              >
                {overdueProds.length > 0 && focusFilter !== 'overdue' && (
                  <div style={{ flex: '1 1 280px', minWidth: 0, maxWidth: '100%', background: dangerBg, border: `1px solid ${danger}40`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button onClick={() => setOverdueExpanded(v => !v)} aria-expanded={overdueExpanded} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: danger }}>
                        {overdueProds.length} overdue production{overdueProds.length !== 1 ? 's' : ''}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span onClick={e => { e.stopPropagation(); setFocusFilter('overdue'); setOverdueExpanded(false) }} style={{ fontSize: '11px', color: danger, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Show only</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={danger} strokeWidth="2.5" style={{ transform: overdueExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} aria-hidden><polyline points="9 18 15 12 9 6"/></svg>
                      </span>
                    </button>
                    {overdueExpanded && (
                      <div style={{ borderTop: `1px solid ${danger}30`, padding: '6px 10px 8px' }}>
                        {overdueProds.slice(0, 8).map((p, idx) => {
                          const busy = overdueQuickActionId === p.id
                          const showInProg = p.status !== 'In Progress'
                          const showComplete = p.status !== 'Complete' && !isCompleteRequested(p)
                          const isLast = idx === Math.min(overdueProds.length, 8) - 1
                          return (
                            <div
                              key={p.id}
                              style={{
                                display: 'flex',
                                flexDirection: 'column' as const,
                                gap: '6px',
                                padding: '6px 0',
                                borderBottom: isLast ? 'none' : `1px solid ${danger}22`,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => selectProduction(p.id)}
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'block',
                                    textAlign: 'left' as const,
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    padding: 0,
                                  }}
                                >
                                  <span style={{ fontSize: '11px', color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                                    <span style={{ fontWeight: 600, color: danger }}>#{p.production_number}</span>
                                    {' '}
                                    {p.title}
                                  </span>
                                </button>
                                <span style={{ fontSize: '10px', color: danger, fontWeight: 600, flexShrink: 0, paddingTop: '2px' }}>
                                  {p.start_datetime ? new Date(p.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                </span>
                              </div>
                              {(showInProg || showComplete) && (
                                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px', alignItems: 'center' }}>
                                  {showInProg && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={e => { e.stopPropagation(); overdueStripInProgress(p) }}
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: `1px solid ${border}`,
                                        background: warningBg,
                                        color: warning,
                                        cursor: busy ? 'not-allowed' : 'pointer',
                                        fontFamily: 'inherit',
                                        opacity: busy ? 0.6 : 1,
                                      }}
                                    >
                                      In progress
                                    </button>
                                  )}
                                  {showComplete && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={e => { e.stopPropagation(); overdueStripComplete(p) }}
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: `1px solid ${border}`,
                                        background: successBg,
                                        color: success,
                                        cursor: busy ? 'not-allowed' : 'pointer',
                                        fontFamily: 'inherit',
                                        opacity: busy ? 0.6 : 1,
                                      }}
                                    >
                                      Request complete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {overdueProds.length > 8 && <p style={{ fontSize: '10px', color: muted, margin: '4px 0 0', textAlign: 'center' as const }}>+{overdueProds.length - 8} more</p>}
                      </div>
                    )}
                  </div>
                )}
                {conflicts.length > 0 && (
                  <div style={{ flex: '1 1 280px', minWidth: 0, maxWidth: '100%', background: dangerBg, border: `1px solid ${danger}40`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button onClick={() => setConflictsExpanded(v => !v)} aria-expanded={conflictsExpanded} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: danger }}>
                        {conflicts.length} scheduling conflict{conflicts.length !== 1 ? 's' : ''}
                      </span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={danger} strokeWidth="2.5" style={{ transform: conflictsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} aria-hidden><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    {conflictsExpanded && (
                      <div style={{ borderTop: `1px solid ${danger}30`, padding: '4px 10px 6px' }}>
                        {conflicts.slice(0, 5).map((c, i) => {
                          const d = new Date(c.a.start_datetime!)
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 0', borderBottom: i < Math.min(conflicts.length, 5) - 1 ? `1px solid ${danger}22` : 'none' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '10px', fontWeight: 700, color: danger, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '3px' }}>
                                  {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </div>
                                <div style={{ fontSize: '11px', color: text, lineHeight: 1.35 }}>
                                  <div>
                                    <span style={{ fontWeight: 600 }}>#{c.a.production_number}</span>{' '}{c.a.title}
                                  </div>
                                  <div style={{ marginTop: '2px' }}>
                                    <span style={{ fontWeight: 600 }}>#{c.b.production_number}</span>{' '}{c.b.title}
                                  </div>
                                </div>
                              </div>
                              <button type="button" onClick={() => dismissConflict(c.a.id, c.b.id)} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', background: cardBg, border: `1px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, alignSelf: 'center' }}>Dismiss</button>
                            </div>
                          )
                        })}
                        {conflicts.length > 5 && <p style={{ fontSize: '10px', color: muted, margin: '4px 0 0', textAlign: 'center' as const }}>+{conflicts.length - 5} more</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* PIPELINE VIEW */}
          {view === 'pipeline' && (
            <>
              {ideaForward.length > 0 && (
                <section style={{ marginBottom: '10px' }}>
                  <div style={{ background: warningBg, border: `1px solid ${warning}45`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setIdeaStripExpanded(v => !v)}
                      aria-expanded={ideaStripExpanded}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600, color: warning }}>
                        {ideaForward.length} idea / request{ideaForward.length !== 1 ? 's' : ''} (upcoming or no date)
                      </span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={warning} strokeWidth="2.5" style={{ transform: ideaStripExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} aria-hidden><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    {ideaStripExpanded && (
                      <div style={{ borderTop: `1px solid ${warning}35`, padding: '6px 10px 8px' }}>
                        {renderPipelineCardsWithUpcomingDivider(ideaForward)}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <div className="pipeline-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '16px', alignItems: 'start' }}>
                  {inProgress.length > 0 && (
                    <div style={{ background: colBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '14px' }}>
                      {colHeader('In Progress', inProgress.length, 'warning')}
                      {renderPipelineCardsWithUpcomingDivider(inProgress)}
                    </div>
                  )}
                  <div style={{ background: colBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '14px' }}>
                    {colHeader('Approved / Scheduled', approvedForward.length, 'success')}
                    {approvedForward.length === 0 ? (
                      <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '16px 0', margin: 0 }}>No approved / scheduled productions</p>
                    ) : renderPipelineCardsWithUpcomingDivider(approvedForward)}
                  </div>
                  <div style={{ background: colBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '14px' }}>
                    {colHeader('Complete Requested', completeRequestedForward.length, 'review')}
                    {completeRequestedForward.length === 0 ? (
                      <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '16px 0', margin: 0 }}>No completion requests</p>
                    ) : renderPipelineCardsWithUpcomingDivider(completeRequestedForward)}
                  </div>
                  {miscPipelineProds.length > 0 && (
                    <div style={{ background: colBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '14px' }}>
                      {colHeader('Other statuses', miscPipelineProds.length, null)}
                      {renderPipelineCardsWithUpcomingDivider(miscPipelineProds)}
                    </div>
                  )}
              </div>

              {pastArchiveProds.length > 0 && (
                <section style={{ marginTop: '12px' }}>
                  <div style={{ background: surface2, border: `1px solid ${border}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setPastArchiveExpanded(v => !v)}
                      aria-expanded={pastArchiveExpanded}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: text }}>
                          Past &amp; archive ({pastArchiveProds.length})
                        </span>
                        <span style={{ display: 'block', fontSize: '10px', color: muted, marginTop: '2px', lineHeight: 1.35 }}>
                          Completed productions only
                        </span>
                      </span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2.5" style={{ transform: pastArchiveExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }} aria-hidden><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    {pastArchiveExpanded && (
                      <div style={{ borderTop: `1px solid ${border}`, padding: '8px 10px 10px', maxHeight: 'min(70vh, 520px)', overflowY: 'auto' as const }}>
                        {pastArchiveProds.map(p => <ProductionCard key={p.id} prod={p} />)}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {abandonedProds.length > 0 && (
                <section style={{ marginTop: '8px' }}>
                  <div style={{ background: dangerBg, border: `1px solid ${danger}40`, borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setAbandonedExpanded(v => !v)}
                      aria-expanded={abandonedExpanded}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600, color: danger }}>
                        Abandoned ({abandonedProds.length})
                      </span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={danger} strokeWidth="2.5" style={{ transform: abandonedExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} aria-hidden><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    {abandonedExpanded && (
                      <div style={{ borderTop: `1px solid ${danger}30`, padding: '8px 10px 10px', maxHeight: 'min(50vh, 400px)', overflowY: 'auto' as const }}>
                        {abandonedProds.map(p => <ProductionCard key={p.id} prod={p} />)}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
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
            <div className="drawer-backdrop" onClick={closeDrawer} />
            <aside className="drawer-panel" style={{ flexShrink: 0, background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', overflowY: 'auto' as const }}>
              <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '14px 18px 10px', borderBottom: `1px solid ${border}`, position: 'sticky' as const, top: 0, background: cardBg, zIndex: 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '11px', color: muted, margin: '0 0 2px', fontWeight: 600 }}>#{selectedProd.production_number}</p>
                  <h2 style={{ fontSize: '17px', fontWeight: 700, color: text, margin: 0, lineHeight: 1.25 }}>{selectedProd.title}</h2>
                </div>
                <button onClick={closeDrawer} aria-label="Close detail" style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
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
                      <button
                        type="button"
                        onClick={() => setShowPanelEmailModal(true)}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: statusTone.info.background,
                          color: info,
                          border: `1px solid ${border}`,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        ✉ Email organizer
                      </button>
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

            {showPanelEmailModal && selectedProd && (
              <div
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                onClick={e => { if (e.target === e.currentTarget) setShowPanelEmailModal(false) }}
              >
                <div style={{ background: 'var(--surface-1)', border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' as const, padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: 0 }}>Email organizer</h2>
                    <button type="button" onClick={() => setShowPanelEmailModal(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
                  </div>

                  <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>
                    To: <strong style={{ color: text }}>{selectedProd.organizer_name || 'Organizer'}</strong> ({selectedProd.organizer_email})
                  </p>

                  {emailTemplates.length > 0 ? (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                      {emailTemplates.map(t => {
                        const ytTemplateLocked = templateUsesYoutubeLink(t) && !getPanelSyncedYoutubeLink()
                        return (
                          <button
                            key={t.id}
                            type="button"
                            title={ytTemplateLocked ? 'Requires a synced livestream/video link on this production (from productions site sync)' : undefined}
                            disabled={ytTemplateLocked}
                            onClick={() => selectPanelEmailTemplate(t.id)}
                            style={{
                              fontSize: '12px',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              border: `0.5px solid ${panelEmailTemplate === t.id ? '#1e6cb5' : border}`,
                              background: panelEmailTemplate === t.id ? 'rgba(30,108,181,0.12)' : cardBg,
                              color: panelEmailTemplate === t.id ? '#5ba3e0' : muted,
                              cursor: ytTemplateLocked ? 'not-allowed' : 'pointer',
                              opacity: ytTemplateLocked ? 0.45 : 1,
                              fontFamily: 'inherit',
                            }}
                          >
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: '12px', color: muted, margin: '0 0 14px', padding: '10px 12px', background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', borderRadius: '8px', border: `0.5px solid ${border}` }}>
                      No templates configured. <Link href="/dashboard/settings" style={{ color: '#5ba3e0' }}>Add templates in Settings</Link>.
                    </p>
                  )}

                  {panelEmailTemplate && templateUsesYoutubeLink(emailTemplates.find(t => t.id === panelEmailTemplate)) && !getPanelSyncedYoutubeLink() && (
                    <p style={{ fontSize: '12px', color: warning, margin: '0 0 12px', padding: '10px 12px', background: warningBg, borderRadius: '8px', border: `0.5px solid ${border}` }}>
                      This template needs a video/livestream link from the district sync (livestream URL on this production). Sync from the productions site first.
                    </p>
                  )}

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Subject</label>
                    <input value={panelEmailSubject} onChange={e => setPanelEmailSubject(e.target.value)} placeholder="Email subject..." style={{ ...panelEmailInputStyle }} />
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Message</label>
                    <textarea value={panelEmailBody} onChange={e => setPanelEmailBody(e.target.value)} placeholder="Pick a template or write your message..." style={{ ...panelEmailInputStyle, minHeight: '240px', resize: 'vertical' as const, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }} />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button type="button" onClick={openPanelOrganizerEmail} disabled={!panelEmailBody} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: panelEmailBody ? '#1e6cb5' : 'var(--surface-2)', color: panelEmailBody ? '#fff' : muted, border: 'none', cursor: panelEmailBody ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500 }}>
                      ✉ Open in Outlook
                    </button>
                    <button type="button" onClick={() => setShowPanelEmailModal(false)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: muted, margin: '8px 0 0' }}>Opens your default email app so you can review and send. The send is logged to this production's activity when you click the button.</p>
                </div>
              </div>
            )}
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
