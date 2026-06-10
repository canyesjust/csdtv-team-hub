'use client'

import { useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase'
import { confirmDialog } from '@/lib/confirm'
import { useTheme } from '@/lib/theme'
import { getSchoolName } from '@/lib/schools'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Loader from '../../components/Loader'
import StudentCrewTab from './components/StudentCrewTab'
import BoardMeetingTab from './components/BoardMeetingTab'
import ChecklistTab from './components/ChecklistTab'
import InfoTab from './components/InfoTab'
import TeamTab from './components/TeamTab'
import LinksTab from './components/LinksTab'
import ActivityTab from './components/ActivityTab'
import VideosTab from './components/VideosTab'
import ThumbnailTab from './components/ThumbnailTab'
import CallsheetTab from './components/CallsheetTab'
import CommentsTab from './components/CommentsTab'
import type { PTabCtx } from './components/production-tab-ctx'
import { toast } from '@/lib/toast'
import { ZoneHeader } from '../../components/ZoneHeader'
import { uiStyles, statusBadge, statusTone } from '@/lib/ui/styles'
import { escapeHtml, sanitizeEmailSubject } from '@/lib/escape-html'
import { isProductionTabVisible } from '@/lib/dashboard-access'
import { isStudentInternRole } from '@/lib/roles'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'
import { hubRequestProductionComplete, hubRequestProductionInProgress } from '@/lib/production-status-requests'
import { NEUTRAL_BRAND_HEX, promptBrandHexesFromRow, resolveSchoolFromPicker, schoolCodesMatch } from '@/lib/thumbnail-school-brand'
import { normalizeProductionDatetimeFields } from '@/lib/productions/effective-datetime'

export interface Production {
  id: string; production_number: number; title: string
  type: string | null; request_type_label: string | null; request_type_number: number | null
  internal_type_label: string | null; status: string | null; status_code: number | null
  created_on: string | null; is_on_behalf: boolean | null; sent_approved_email: boolean | null
  organizer_name: string | null; organizer_email: string | null
  school_department: string | null; school_year: string | null; focus_area: string | null; focus_area_code: string | null
  start_datetime: string | null; end_datetime: string | null
  filming_location: string | null; filming_location_details: string | null; event_location: string | null
  start_datetime_label: string | null; end_datetime_label: string | null
  additional_notes: string | null; video_description: string | null; video_addons_array: string[] | null; audio_options_array: string[] | null
  submitter_user_id: number | null; submitter_site_user_id: string | null; submitter_username: string | null
  submitter_name: string | null; submitter_email: string | null; submitter_building_code: string | null; submitter_employee_number: string | null
  production_staff: Array<Record<string, unknown>> | null
  livestream_url: string | null; thumbnail_url: string | null
  project_lead: string | null; synced_at: string | null; team_notes: string | null
  deliverables_count: number; deliverables_notes: string | null
  estimated_external_cost: number | null
  camera_options: string | null
  youtube_link_email_sent_at: string | null
  youtube_link_email_first_click_at: string | null
  youtube_link_email_click_count: number | null
}

export interface ChecklistItem {
  id: string; title: string; completed: boolean
  completed_at: string | null; assigned_to: string | null; sort_order: number
  kb_article_id: string | null
}

export interface ProductionMember {
  id: string; user_id: string
  team: { id: string; name: string; role: string; avatar_color: string } | null
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  avatar_color: string
  dashboard_profile?: string | null
}
export interface SchoolBrand {
  id: string
  code: string | null
  name: string
  short_name?: string | null
  mascot?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
  text_color?: string | null
  link_url?: string | null
  city?: string | null
  title_i?: string | null
  mascot_name?: string | null
  type?: string | null
  school_type?: string | null
  active?: boolean | null
}

export interface ProductionLink { id: string; title: string; url: string; created_at: string }

export interface KBArticle { id: string; title: string; category: string }

export interface ActivityItem {
  id: string; action: string; detail: string | null; created_at: string
  user_id: string
  team?: { name: string } | null
}

export interface CameraPackageRow {
  option_id: number
  label: string
  cost: number
}

interface EmailTemplate {
  id: string
  template_key: string
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

const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  'LiveStream Meeting': ['Create thumbnail','Create livestream link','Assign staff','Determine if students needed','Confirm equipment type and pack','Email organizer'],
  'Record Meeting': ['Gather equipment','Record','Edit','Send for feedback','Final export','Send to organizer'],
  'Create a Video(Film, Edit, Publish)': ['Work with organizer on script','Create shot guide','Prep shoot and schedule','Pack equipment','Film','Edit','Send for feedback','Final export','Send to organizer'],
  'Create a Video': ['Work with organizer on script','Create shot guide','Prep shoot and schedule','Pack equipment','Film','Edit','Send for feedback','Final export','Send to organizer'],
  'Board Meeting': ['Setup board room','Find out if any virtual attendees','Create stream link','Create thumbnail','Email link to comms','Add to agenda','Stream meeting','Export board comments and run through AI','Email to Jeff'],
  'Photo Headshots': ['Confirm appointment','Send email — what to wear','Pack up shoot','Shoot','Edit photos','Send to organizer'],
  'Podcast': ['Confirm guest and topic','Prep equipment','Record','Edit audio','Create artwork or thumbnail','Export and publish'],
  'Other, Unsure, Or Consultation': ['Initial consultation','Define scope and deliverables','Execute','Review and deliver'],
}

const THUMB_EVENT_TYPES = ['concert', 'ceremony', 'recognition', 'panel', 'sports', 'parent-meeting', 'performance', 'competition', 'graduation'] as const
const THUMB_TONES = ['bold-energetic', 'bright-celebratory', 'dignified-ceremonial', 'warm-community', 'refined-academic'] as const
const THUMB_MASCOT_MODES = ['name', 'unknown', 'none-applicable'] as const
const THUMB_DRAFT_VERSION = 1
const THUMB_DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 30

interface ThumbnailDraft {
  version: number
  savedAt: number
  schoolCode: string
  eventName: string
  date: string
  time: string
  schoolOverride: string
  detail: string
  mascotMode: (typeof THUMB_MASCOT_MODES)[number]
  eventType: (typeof THUMB_EVENT_TYPES)[number]
  tone: (typeof THUMB_TONES)[number]
  eventDescription: string
  logistics: string
  conceptAnchor: string
  prompt: string
  svgInput: string
}

const PRODUCTION_TABS = [
  'checklist',
  'info',
  'team',
  'links',
  'activity',
  'comments',
  'videos',
  'thumbnail',
  'callsheet',
  'studentcrew',
  'boardmeeting',
] as const

type ProductionTab = (typeof PRODUCTION_TABS)[number]

export type LinkedVideo = { id: string; title: string; video_type: string; status: string; date_published: string | null; youtube_url: string | null; youtube_id: string | null; youtube_views: number | null; youtube_likes: number | null; youtube_duration: string | null; youtube_thumbnail: string | null }
export type LinkedTask = { id: string; title: string; status: string; priority: string; assigned_to: string | null; due_date: string | null }
export type ProdLite = { id: string; production_number: number; title: string }

function parseProductionTabFromUrl(
  raw: string | null,
  isBoardMeeting: boolean,
): ProductionTab | null {
  if (!raw) return null
  const tab = raw.toLowerCase() as ProductionTab
  if (!PRODUCTION_TABS.includes(tab)) return null
  if (tab === 'boardmeeting' && !isBoardMeeting) return null
  return tab
}

export default function ProductionDetailPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const productionNum = params.id as string

  const [production, setProduction] = useState<Production | null>(null)
  const [uuid, setUuid] = useState<string>('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [members, setMembers] = useState<ProductionMember[]>([])
  const [allTeam, setAllTeam] = useState<TeamMember[]>([])
  const [links, setLinks] = useState<ProductionLink[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([])
  const [linkedVideos, setLinkedVideos] = useState<LinkedVideo[]>([])
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([])
  const [callSheet, setCallSheet] = useState<any>(null)
  const [generatingSheet, setGeneratingSheet] = useState(false)
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ProductionTab>(
    () => parseProductionTabFromUrl(searchParams.get('tab'), false) ?? 'checklist',
  )
  const [selectedMember, setSelectedMember] = useState<string|null>(null)
  const [assignSuccess, setAssignSuccess] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [memberToAdd, setMemberToAdd] = useState('')
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [showKBLink, setShowKBLink] = useState(false)
  const [selectedKB, setSelectedKB] = useState('')
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('normal')
  const [newTaskPurchaseRequest, setNewTaskPurchaseRequest] = useState(false)
  const [newTaskPurchaseLink, setNewTaskPurchaseLink] = useState('')
  const [newTaskHideFromSignage, setNewTaskHideFromSignage] = useState(false)
  const [teamNotes, setTeamNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [delivCount, setDelivCount] = useState(0)
  const [delivNotes, setDelivNotes] = useState('')
  const [savingDeliv, setSavingDeliv] = useState(false)
  const [externalCostUsd, setExternalCostUsd] = useState('')
  const [savingExternalCost, setSavingExternalCost] = useState(false)
  const [cameraPackages, setCameraPackages] = useState<CameraPackageRow[]>([])
  const [recomputingEstCost, setRecomputingEstCost] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [fetchingYt, setFetchingYt] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeChecks, setCompleteChecks] = useState({ deliverables: false, organizer: false, files: false, quality: false })
  const [sendingComplete, setSendingComplete] = useState(false)
  const [clearingCompleteRequested, setClearingCompleteRequested] = useState(false)
  const [showCopySetup, setShowCopySetup] = useState(false)
  const [copyTargetId, setCopyTargetId] = useState('')
  const [allProductions, setAllProductions] = useState<ProdLite[]>([])
  const [emailTemplate, setEmailTemplate] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [schools, setSchools] = useState<SchoolBrand[]>([])
  const [thumbSchoolCode, setThumbSchoolCode] = useState('')
  const [thumbEventName, setThumbEventName] = useState('')
  const [thumbDate, setThumbDate] = useState('')
  const [thumbTime, setThumbTime] = useState('')
  const [thumbSchoolOverride, setThumbSchoolOverride] = useState('')
  const [thumbDetail, setThumbDetail] = useState('')
  const [thumbMascotMode, setThumbMascotMode] = useState<(typeof THUMB_MASCOT_MODES)[number]>('unknown')
  const [thumbEventType, setThumbEventType] = useState<(typeof THUMB_EVENT_TYPES)[number]>('recognition')
  const [thumbTone, setThumbTone] = useState<(typeof THUMB_TONES)[number]>('dignified-ceremonial')
  const [thumbEventDescription, setThumbEventDescription] = useState('')
  const [thumbLogistics, setThumbLogistics] = useState('')
  const [thumbConceptAnchor, setThumbConceptAnchor] = useState('')
  const [thumbPrompt, setThumbPrompt] = useState('')
  const [thumbSvgInput, setThumbSvgInput] = useState('')
  const [thumbSanitizedSvg, setThumbSanitizedSvg] = useState('')
  const [thumbSvgError, setThumbSvgError] = useState<string | null>(null)
  const [thumbCopied, setThumbCopied] = useState(false)
  const [thumbDraftRestored, setThumbDraftRestored] = useState(false)
  const [thumbDraftSavedAt, setThumbDraftSavedAt] = useState<number | null>(null)

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Fetch by production_number (the clean URL param)
    const prodRes = await supabase
      .from('productions')
      .select('*')
      .eq('production_number', Number(productionNum))
      .single()

    if (!prodRes.data) { setLoading(false); return }

    const prodUUID = prodRes.data.id

    const meRow = await resolveEffectiveTeamRow<{ id: string; role: string }>(supabase, 'id, role')
    if (meRow && isStudentInternRole(meRow.role)) {
      const { data: memRow } = await supabase
        .from('production_members')
        .select('id')
        .eq('production_id', prodUUID)
        .eq('user_id', meRow.id)
        .maybeSingle()
      if (!memRow) {
        setLoading(false)
        router.replace('/dashboard/productions')
        return
      }
    }
    setProduction(normalizeProductionDatetimeFields(prodRes.data as Production))
    setUuid(prodUUID)
    setTeamNotes(prodRes.data.team_notes || '')
    setDelivCount(prodRes.data.deliverables_count || 0)
    setDelivNotes(prodRes.data.deliverables_notes || '')
    const rawExt = prodRes.data.estimated_external_cost
    setExternalCostUsd(
      rawExt !== null && rawExt !== undefined && String(rawExt).trim() !== ''
        ? String(Number(rawExt))
        : ''
    )

    // All related queries use the UUID as FK
    const [checkRes, membersRes, teamRes, linksRes, actRes, userRes, kbRes, tplRes, schoolsRes, camPkgRes] = await Promise.all([
      supabase.from('checklist_items').select('*').eq('production_id', prodUUID).order('sort_order'),
      supabase.from('production_members').select('*, team:team(id, name, role, avatar_color)').eq('production_id', prodUUID),
      supabase.from('team').select('id, name, email, role, avatar_color').eq('active', true),
      supabase.from('production_links').select('*').eq('production_id', prodUUID).order('created_at'),
      supabase.from('production_activity').select('*').eq('production_id', prodUUID).order('created_at', { ascending: false }).limit(50),
      resolveEffectiveTeamRow<TeamMember>(supabase, '*'),
      supabase.from('knowledge_base').select('id, title, category').order('title'),
      supabase.from('email_templates').select('*').order('sort_order'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('cost_camera_packages').select('option_id, label, cost').eq('active', true).order('display_order'),
    ])

    setCameraPackages((camPkgRes.data as CameraPackageRow[]) || [])
    setChecklist(checkRes.data || [])
    setMembers(membersRes.data || [])
    setAllTeam(teamRes.data || [])
    setLinks(linksRes.data || [])
    setActivity(actRes.data || [])
    setCurrentUser(userRes)
    setKbArticles(kbRes.data || [])
    setTemplates(tplRes.data || [])
    setSchools((schoolsRes.data as SchoolBrand[]) || [])

    // Resolve the default tab before first paint so we don't flash Checklist
    // and then jump to Info. URL tab wins; otherwise empty checklists open on Info.
    const isBM = prodRes.data.request_type_number === 4
    const urlTabAtLoad = parseProductionTabFromUrl(searchParams.get('tab'), isBM)
    if (!urlTabAtLoad && (checkRes.data?.length ?? 0) === 0) {
      const infoVisible = isProductionTabVisible('info', isBM, userRes?.role, userRes?.dashboard_profile)
      if (infoVisible) setActiveTab('info')
    }
    // Paint now with core data; the heavier, tab-specific data loads in the background.
    setLoading(false)

    const [vidRes, taskRes, sheetRes, allProdsRes] = await Promise.all([
      supabase
        .from('videos')
        .select('id, title, video_type, status, date_published, youtube_url, youtube_id, youtube_views, youtube_likes, youtube_duration, youtube_thumbnail')
        .eq('production_id', prodUUID)
        .order('created_at', { ascending: false }),
      supabase
        .from('tasks')
        .select('id, title, status, priority, assigned_to, due_date')
        .eq('production_id', prodUUID)
        .order('created_at', { ascending: false }),
      supabase.from('call_sheets').select('*').eq('production_id', prodUUID).single(),
      supabase
        .from('productions')
        .select('id, production_number, title')
        .neq('id', prodUUID)
        .order('production_number', { ascending: false })
        .limit(50),
    ])
    setLinkedVideos(vidRes.data || [])
    setLinkedTasks(taskRes.data || [])
    if (sheetRes.data) setCallSheet(sheetRes.data)
    setAllProductions(allProdsRes.data || [])
  }, [supabase, productionNum, router, searchParams])

  useEffect(() => { loadData() }, [loadData])

  const isBoardMeetingProduction = production?.request_type_number === 4

  const setProductionTab = useCallback(
    (tab: ProductionTab) => {
      setActiveTab(tab)
      router.replace(`/dashboard/productions/${productionNum}?tab=${tab}`, { scroll: false })
    },
    [router, productionNum],
  )

  const productionTabVisible = useCallback(
    (tab: ProductionTab) =>
      isProductionTabVisible(
        tab,
        isBoardMeetingProduction,
        currentUser?.role,
        currentUser?.dashboard_profile,
      ),
    [isBoardMeetingProduction, currentUser?.role, currentUser?.dashboard_profile],
  )

  useEffect(() => {
    if (loading || !production) return
    let urlTab = parseProductionTabFromUrl(searchParams.get('tab'), isBoardMeetingProduction)
    if (urlTab && !productionTabVisible(urlTab)) urlTab = null
    if (urlTab) {
      setActiveTab(urlTab)
      return
    }
    if (checklist.length === 0 && productionTabVisible('info')) setActiveTab('info')
  }, [loading, production, searchParams, checklist.length, isBoardMeetingProduction, productionTabVisible])

  useEffect(() => {
    if (!currentUser) return
    if (productionTabVisible(activeTab)) return
    setActiveTab('checklist')
  }, [currentUser, activeTab, productionTabVisible])

  const getTypeLabel = (prod: Production) => prod.request_type_label || prod.type || 'Unknown'

  const formatOutsourcedUsd = (n: number) =>
    `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const cameraOptionIdFromProduction = (raw: string | null | undefined): number | null => {
    if (raw === null || raw === undefined || String(raw).trim() === '') return null
    const n = parseInt(String(raw).trim(), 10)
    return Number.isFinite(n) ? n : null
  }

  const recomputeOneEstimatedCost = useCallback(async () => {
    if (!uuid) return
    setRecomputingEstCost(true)
    const { data, error } = await supabase.rpc('recompute_one_estimated_cost', { production_id: uuid })
    setRecomputingEstCost(false)
    if (error) {
      toast(`Recompute failed: ${error.message}`, 'error')
      return
    }
    const { data: row, error: fetchErr } = await supabase
      .from('productions')
      .select('estimated_external_cost, camera_options')
      .eq('id', uuid)
      .single()
    if (fetchErr || !row) {
      toast('Cost updated but could not refresh row', 'error')
      return
    }
    setProduction(prev =>
      prev ? { ...prev, estimated_external_cost: row.estimated_external_cost, camera_options: row.camera_options } : null
    )
    const rawExt = row.estimated_external_cost
    setExternalCostUsd(
      rawExt !== null && rawExt !== undefined && String(rawExt).trim() !== ''
        ? String(Number(rawExt))
        : ''
    )
    if (data !== null && data !== undefined && Number.isFinite(Number(data))) {
      toast(`Updated to ${formatOutsourcedUsd(Number(data))}`, 'success')
    } else {
      toast('Cost recomputed (using type default)', 'success')
    }
  }, [uuid, supabase])

  const sanitizeSvgMarkup = useCallback((raw: string): string => {
    return raw
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
      .replace(/\s(?:xlink:href|href)\s*=\s*"(?!#)[^"]*"/gi, '')
      .replace(/\s(?:xlink:href|href)\s*=\s*'(?!#)[^']*'/gi, '')
      .replace(/javascript:/gi, '')
      .trim()
  }, [])

  const fmtPromptDate = (value: string): string => {
    if (!value) return ''
    const d = new Date(`${value}T00:00:00`)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const slug = (v: string) => v.replace(/[^a-z0-9]+/gi, '').trim() || 'Event'

  const logActivity = useCallback(async (action: string, detail?: string) => {
    if (!currentUser || !uuid) return
    const { error } = await supabase.from('production_activity').insert({ production_id: uuid, user_id: currentUser.id, action, detail: detail || null })
    if (!error) {
      setActivity(prev => [{ id: Date.now().toString(), production_id: uuid, user_id: currentUser.id, action, detail: detail || null, created_at: new Date().toISOString(), team: { name: currentUser.name } }, ...prev])
    }
  }, [currentUser, uuid, supabase])

  const createTaskForProduction = useCallback(async () => {
    if (!newTaskTitle || !currentUser || !uuid) return
    const assigneeId = newTaskAssignee || currentUser.id
    const { data, error } = await supabase.from('tasks').insert({
      title: newTaskTitle, priority: newTaskPriority,
      assigned_to: assigneeId, due_date: newTaskDue || null,
      purchase_request: newTaskPurchaseRequest,
      purchase_request_link: newTaskPurchaseLink.trim() || null,
      hide_from_signage: newTaskHideFromSignage,
      production_id: uuid, status: 'pending', created_by: currentUser.id,
    }).select('id, title, status, priority, assigned_to, due_date').single()
    if (error) { toast(`Failed to create task: ${error.message}`); return }
    if (data) setLinkedTasks(prev => [data, ...prev])
    // Send email to assignee if assigned to someone else
    if (assigneeId && assigneeId !== currentUser.id && production) {
      const assignee = allTeam.find(m => m.id === assigneeId)
      if (assignee?.email) {
        const { data: { session } } = await supabase.auth.refreshSession()
        if (session) {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
              type: 'task_assigned', recipientEmail: assignee.email, recipientName: assignee.name.split(' ')[0],
              subject: sanitizeEmailSubject(`Task assigned: ${newTaskTitle}`),
              body: `You've been assigned a task on #${production.production_number} ${production.title}:\n\n"${newTaskTitle}"${newTaskDue ? `\nDue: ${new Date(newTaskDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}\nPriority: ${newTaskPriority}`,
              actionUrl: `/dashboard/productions/${production.production_number}`, actionLabel: 'View Production',
            }),
          })
        }
      }
    }
    setNewTaskTitle('')
    setNewTaskAssignee(currentUser.id)
    setNewTaskDue('')
    setNewTaskPriority('normal')
    setNewTaskPurchaseRequest(false)
    setNewTaskPurchaseLink('')
    setNewTaskHideFromSignage(false)
    setShowCreateTask(false)
    await logActivity('Created task', newTaskTitle)
  }, [newTaskTitle, newTaskPriority, newTaskAssignee, newTaskDue, newTaskPurchaseRequest, newTaskPurchaseLink, newTaskHideFromSignage, currentUser, uuid, supabase, logActivity, allTeam, production])

  const initChecklist = useCallback(async () => {
    if (!production || !currentUser || !uuid) return
    const typeLabel = getTypeLabel(production)
    const template = CHECKLIST_TEMPLATES[typeLabel] || CHECKLIST_TEMPLATES['Other, Unsure, Or Consultation']
    const items = template.map((title, i) => ({ production_id: uuid, title, sort_order: i, completed: false }))
    const { data } = await supabase.from('checklist_items').insert(items).select('*')
    if (data) { setChecklist(data); await logActivity('Initialized checklist', `${data.length} steps from ${typeLabel} template`) }
  }, [production, currentUser, uuid, supabase, logActivity])

  const generateCallSheet = useCallback(async () => {
    if (!production || !uuid || !currentUser) return
    setGeneratingSheet(true)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { toast('Session expired', 'error'); setGeneratingSheet(false); return }
      const teamNames = members.map(m => m.team?.name).filter(Boolean)
      const checklistTitles = checklist.map(c => c.title)
      const schoolName = getSchoolName(production.school_department) || production.school_department || ''
      const locationName = getSchoolName(production.filming_location) || production.filming_location || ''
      // Fetch school address
      let schoolAddress = ''
      let schoolPhone = ''
      if (production.school_department) {
        const code = production.school_department.replace(/^0+/, '')
        const { data: schoolData } = await supabase.from('schools').select('address, phone').or(`code.eq.${production.school_department},code.eq.${code}`).limit(1).single()
        if (schoolData) { schoolAddress = schoolData.address || ''; schoolPhone = schoolData.phone || '' }
      }
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-call-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ production: { ...production, id: uuid, team_names: teamNames, checklist_items: checklistTitles, resolved_school: schoolName, resolved_location: locationName, school_address: schoolAddress, school_phone: schoolPhone } }),
      })
      const result = await res.json()
      if (result.success) { setCallSheet(result.call_sheet); setProductionTab('callsheet') }
      else toast(result.error || 'Failed to generate call sheet', 'error')
    } catch { toast('Failed to generate call sheet') }
    setGeneratingSheet(false)
  }, [production, uuid, currentUser, supabase, checklist, members])

  const printCallSheet = () => {
    const el = document.getElementById('call-sheet-print')
    if (!el) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Call Sheet — ${escapeHtml(production?.title)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;padding:24px;font-size:13px;line-height:1.5}
.cs-header{border-bottom:3px solid #1a1a1a;padding-bottom:14px;margin-bottom:16px;display:flex;justify-content:space-between}
.cs-title{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:4px}
.cs-name{font-size:20px;font-weight:700}
.cs-date{font-size:20px;font-weight:500;color:#c0392b;text-align:right}
.cs-day{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px}
.cs-bar{display:flex;border:1px solid #e0e0e0;border-radius:4px;margin-bottom:16px;font-size:12px}
.cs-bar-item{flex:1;padding:8px 12px;border-right:1px solid #e0e0e0}
.cs-bar-item:last-child{border-right:none}
.cs-bar-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;margin-bottom:2px}
.cs-bar-val{font-weight:600}
.cs-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.cs-card{border:1px solid #e0e0e0;border-radius:4px;padding:12px 14px}
.cs-card-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#6b7280;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #f3f4f6}
.cs-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
.cs-row+.cs-row{border-top:1px dotted #e0e0e0}
.cs-label{color:#6b7280;font-weight:500}
.cs-val{font-weight:600;text-align:right}
.cs-notes{background:#eff6ff;border-left:3px solid #1e3a5f;padding:12px 14px;border-radius:0 4px 4px 0;margin-bottom:14px}
.cs-notes h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;margin-bottom:6px}
.cs-notes li{padding:3px 0;padding-left:16px;position:relative;list-style:none}
.cs-notes li::before{content:'—';position:absolute;left:0;color:#1e3a5f;font-weight:700}
.cs-contact{display:flex;justify-content:space-between;padding-top:14px;border-top:2px solid #1a1a1a;font-size:12px}
.cs-footer{margin-top:16px;padding-top:10px;border-top:1px solid #e0e0e0;display:flex;justify-content:space-between;font-size:10px;color:#6b7280}
.cs-check{display:flex;align-items:center;gap:6px;padding:3px 0}.cs-check input{width:14px;height:14px}
@media print{body{padding:16px}}
</style></head><body></body></html>`)
    w.document.close()
    w.document.body.appendChild(el.cloneNode(true))
    setTimeout(() => w.print(), 300)
  }

  const emailCallSheet = useCallback(async () => {
    if (!production || !callSheet) return
    const teamEmails = members.map(m => allTeam.find(t => t.id === m.user_id)?.email).filter(Boolean) as string[]
    if (teamEmails.length === 0) { toast('No team members assigned to email'); return }
    if (!(await confirmDialog({ message: `Email call sheet to ${teamEmails.join(', ')}?`, confirmLabel: 'Send' }))) return
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) return
      const cs = callSheet
      const p = production
      const d = p.start_datetime ? new Date(p.start_datetime) : null
      const dateStr = d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'
      const timeStr = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'TBD'
      const venue = getSchoolName(p.filming_location) || getSchoolName(p.school_department) || p.filming_location || 'TBD'
      const address = cs.content?.production_snapshot?.school_address || ''
      const timelineHtml = (cs.schedule || []).map((t: any) => `<tr><td style="padding:6px 12px;color:#6b7280;font-weight:500;white-space:nowrap">${escapeHtml(t.time)}</td><td style="padding:6px 12px;font-weight:600">${escapeHtml(t.activity)}</td></tr>`).join('')
      const equipHtml = (cs.equipment || []).map((e: any) => `<tr><td style="padding:4px 12px">☐ ${escapeHtml(e.item)}</td></tr>`).join('')
      const notesHtml = (cs.producer_notes || []).map((n: string) => `<li style="padding:3px 0">${escapeHtml(n)}</li>`).join('')
      const crewHtml = (cs.crew || []).map((c: any) => `<tr><td style="padding:4px 12px;color:#6b7280">${escapeHtml(c.role)}</td><td style="padding:4px 12px;font-weight:600;text-align:right">${c.name ? escapeHtml(c.name) : '<em style="color:#9ca3af">Unassigned</em>'}</td></tr>`).join('')

      const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
        <div style="border-bottom:3px solid #1a1a1a;padding-bottom:14px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:4px">CSDtv Call Sheet</div>
          <div style="font-size:22px;font-weight:700">#${escapeHtml(p.production_number)} ${escapeHtml(p.title)}</div>
        </div>
        <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;margin-bottom:16px;font-size:13px">
          <tr>
            <td style="padding:10px 14px;border-right:1px solid #e0e0e0;background:#f9fafb"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280">Date</div><div style="font-weight:600">${escapeHtml(dateStr)}</div></td>
            <td style="padding:10px 14px;border-right:1px solid #e0e0e0;background:#f9fafb"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280">Time</div><div style="font-weight:600">${escapeHtml(timeStr)}</div></td>
            <td style="padding:10px 14px;background:#f9fafb"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280">Type</div><div style="font-weight:600">${escapeHtml(p.request_type_label || 'Production')}</div></td>
          </tr>
        </table>
        <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;margin-bottom:16px;font-size:13px">
          <tr><td style="padding:10px 14px" colspan="2"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:4px">Location</div><div style="font-weight:600;font-size:15px">${escapeHtml(venue)}</div>${address ? `<div style="color:#6b7280;margin-top:2px">${escapeHtml(address)}</div>` : ''}${address ? `<div style="margin-top:6px"><a href="https://maps.google.com/?q=${encodeURIComponent(address)}" style="color:#1e6cb5;text-decoration:none;font-size:12px">📍 Open in Google Maps</a></div>` : ''}</td></tr>
        </table>
        <table style="width:100%;margin-bottom:16px"><tr><td style="vertical-align:top;width:50%;padding-right:8px">
          <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;font-size:13px">
            <tr><td colspan="2" style="padding:8px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:1px solid #f3f4f6">Timeline</td></tr>
            ${timelineHtml}
          </table>
        </td><td style="vertical-align:top;width:50%;padding-left:8px">
          <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:8px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:1px solid #f3f4f6">Equipment</td></tr>
            ${equipHtml}
          </table>
        </td></tr></table>
        <table style="width:100%;border:1px solid #e0e0e0;border-radius:4px;border-collapse:collapse;font-size:13px;margin-bottom:16px">
          <tr><td colspan="2" style="padding:8px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:1px solid #f3f4f6">Crew</td></tr>
          ${crewHtml}
        </table>
        ${notesHtml ? `<div style="background:#eff6ff;border-left:3px solid #1e3a5f;padding:12px 16px;border-radius:0 4px 4px 0;margin-bottom:16px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;margin-bottom:6px">Producer Notes</div>
          <ul style="list-style:none;padding:0;margin:0;font-size:13px">${notesHtml}</ul>
        </div>` : ''}
        ${cs.parking_access ? `<div style="background:#f9fafb;padding:10px 14px;border-radius:4px;margin-bottom:16px;font-size:13px">🅿️ <strong>Parking:</strong> ${escapeHtml(cs.parking_access)}</div>` : ''}
        <div style="border-top:2px solid #1a1a1a;padding-top:12px;font-size:12px;display:flex;justify-content:space-between">
          <div><strong>Organizer:</strong> ${escapeHtml(p.organizer_name || 'N/A')} · <span style="color:#6b7280">${escapeHtml(p.organizer_email || '')}</span></div>
        </div>
        <div style="margin-top:16px;padding-top:10px;border-top:1px solid #e0e0e0;font-size:10px;color:#9ca3af">CSDtv Production Services · Canyons School District</div>
      </div>`

      for (const email of teamEmails) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            type: 'call_sheet',
            recipientEmail: email,
            subject: sanitizeEmailSubject(`Call Sheet: #${p.production_number} ${p.title} — ${dateStr}`),
            body: '',
            html,
          }),
        })
      }
      toast('Call sheet emailed to crew!')
    } catch { toast('Failed to email call sheet') }
  }, [production, callSheet, supabase, members, allTeam])

  const toggleItem = useCallback(async (item: ChecklistItem) => {
    const updates = { completed: !item.completed, completed_at: !item.completed ? new Date().toISOString() : null }
    await supabase.from('checklist_items').update(updates).eq('id', item.id)
    setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, ...updates } : c))
    await logActivity(!item.completed ? 'Completed step' : 'Uncompleted step', item.title)
  }, [supabase, logActivity])

  const moveItem = useCallback(async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= checklist.length) return
    const a = checklist[index]
    const b = checklist[swapIdx]
    await Promise.all([
      supabase.from('checklist_items').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('checklist_items').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    setChecklist(prev => {
      const next = [...prev]
      next[index] = { ...b, sort_order: a.sort_order }
      next[swapIdx] = { ...a, sort_order: b.sort_order }
      return next.sort((x, y) => x.sort_order - y.sort_order)
    })
  }, [supabase, checklist])

  const massAssign = useCallback(async () => {
    if (!selectedMember || !uuid) return
    await supabase.from('checklist_items').update({ assigned_to: selectedMember }).eq('production_id', uuid)
    const member = allTeam.find(m => m.id === selectedMember)
    setChecklist(prev => prev.map(c => ({ ...c, assigned_to: selectedMember })))
    setSelectedMember(null)
    setAssignSuccess(true)
    setTimeout(() => setAssignSuccess(false), 2500)
    await logActivity('Mass assigned checklist', `All steps assigned to ${member?.name}`)
  }, [selectedMember, uuid, supabase, allTeam, logActivity])

  const addMember = useCallback(async () => {
    if (!memberToAdd || !uuid) return
    const existing = members.find(m => m.user_id === memberToAdd)
    if (existing) { setMemberToAdd(''); return }
    const { data } = await supabase.from('production_members').insert({ production_id: uuid, user_id: memberToAdd }).select('*, team:team(id, name, role, avatar_color, email)').single()
    if (data) {
      setMembers(prev => [...prev, data])
      const member = allTeam.find(m => m.id === memberToAdd)
      await logActivity('Added team member', member?.name)

      // Send email notification to the added member
      if (member?.email && production) {
        const { data: { session } } = await supabase.auth.refreshSession()
        if (session) {
          const d = production.start_datetime ? new Date(production.start_datetime) : null
          const dateStr = d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'
          const timeStr = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
          const venue = getSchoolName(production.filming_location) || getSchoolName(production.school_department) || production.filming_location || 'TBD'
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
              type: 'production_assignment',
              recipientEmail: member.email,
              recipientName: member.name.split(' ')[0],
              subject: sanitizeEmailSubject(`You've been added to #${production.production_number} ${production.title}`),
              body: `You've been assigned to production #${production.production_number} — ${production.title}.\n\nDate: ${dateStr}${timeStr ? ` at ${timeStr}` : ''}\nLocation: ${venue}\nType: ${production.request_type_label || 'Production'}\n\nView the production details and checklist in the Team Hub.`,
              actionUrl: `/dashboard/productions/${production.production_number}`,
              actionLabel: 'View Production',
            }),
          })
        }
      }
    }
    setMemberToAdd('')
    setAddingMember(false)
  }, [memberToAdd, members, uuid, supabase, allTeam, logActivity, production])

  const removeMember = useCallback(async (memberId: string, memberName: string) => {
    if (!uuid) return
    await supabase.from('production_members').delete().eq('production_id', uuid).eq('user_id', memberId)
    setMembers(prev => prev.filter(m => m.user_id !== memberId))
    await logActivity('Removed team member', memberName)
  }, [uuid, supabase, logActivity])

  // ─── Email templates ─────────────────────────────────────────────────────
  // Templates are loaded from email_templates table via loadData.
  // Variable substitution supports: {{name}}, {{title}}, {{type}}, {{date}},
  // {{date_short}}, {{venue}}, {{youtube_link}}, {{status}}.
  // {{youtube_link}} uses only the URL synced onto the production from the district system (e.g. livestream_url).
  // We do not use Team Hub–linked videos or any YouTube API for this.
  const getSyncedYoutubeLink = useCallback((): string => {
    if (!production) return ''
    return (production.livestream_url?.trim() || '').trim()
  }, [production])

  const substituteVariables = useCallback((str: string): string => {
    if (!production) return str
    const name = production.organizer_name?.split(' ')[0] || 'there'
    const title = production.title
    const type = production.request_type_label || production.type || 'production'
    const date = production.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD'
    const dateShort = production.start_datetime ? new Date(production.start_datetime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'
    const venue = production.event_location || getSchoolName(production.filming_location) || 'TBD'
    const status = production.status || ''
    const ytLink = getSyncedYoutubeLink()
    return str
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{title\}\}/g, title)
      .replace(/\{\{type\}\}/g, type)
      .replace(/\{\{date_short\}\}/g, dateShort)
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{venue\}\}/g, venue)
      .replace(/\{\{youtube_link\}\}/g, ytLink)
      .replace(/\{\{status\}\}/g, status)
  }, [production, getSyncedYoutubeLink, uuid])

  useEffect(() => {
    if (!emailTemplate || !production) return
    const t = templates.find(x => x.id === emailTemplate)
    if (!t) return
    setEmailBody(substituteVariables(t.body))
    setEmailSubject(sanitizeEmailSubject(substituteVariables(t.subject)))
  }, [production?.livestream_url, emailTemplate, production, templates, substituteVariables])

  const selectTemplate = (templateId: string) => {
    const t = templates.find(x => x.id === templateId)
    if (!t) return
    if (templateUsesYoutubeLink(t) && !getSyncedYoutubeLink()) {
      toast('This production does not have a video/livestream link from sync yet. Sync from the productions site first, or pick another template.', 'error')
      return
    }
    setEmailTemplate(templateId)
    setEmailBody(substituteVariables(t.body))
    setEmailSubject(sanitizeEmailSubject(substituteVariables(t.subject)))
  }

  const copySetupTo = useCallback(async () => {
    if (!copyTargetId || !uuid || !currentUser) return
    // Copy checklist items
    const items = checklist.map((c, i) => ({ production_id: copyTargetId, title: c.title, completed: false, sort_order: i }))
    if (items.length > 0) await supabase.from('checklist_items').insert(items)
    // Copy team members
    const memberInserts = members.map(m => ({ production_id: copyTargetId, user_id: m.user_id }))
    if (memberInserts.length > 0) await supabase.from('production_members').insert(memberInserts)
    // Log activity
    await supabase.from('production_activity').insert({ production_id: copyTargetId, user_id: currentUser.id, action: 'setup_copied', detail: `Copied from #${production?.production_number || ''}` })
    setShowCopySetup(false)
    setCopyTargetId('')
    toast('Setup copied!', 'success')
  }, [copyTargetId, uuid, currentUser, checklist, members, supabase, production])

  const markProductionComplete = useCallback(async () => {
    if (!production || !currentUser || !uuid) return
    setSendingComplete(true)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session?.access_token) { setSendingComplete(false); return }
      const wire = {
        id: production.id,
        production_number: production.production_number,
        title: production.title,
        request_type_label: production.request_type_label,
        type: production.type,
        organizer_name: production.organizer_name,
        start_datetime: production.start_datetime,
      }
      const r = await hubRequestProductionComplete({
        supabase,
        accessToken: session.access_token,
        production: wire,
        currentUserEmail: currentUser.email,
        currentUserId: currentUser.id,
      })
      if (!r.ok) {
        toast(r.message, 'error')
        setSendingComplete(false)
        return
      }
      setProduction(prev => prev ? { ...prev, status: 'Complete Requested' } : prev)
      setActivity(prev => [{ id: Date.now().toString(), production_id: uuid, user_id: currentUser.id, action: 'requested_complete', detail: 'Requested completion — email sent to admin', created_at: new Date().toISOString(), team: { name: currentUser.name } }, ...prev])
      toast('Complete request sent', 'success')
    } catch {
      toast('Failed to send completion request', 'error')
    }
    setSendingComplete(false)
    setShowCompleteModal(false)
    setCompleteChecks({ deliverables: false, organizer: false, files: false, quality: false })
  }, [production, currentUser, uuid, supabase])

  const requestInProgress = useCallback(async () => {
    if (!production || !currentUser || !uuid) return
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session?.access_token) return
      const wire = {
        id: production.id,
        production_number: production.production_number,
        title: production.title,
        request_type_label: production.request_type_label,
        type: production.type,
        organizer_name: production.organizer_name,
        start_datetime: production.start_datetime,
      }
      const r = await hubRequestProductionInProgress({
        supabase,
        accessToken: session.access_token,
        production: wire,
        currentUserEmail: currentUser.email,
        currentUserId: currentUser.id,
      })
      if (!r.ok) {
        toast(r.message, 'error')
        return
      }
      setProduction(prev => prev ? { ...prev, status: 'In Progress' } : prev)
      setActivity(prev => [{ id: Date.now().toString(), production_id: uuid, user_id: currentUser.id, action: 'requested_in_progress', detail: 'Marked In Progress in Team Hub — email sent to admin', created_at: new Date().toISOString(), team: { name: currentUser.name } }, ...prev])
      toast('In Progress request sent', 'success')
    } catch { toast('Failed to send request', 'error') }
  }, [production, currentUser, uuid, supabase])

  const clearCompleteRequested = useCallback(async () => {
    if (!production || !currentUser || !uuid) return
    setClearingCompleteRequested(true)
    try {
      const { error } = await supabase.from('productions').update({ status: 'In Progress' }).eq('id', uuid)
      if (error) {
        toast(`Failed to clear Complete Requested: ${error.message}`, 'error')
        return
      }
      setProduction(prev => prev ? { ...prev, status: 'In Progress' } : prev)
      await supabase.from('production_activity').insert({
        production_id: uuid,
        user_id: currentUser.id,
        action: 'requested_in_progress',
        detail: 'Removed Complete Requested and returned to In Progress',
      })
      setActivity(prev => [{
        id: Date.now().toString(),
        production_id: uuid,
        user_id: currentUser.id,
        action: 'requested_in_progress',
        detail: 'Removed Complete Requested and returned to In Progress',
        created_at: new Date().toISOString(),
        team: { name: currentUser.name },
      }, ...prev])
      toast('Complete Requested removed', 'success')
    } finally {
      setClearingCompleteRequested(false)
    }
  }, [production, currentUser, uuid, supabase])

  // Open organizer email in user's default mail client (Outlook) via mailto.
  // This replaces the previous send-via-Resend approach so the user can review
  // and edit before sending. Activity is logged when the button is clicked.
  const openOrganizerEmail = useCallback(async () => {
    if (!production?.organizer_email || !emailBody) return
    const tpl = templates.find(t => t.id === emailTemplate)
    if (templateUsesYoutubeLink(tpl) && !getSyncedYoutubeLink()) {
      toast('No synced video/livestream link on this production yet. Run sync from the productions site before sending this template.', 'error')
      return
    }
    const tplLabel = tpl?.label
    await logActivity('Emailed organizer', tplLabel ? `Template: ${tplLabel}` : 'Custom message')
    if (templateUsesYoutubeLink(tpl) && getSyncedYoutubeLink() && uuid) {
      try {
        const res = await fetch('/api/productions/youtube-link-email-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ productionId: uuid }),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok && body.sentAt) {
          setProduction(prev => prev ? { ...prev, youtube_link_email_sent_at: body.sentAt } : null)
          await logActivity('YouTube link email', 'Logged send (mail client opened with tracked link)')
        } else {
          const fallbackAt = new Date().toISOString()
          const { error } = await supabase.from('productions').update({ youtube_link_email_sent_at: fallbackAt }).eq('id', uuid)
          if (!error) {
            setProduction(prev => prev ? { ...prev, youtube_link_email_sent_at: fallbackAt } : null)
            await logActivity('YouTube link email', 'Logged send (mail client opened with tracked link)')
          } else {
            toast('Could not save link-email timestamp on the production. The Live email filter uses Activity until fixed.', 'error')
          }
        }
      } catch {
        toast('Could not record link-email timestamp. Try again.', 'error')
      }
    }
    const mailto = `mailto:${production.organizer_email}?subject=${encodeURIComponent(sanitizeEmailSubject(emailSubject))}&body=${encodeURIComponent(emailBody)}`
    window.location.href = mailto
    setTimeout(() => { setShowEmailModal(false); setEmailTemplate(''); setEmailBody(''); setEmailSubject('') }, 500)
  }, [production, emailBody, emailSubject, emailTemplate, templates, logActivity, getSyncedYoutubeLink, uuid, supabase])

  // ─── Team notes ──────────────────────────────────────────────────────────
  const saveTeamNotes = useCallback(async () => {
    if (!uuid) return
    setSavingNotes(true)
    const { error } = await supabase.from('productions').update({ team_notes: teamNotes }).eq('id', uuid)
    setSavingNotes(false)
    if (error) { toast('Failed to save notes', 'error'); return }
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 3000)
  }, [uuid, teamNotes, supabase])

  const saveVideosProduced = useCallback(async () => {
    if (!uuid) return
    setSavingDeliv(true)
    const { error } = await supabase.from('productions').update({ deliverables_count: delivCount, deliverables_notes: delivNotes || null }).eq('id', uuid)
    setSavingDeliv(false)
    if (error) { toast('Failed to save videos produced', 'error'); return }
    toast('Videos Produced saved', 'success')
    await logActivity('Updated videos produced', `${delivCount} items${delivNotes ? ' — ' + delivNotes : ''}`)
  }, [uuid, delivCount, delivNotes, supabase, logActivity])

  const persistExternalCostFromInput = useCallback(async (rawInput: string) => {
    if (!uuid) return
    const trimmed = rawInput.trim()
    let value: number | null = null
    if (trimmed !== '') {
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) {
        toast('Enter a valid dollar amount (0 or more), or clear the field.', 'error')
        return
      }
      value = Math.round(n * 100) / 100
    }
    setSavingExternalCost(true)
    const { error } = await supabase.from('productions').update({ estimated_external_cost: value }).eq('id', uuid)
    setSavingExternalCost(false)
    if (error) { toast('Failed to save estimated cost', 'error'); return }
    setProduction(prev => (prev ? { ...prev, estimated_external_cost: value } : null))
    if (value === null) setExternalCostUsd('')
    else setExternalCostUsd(String(value))
    toast(value === null ? 'Using type default for Reports' : 'Estimated external cost saved', 'success')
    await logActivity(
      'Updated estimated external cost',
      value === null ? 'Cleared override (Reports use request-type default)' : `$${value.toLocaleString()}`
    )
  }, [uuid, supabase, logActivity])

  const refreshYoutubeStats = useCallback(async (videoId: string, ytId: string) => {
    try {
      const res = await fetch(`/api/youtube?url=${encodeURIComponent(ytId)}`)
      if (!res.ok) { toast('Failed to refresh stats', 'error'); return }
      const yt = await res.json()
      const { error } = await supabase.from('videos').update({ youtube_views: yt.views, youtube_likes: yt.likes, youtube_synced_at: new Date().toISOString() }).eq('id', videoId)
      if (error) { toast('Failed to save refreshed stats', 'error'); return }
      setLinkedVideos(prev => prev.map(v => v.id === videoId ? { ...v, youtube_views: yt.views, youtube_likes: yt.likes } : v))
      toast(`Updated: ${yt.views.toLocaleString()} views`, 'success')
    } catch { toast('Refresh failed', 'error') }
  }, [supabase])

  const linkYoutubeVideo = useCallback(async () => {
    if (!youtubeUrl || !uuid || !currentUser || !production) return
    setFetchingYt(true)
    try {
      const res = await fetch(`/api/youtube?url=${encodeURIComponent(youtubeUrl)}`)
      if (!res.ok) { const e = await res.json(); toast(e.error || 'Failed to fetch video', 'error'); setFetchingYt(false); return }
      const yt = await res.json()
      // Create video entry linked to this production
      const { data, error } = await supabase.from('videos').insert({
        title: yt.title, video_type: production.request_type_label || 'Video', status: 'Published',
        date_published: yt.local_date || (yt.published_at ? new Date(yt.published_at).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) : null),
        description: yt.description?.slice(0, 500) || null,
        production_id: uuid, created_by: currentUser.id,
        youtube_url: youtubeUrl, youtube_id: yt.youtube_id,
        youtube_views: yt.views, youtube_likes: yt.likes,
        youtube_duration: yt.duration, youtube_thumbnail: yt.thumbnail,
        youtube_synced_at: new Date().toISOString(),
      }).select().single()
      if (error) { toast('Failed to create video entry: ' + error.message, 'error') }
      else {
        toast(`Linked "${yt.title}" — ${yt.views.toLocaleString()} views`, 'success')
        setYoutubeUrl('')
        await logActivity('Linked YouTube video', yt.title)
        // Reload linked videos
        const { data: refreshed } = await supabase.from('videos').select('id, title, video_type, status, date_published, youtube_url, youtube_id, youtube_views, youtube_likes, youtube_duration, youtube_thumbnail').eq('production_id', uuid).order('created_at', { ascending: false })
        if (refreshed) setLinkedVideos(refreshed)
      }
    } catch { toast('Failed to connect to YouTube', 'error') }
    setFetchingYt(false)
  }, [youtubeUrl, uuid, currentUser, production, supabase, logActivity])

  const addLink = useCallback(async () => {
    if (!newLinkTitle || !newLinkUrl || !currentUser || !uuid) return
    const url = newLinkUrl.startsWith('http') ? newLinkUrl : `https://${newLinkUrl}`
    const { data, error } = await supabase.from('production_links').insert({ production_id: uuid, title: newLinkTitle, url, added_by: currentUser.id }).select().single()
    if (error) { toast('Failed to add link', 'error'); return }
    if (data) { setLinks(prev => [...prev, data]); setNewLinkTitle(''); setNewLinkUrl(''); setShowLinkForm(false) }
  }, [newLinkTitle, newLinkUrl, currentUser, uuid, supabase])

  const addKBLink = useCallback(async () => {
    if (!selectedKB || !uuid) return
    const article = kbArticles.find(a => a.id === selectedKB)
    if (!article) return
    const url = `${window.location.origin}/dashboard/library?tab=articles&article=${selectedKB}`
    const { data, error } = await supabase.from('production_links').insert({ production_id: uuid, title: `KB: ${article.title}`, url, added_by: currentUser?.id }).select().single()
    if (error) { toast('Failed to add KB link', 'error'); return }
    if (data) { setLinks(prev => [...prev, data]); setSelectedKB(''); setShowKBLink(false) }
  }, [selectedKB, kbArticles, uuid, supabase, currentUser])

  const completedCount = checklist.filter(c => c.completed).length
  const progress = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0

  const inputStyle: CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px',
    padding: '8px 12px', fontSize: '13px', color: text, fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: '40px',
  }

  const infoTone = statusTone.info.color
  const warningTone = statusTone.warning.color
  const successTone = statusTone.success.color
  const dangerTone = statusTone.danger.color
  const hasCompleteRequestedActivity = useMemo(
    () => activity.some(a => a.action === 'requested_complete'),
    [activity]
  )
  const effectiveProdStatus = production && production.status !== 'Complete' && production.status !== 'Abandoned' && hasCompleteRequestedActivity
    ? 'Complete Requested'
    : production?.status || null
  const brandTone = 'var(--brand-primary)'

  const tabBtn = (tab: ProductionTab, label: string, count?: number) => (
    <button key={tab} onClick={() => setProductionTab(tab)} style={{
      fontSize: '13px', padding: '10px 14px', border: 'none', background: 'transparent',
      cursor: 'pointer', fontFamily: 'inherit',
      color: activeTab === tab ? infoTone : muted,
      borderBottom: activeTab === tab ? `2px solid ${brandTone}` : '2px solid transparent',
      fontWeight: activeTab === tab ? 500 : 400, whiteSpace: 'nowrap' as const,
    }}>
      {label}{count !== undefined && count > 0 ? ` (${count})` : ''}
    </button>
  )

  const formatDateTime = (d: string | null) => {
    if (!d) return null
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const formatRawCreatedOn = (value: string | null) => {
    if (!value) return null
    const normalized = value.includes('T') ? value : value.replace(' ', 'T')
    const parsed = new Date(normalized)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  useEffect(() => {
    if (thumbDraftRestored) return
    if (!production) return
    const eventDate = production.start_datetime ? new Date(production.start_datetime) : null
    const dateVal = eventDate ? `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}` : ''
    const timeVal = eventDate ? eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
    const dept = (production.school_department ?? '').toString().trim()
    const paddedDept = dept.padStart(3, '0')
    const shortLabel = getSchoolName(dept) || dept || ''
    const matchingSchool =
      schools.find(s => schoolCodesMatch(s.code, dept) || schoolCodesMatch(s.code, paddedDept)) ||
      schools.find(s => s.name === shortLabel || s.name === dept) ||
      null
    const pickedFromDept = resolveSchoolFromPicker(schools, matchingSchool?.code || dept)
    const canonicalSchoolName =
      matchingSchool?.name || pickedFromDept?.name || shortLabel || dept || 'Canyons School District'
    const thumbKey = matchingSchool?.id || pickedFromDept?.id || 'district'

    setThumbSchoolCode(thumbKey === '' ? 'district' : thumbKey)
    setThumbSchoolOverride(canonicalSchoolName)
    setThumbEventName(production.title || getTypeLabel(production))
    setThumbDate(dateVal)
    setThumbTime(timeVal)
    setThumbDetail(production.request_type_label || production.type || '')
    setThumbEventDescription(production.additional_notes || '')
    setThumbLogistics('')
    setThumbConceptAnchor('stacked typography hero left, concept-relevant graphic accent right')
    const typeLabel = (production.request_type_label || production.type || '').toLowerCase()
    if (typeLabel.includes('board') || typeLabel.includes('meeting') || typeLabel.includes('panel')) {
      setThumbEventType('panel')
      setThumbTone('refined-academic')
    } else if (typeLabel.includes('concert') || typeLabel.includes('choir') || typeLabel.includes('band')) {
      setThumbEventType('concert')
      setThumbTone('bright-celebratory')
    } else if (typeLabel.includes('graduat') || typeLabel.includes('portrait')) {
      setThumbEventType('recognition')
      setThumbTone('dignified-ceremonial')
    } else if (typeLabel.includes('sport') || typeLabel.includes('championship')) {
      setThumbEventType('sports')
      setThumbTone('bold-energetic')
    } else {
      setThumbEventType('recognition')
      setThumbTone('warm-community')
    }
    const hasMascot = Boolean(matchingSchool?.mascot || pickedFromDept?.mascot)
    setThumbMascotMode(hasMascot ? 'name' : 'none-applicable')
  }, [production, schools, thumbDraftRestored])

  // Picker options use `schools.id`. Legacy localStorage drafts may store code or name — normalize once a row is found.
  useEffect(() => {
    if (thumbSchoolCode === 'district' || !schools.length) return
    if (schools.some(s => s.id === thumbSchoolCode)) return
    const r = resolveSchoolFromPicker(schools, thumbSchoolCode)
    if (r?.id) setThumbSchoolCode(r.id)
  }, [schools, thumbSchoolCode])

  const selectedThumbSchool = useMemo((): SchoolBrand | null => {
    if (thumbSchoolCode === 'district') {
      return {
        id: 'district',
        code: 'district',
        name: 'Canyons School District',
        short_name: 'Canyons',
        mascot: '',
        primary_color: '#003087',
        secondary_color: '#e8a020',
        accent_color: '#ffffff',
      }
    }
    return (() => {
      const resolved = resolveSchoolFromPicker(schools, thumbSchoolCode)
      if (!resolved?.name) return null
      return {
        id: resolved.id || '',
        code: resolved.code,
        name: resolved.name,
        short_name: resolved.short_name || resolved.name.split(/\s+/)[0] || resolved.name,
        mascot: resolved.mascot || '',
        primary_color: resolved.primary_color,
        secondary_color: resolved.secondary_color,
        accent_color: resolved.accent_color,
        text_color: resolved.text_color,
        link_url: resolved.link_url,
        city: resolved.city,
        type: resolved.type,
        active: resolved.active,
      } as SchoolBrand
    })()
  }, [thumbSchoolCode, schools])

  const selectedThumbBrand = useMemo(() => {
    if (thumbSchoolCode === 'district') {
      return {
        name: 'Canyons School District',
        short_name: 'Canyons',
        mascot: '',
        primary_color: '#003087',
        secondary_color: '#e8a020',
        accent_color: '#ffffff',
      }
    }
    const row = selectedThumbSchool && selectedThumbSchool.code !== 'district' ? selectedThumbSchool : null
    const hex = row ? promptBrandHexesFromRow(row) : NEUTRAL_BRAND_HEX

    return {
      name: (thumbSchoolOverride || '').trim() || row?.name || 'Canyons School District',
      short_name: row?.short_name || row?.name || 'Canyons',
      mascot: row?.mascot || '',
      primary_color: hex.primary,
      secondary_color: hex.secondary,
      accent_color: hex.accent,
    }
  }, [thumbSchoolCode, thumbSchoolOverride, selectedThumbSchool])

  useEffect(() => {
    if (!thumbSchoolOverride && selectedThumbSchool?.name) {
      setThumbSchoolOverride(selectedThumbSchool.name)
    }
  }, [selectedThumbSchool, thumbSchoolOverride])

  useEffect(() => {
    if (!productionNum || typeof window === 'undefined') return
    const key = `thumbnail-draft:${productionNum}`
    try {
      // Best-effort cleanup for stale draft keys.
      const now = Date.now()
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const storageKey = window.localStorage.key(i)
        if (!storageKey || !storageKey.startsWith('thumbnail-draft:')) continue
        const rawItem = window.localStorage.getItem(storageKey)
        if (!rawItem) continue
        const parsed = JSON.parse(rawItem) as Partial<ThumbnailDraft>
        if (!parsed.savedAt || now - parsed.savedAt > THUMB_DRAFT_TTL_MS) {
          window.localStorage.removeItem(storageKey)
        }
      }
      const raw = window.localStorage.getItem(key)
      if (!raw) return
      const draft = JSON.parse(raw) as ThumbnailDraft
      if (!draft.savedAt || Date.now() - draft.savedAt > THUMB_DRAFT_TTL_MS) {
        window.localStorage.removeItem(key)
        return
      }
      setThumbSchoolCode(draft.schoolCode || 'district')
      setThumbEventName(draft.eventName || '')
      setThumbDate(draft.date || '')
      setThumbTime(draft.time || '')
      setThumbSchoolOverride(draft.schoolOverride || '')
      setThumbDetail(draft.detail || '')
      setThumbMascotMode(draft.mascotMode || 'unknown')
      setThumbEventType(draft.eventType || 'recognition')
      setThumbTone(draft.tone || 'dignified-ceremonial')
      setThumbEventDescription(draft.eventDescription || '')
      setThumbLogistics(draft.logistics || '')
      setThumbConceptAnchor(draft.conceptAnchor || '')
      setThumbPrompt(draft.prompt || '')
      setThumbSvgInput(draft.svgInput || '')
      setThumbDraftRestored(true)
      setThumbDraftSavedAt(draft.savedAt || null)
    } catch {
      window.localStorage.removeItem(key)
    }
  }, [productionNum])

  const normalizedThumbSchool = (thumbSchoolOverride || selectedThumbBrand.name || '').trim()
  const normalizedThumbEventName = thumbEventName.trim()
  const missingThumbFields = [
    !normalizedThumbSchool ? 'School' : null,
    !normalizedThumbEventName ? 'Event Name' : null,
  ].filter(Boolean) as string[]

  const organizerName = production?.organizer_name || null
  const organizerEmail = production?.organizer_email || null
  const submitterName = production?.submitter_name || null
  const submitterEmail = production?.submitter_email || null
  const isOnBehalf = Boolean(production?.is_on_behalf)
  const showSubmitterCard = isOnBehalf && (submitterName || submitterEmail)

  useEffect(() => {
    if (!productionNum || typeof window === 'undefined') return
    const key = `thumbnail-draft:${productionNum}`
    const payload: ThumbnailDraft = {
      version: THUMB_DRAFT_VERSION,
      savedAt: Date.now(),
      schoolCode: thumbSchoolCode,
      eventName: thumbEventName,
      date: thumbDate,
      time: thumbTime,
      schoolOverride: thumbSchoolOverride,
      detail: thumbDetail,
      mascotMode: thumbMascotMode,
      eventType: thumbEventType,
      tone: thumbTone,
      eventDescription: thumbEventDescription,
      logistics: thumbLogistics,
      conceptAnchor: thumbConceptAnchor,
      prompt: thumbPrompt,
      svgInput: thumbSvgInput,
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(payload))
      setThumbDraftSavedAt(payload.savedAt)
    } catch {
      // Ignore local storage failures (private mode/quota).
    }
  }, [productionNum, thumbSchoolCode, thumbEventName, thumbDate, thumbTime, thumbSchoolOverride, thumbDetail, thumbMascotMode, thumbEventType, thumbTone, thumbEventDescription, thumbLogistics, thumbConceptAnchor, thumbPrompt, thumbSvgInput])

  useEffect(() => {
    const mascotLine = thumbMascotMode === 'none-applicable'
      ? '- mascot: none-applicable'
      : thumbMascotMode === 'unknown'
        ? '- mascot: unknown'
        : `- mascot: ${selectedThumbBrand.mascot || 'unknown'}`

    const lines = [
      'Create one complete, self-contained SVG thumbnail (1280x720). Return ONLY raw <svg>...</svg>.',
      '',
      'INPUTS',
      `- school: ${normalizedThumbSchool || 'School Name'}`,
      mascotLine,
      `- event_name: ${normalizedThumbEventName || 'Event Name'}`,
      `- event_type: ${thumbEventType}`,
      `- date: ${thumbDate ? fmtPromptDate(thumbDate) : 'TBD'}`,
      `- time: ${thumbTime || 'TBD'}`,
      thumbDetail ? `- detail: ${thumbDetail}` : '',
      `- tone: ${thumbTone}`,
      `- event_description: ${thumbEventDescription || 'n/a'}`,
      `- logistics: ${thumbLogistics || 'n/a'}`,
      `- concept_anchor: ${thumbConceptAnchor || 'n/a'}`,
      '',
      'BRAND COLORS',
      `- primary: ${selectedThumbBrand.primary_color || '#003087'}`,
      `- secondary: ${selectedThumbBrand.secondary_color || '#e8a020'}`,
      selectedThumbBrand.accent_color ? `- accent: ${selectedThumbBrand.accent_color}` : '',
      '',
      'HARD RULES',
      '- Exact 1280x720 SVG viewBox.',
      '- CSDtv brand lockup in bottom-left: chevron + "CSDtv" + "CANYONS SCHOOL DISTRICT".',
      '- Use only inline vectors, gradients, patterns, masks, and text. No external images/fonts/scripts/CSS.',
      '- Event title must be prominent and readable at mobile size.',
      '- No LIVE chip or LIVE badge under any condition.',
      '- Keep output production-ready: no placeholder geometry, no lorem ipsum.',
      '- Do not depict people: no human faces, bodies, crowds, hands, or silhouettes that read as a person. Use abstract shapes, typography, patterns, and non-human symbols only. If a mascot name is given, suggest it with type or an abstract mark—never an illustrated human or humanoid character.',
      '- Before returning the final SVG, resolve text overlap: treat each <text> block (including tspans and multi-line stacks) as a rectangle; ensure no overlap with other text, the CSDtv lockup zone, or key graphics. Adjust position, line breaks, letter-spacing, or font size until everything is clearly separated with comfortable margins from edges.',
      '',
      'OUTPUT CONTRACT',
      '- Return only valid SVG markup, starting with <svg and ending with </svg>—one document, no commentary—after the overlap and no-humans checks above.',
    ].filter(Boolean)
    setThumbPrompt(lines.join('\n'))
  }, [thumbSchoolOverride, selectedThumbBrand, thumbEventName, thumbEventType, thumbDate, thumbTime, thumbDetail, thumbTone, thumbEventDescription, thumbLogistics, thumbConceptAnchor, thumbMascotMode])

  useEffect(() => {
    if (!thumbSvgInput.trim()) {
      setThumbSvgError(null)
      setThumbSanitizedSvg('')
      return
    }
    const clean = sanitizeSvgMarkup(thumbSvgInput)
    if (!clean.toLowerCase().includes('<svg') || !clean.toLowerCase().includes('</svg>')) {
      setThumbSvgError('Paste a complete SVG that starts with <svg and ends with </svg>.')
      setThumbSanitizedSvg('')
      return
    }
    setThumbSvgError(null)
    setThumbSanitizedSvg(clean)
  }, [thumbSvgInput, sanitizeSvgMarkup])

  const copyThumbPrompt = async () => {
    if (missingThumbFields.length > 0) {
      toast(`Add required fields first: ${missingThumbFields.join(', ')}`, 'error')
      return
    }
    if (!thumbPrompt.trim()) return
    try {
      await navigator.clipboard.writeText(thumbPrompt)
      setThumbCopied(true)
      setTimeout(() => setThumbCopied(false), 1600)
    } catch {
      toast('Failed to copy prompt', 'error')
    }
  }

  const downloadThumbnailPng = async () => {
    if (missingThumbFields.length > 0) {
      toast(`Add required fields first: ${missingThumbFields.join(', ')}`, 'error')
      return
    }
    if (!thumbSanitizedSvg) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1280
      canvas.height = 720
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const img = new Image()
      const blob = new Blob([thumbSanitizedSvg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      await new Promise<void>((resolve, reject) => {
        img.onload = () => { ctx.drawImage(img, 0, 0, 1280, 720); resolve() }
        img.onerror = () => reject(new Error('Unable to render SVG'))
        img.src = url
      })
      URL.revokeObjectURL(url)
      const link = document.createElement('a')
      const datePart = thumbDate || new Date().toISOString().slice(0, 10)
      const schoolPart = slug((selectedThumbBrand.short_name || thumbSchoolOverride || 'School'))
      const eventPart = slug(thumbEventName || 'Event')
      link.download = `CSDtv_${schoolPart}_${eventPart}_${datePart}.png`
      const pngBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!pngBlob) throw new Error('Unable to export PNG')
      const pngUrl = URL.createObjectURL(pngBlob)
      link.href = pngUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(pngUrl)
    } catch {
      toast('Failed to convert SVG to PNG', 'error')
    }
  }

  const downloadThumbnailSvg = () => {
    if (missingThumbFields.length > 0) {
      toast(`Add required fields first: ${missingThumbFields.join(', ')}`, 'error')
      return
    }
    if (!thumbSanitizedSvg) return
    try {
      const datePart = thumbDate || new Date().toISOString().slice(0, 10)
      const schoolPart = slug((selectedThumbBrand.short_name || thumbSchoolOverride || 'School'))
      const eventPart = slug(thumbEventName || 'Event')
      const svgBlob = new Blob([thumbSanitizedSvg], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)
      const link = document.createElement('a')
      link.download = `CSDtv_${schoolPart}_${eventPart}_${datePart}.svg`
      link.href = svgUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(svgUrl)
    } catch {
      toast('Failed to save SVG', 'error')
    }
  }

  const clearThumbnailDraft = () => {
    if (typeof window === 'undefined') return
    const key = `thumbnail-draft:${productionNum}`
    try {
      window.localStorage.removeItem(key)
      setThumbDraftSavedAt(null)
      setThumbDraftRestored(false)
      toast('Saved thumbnail draft cleared', 'success')
    } catch {
      toast('Failed to clear saved draft', 'error')
    }
  }

  const buildThumbnailPreviewDoc = (svgMarkup: string): string => {
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      svg {
        width: 100% !important;
        height: 100% !important;
        max-width: 100%;
        max-height: 100%;
        display: block;
      }
    </style>
  </head>
  <body>${svgMarkup}</body>
</html>`
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )

  if (!production) return (
    <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
      <p style={{ color: muted }}>Production not found</p>
      <Link href="/dashboard/productions" style={{ color: '#5ba3e0' }}>Back</Link>
    </div>
  )

  const typeLabel = getTypeLabel(production)
  const nonMembers = allTeam.filter(m => !members.find(pm => pm.user_id === m.id))

  const ctx: PTabCtx = {
      THUMB_EVENT_TYPES,
      THUMB_MASCOT_MODES,
      THUMB_TONES,
      activity,
      addKBLink,
      addLink,
      addMember,
      addingMember,
      allProductions,
      allTeam,
      assignSuccess,
      border,
      brandTone,
      buildThumbnailPreviewDoc,
      callSheet,
      cameraOptionIdFromProduction,
      cameraPackages,
      cardBg,
      checklist,
      clearThumbnailDraft,
      completedCount,
      copySetupTo,
      copyTargetId,
      copyThumbPrompt,
      createTaskForProduction,
      currentUser,
      dangerTone,
      dark,
      delivCount,
      delivNotes,
      downloadThumbnailPng,
      downloadThumbnailSvg,
      effectiveProdStatus,
      emailCallSheet,
      externalCostUsd,
      fetchingYt,
      formatDateTime,
      formatOutsourcedUsd,
      formatRawCreatedOn,
      generateCallSheet,
      generatingSheet,
      getTypeLabel,
      infoTone,
      initChecklist,
      inputBg,
      inputStyle,
      isOnBehalf,
      kbArticles,
      linkYoutubeVideo,
      linkedTasks,
      linkedVideos,
      links,
      loadData,
      massAssign,
      memberToAdd,
      members,
      missingThumbFields,
      moveItem,
      muted,
      newLinkTitle,
      newLinkUrl,
      newTaskAssignee,
      newTaskDue,
      newTaskHideFromSignage,
      newTaskPriority,
      newTaskPurchaseLink,
      newTaskPurchaseRequest,
      newTaskTitle,
      nonMembers,
      notesSaved,
      organizerEmail,
      organizerName,
      persistExternalCostFromInput,
      printCallSheet,
      production,
      progress,
      recomputeOneEstimatedCost,
      recomputingEstCost,
      refreshYoutubeStats,
      removeMember,
      saveTeamNotes,
      saveVideosProduced,
      savingDeliv,
      savingExternalCost,
      savingNotes,
      schools,
      selectedKB,
      selectedMember,
      setAddingMember,
      setChecklist,
      setCopyTargetId,
      setDelivCount,
      setDelivNotes,
      setExternalCostUsd,
      setLinkedVideos,
      setMemberToAdd,
      setNewLinkTitle,
      setNewLinkUrl,
      setNewTaskAssignee,
      setNewTaskDue,
      setNewTaskHideFromSignage,
      setNewTaskPriority,
      setNewTaskPurchaseLink,
      setNewTaskPurchaseRequest,
      setNewTaskTitle,
      setSelectedKB,
      setSelectedMember,
      setShowCopySetup,
      setShowCreateTask,
      setShowKBLink,
      setShowLinkForm,
      setTeamNotes,
      setThumbConceptAnchor,
      setThumbDate,
      setThumbDetail,
      setThumbEventDescription,
      setThumbEventName,
      setThumbEventType,
      setThumbLogistics,
      setThumbMascotMode,
      setThumbPrompt,
      setThumbSchoolCode,
      setThumbSchoolOverride,
      setThumbSvgInput,
      setThumbTime,
      setThumbTone,
      setYoutubeUrl,
      showCopySetup,
      showCreateTask,
      showKBLink,
      showLinkForm,
      showSubmitterCard,
      submitterEmail,
      submitterName,
      successTone,
      supabase,
      teamNotes,
      text,
      thumbConceptAnchor,
      thumbCopied,
      thumbDate,
      thumbDetail,
      thumbDraftRestored,
      thumbDraftSavedAt,
      thumbEventDescription,
      thumbEventName,
      thumbEventType,
      thumbLogistics,
      thumbMascotMode,
      thumbPrompt,
      thumbSanitizedSvg,
      thumbSchoolCode,
      thumbSchoolOverride,
      thumbSvgError,
      thumbSvgInput,
      thumbTime,
      thumbTone,
      toggleItem,
      typeLabel,
      uuid,
      warningTone,
      youtubeUrl,
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

      <Link href="/dashboard/productions" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: muted, fontSize: '13px', textDecoration: 'none', marginBottom: '16px', minHeight: '40px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Productions
      </Link>

      {/* Header */}
      <section style={{ ...uiStyles.zoneSection, marginBottom: '20px' }}>
        <ZoneHeader label="Production Brief" />
        <div style={{ ...uiStyles.card, padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: muted }}>#{production.production_number}</span>
              <span style={{ ...statusBadge('info', true), fontSize: '11px' }}>{typeLabel}</span>
              {production.internal_type_label && production.internal_type_label !== typeLabel && (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'var(--surface-2)', color: muted }}>{production.internal_type_label}</span>
              )}
              <span style={{ ...statusBadge(effectiveProdStatus === 'Complete Requested' ? 'review' : 'success', true), fontSize: '11px' }}>{effectiveProdStatus || 'Unknown'}</span>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: '0 0 6px' }}>{production.title}</h1>
            {production.organizer_name && (
              <p style={{ fontSize: '13px', color: muted, margin: 0, wordBreak: 'break-all' as const }}>
                {production.organizer_name}
                {production.organizer_email && (
                  <> · <a href={`mailto:${production.organizer_email}`} style={{ color: '#5ba3e0', textDecoration: 'none' }}>{production.organizer_email}</a></>
                )}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              {production.organizer_email && (
                <button onClick={() => setShowEmailModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: statusTone.info.background, color: infoTone, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  ✉ Email organizer
                </button>
              )}
              {production.organizer_email && (
                <button onClick={requestInProgress} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: statusTone.warning.background, color: warningTone, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  ◴ Request In Progress
                </button>
              )}
              {effectiveProdStatus === 'Complete Requested' && (
                <button
                  onClick={clearCompleteRequested}
                  disabled={clearingCompleteRequested}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: statusTone.warning.background, color: warningTone, border: `0.5px solid ${border}`, cursor: clearingCompleteRequested ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: clearingCompleteRequested ? 0.7 : 1 }}
                >
                  {clearingCompleteRequested ? '…Removing request' : '↺ Remove complete request'}
                </button>
              )}
              {production.organizer_email && (
                <button onClick={() => setShowCompleteModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', background: statusTone.success.background, color: successTone, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                  ✓ Mark complete
                </button>
              )}
            </div>
          </div>
          {production.thumbnail_url && production.thumbnail_url.startsWith('http') && (
            <div style={{ width: '120px', height: '68px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
              <img src={production.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
            </div>
          )}
        </div>

        {/* Info strip */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '12px', padding: '10px 14px', background: inputBg, borderRadius: '10px', border: `0.5px solid ${border}` }}>
          {production.start_datetime && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span style={{ color: text }}>{formatDateTime(production.start_datetime)}</span>
            </div>
          )}
          {(production.filming_location || production.school_department) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span style={{ color: text }}>{getSchoolName(production.filming_location) || getSchoolName(production.school_department) || production.filming_location || ''}</span>
            </div>
          )}
          {production.livestream_url && (
            <a href={production.livestream_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: infoTone, textDecoration: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
              Livestream link
            </a>
          )}
          {members.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {members.slice(0, 4).map((m, i) => m.team && (
                <div key={m.id} title={m.team.name} style={{ width: '24px', height: '24px', borderRadius: '50%', background: m.team.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#0a0f1e', marginLeft: i > 0 ? '-6px' : 0, border: `2px solid ${cardBg}`, position: 'relative', zIndex: members.length - i }}>
                  {m.team.name.slice(0, 2).toUpperCase()}
                </div>
              ))}
              {members.length > 4 && <span style={{ fontSize: '11px', color: muted, marginLeft: '4px' }}>+{members.length - 4}</span>}
            </div>
          )}
          {(delivCount > 0 || linkedVideos.length > 0) && (
            <span style={{ fontSize: '12px', padding: '2px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 500 }}>
              🎬 {delivCount > 0 ? `${delivCount} produced` : `${linkedVideos.length} video${linkedVideos.length !== 1 ? 's' : ''}`}
              {linkedVideos.some(v => v.youtube_views) ? ` · ${linkedVideos.reduce((s, v) => s + (v.youtube_views || 0), 0).toLocaleString()} views` : ''}
            </span>
          )}
        </div>
        </div>
      </section>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, marginBottom: '20px', overflowX: 'auto' as const, background: cardBg, borderRadius: '10px 10px 0 0', padding: '0 6px' }}>
        {productionTabVisible('checklist') && tabBtn('checklist', 'Checklist', checklist.length > 0 ? completedCount : undefined)}
        {productionTabVisible('info') && tabBtn('info', 'Production info')}
        {productionTabVisible('team') && tabBtn('team', 'Team', members.length)}
        {productionTabVisible('links') && tabBtn('links', 'Links', links.length)}
        {productionTabVisible('activity') && tabBtn('activity', 'Activity')}
        {productionTabVisible('comments') && tabBtn('comments', 'Comments')}
        {productionTabVisible('videos') && tabBtn('videos', 'Videos', linkedVideos.length)}
        {productionTabVisible('thumbnail') && tabBtn('thumbnail', 'Thumbnail')}
        {productionTabVisible('callsheet') && tabBtn('callsheet', 'Call sheet', callSheet ? 1 : 0)}
        {productionTabVisible('studentcrew') && tabBtn('studentcrew', 'Student Crew')}
        {productionTabVisible('boardmeeting') && isBoardMeetingProduction && tabBtn('boardmeeting', 'Board Meeting')}
      </div>

      {/* CHECKLIST TAB */}
      {activeTab === 'checklist' && <ChecklistTab c={ctx} />}
      {/* INFO TAB */}
      {activeTab === 'info' && <InfoTab c={ctx} />}
      {/* TEAM TAB */}
      {activeTab === 'team' && <TeamTab c={ctx} />}

      {/* LINKS TAB */}
      {activeTab === 'links' && <LinksTab c={ctx} />}

      {/* ACTIVITY TAB */}
      {activeTab === 'activity' && <ActivityTab c={ctx} />}

      {/* COMMENTS TAB */}
      {activeTab === 'comments' && <CommentsTab c={ctx} />}

      {/* VIDEOS TAB */}
      {activeTab === 'videos' && <VideosTab c={ctx} />}

      {/* THUMBNAIL TAB */}
      {activeTab === 'thumbnail' && <ThumbnailTab c={ctx} />}

      {/* CALL SHEET TAB */}
      {activeTab === 'callsheet' && <CallsheetTab c={ctx} />}

      {/* STUDENT CREW TAB */}
      {activeTab === 'studentcrew' && uuid && production && (
        <StudentCrewTab
          productionId={uuid}
          productionNumber={production.production_number}
          productionTitle={production.title}
          isManager={currentUser?.role === 'Manager'}
        />
      )}

      {activeTab === 'boardmeeting' && uuid && production && isBoardMeetingProduction && (
        <BoardMeetingTab productionId={uuid} />
      )}

      {/* EMAIL ORGANIZER MODAL */}
      {showEmailModal && production && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowEmailModal(false) }}>
          <div style={{ background: 'var(--surface-1)', border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' as const, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: 0 }}>Email organizer</h2>
              <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
            </div>

            <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>
              To: <strong style={{ color: text }}>{production.organizer_name}</strong> ({production.organizer_email})
            </p>

            {templates.length > 0 ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {templates.map(t => {
                  const ytTemplateLocked = templateUsesYoutubeLink(t) && !getSyncedYoutubeLink()
                  return (
                    <button
                      key={t.id}
                      type="button"
                      title={ytTemplateLocked ? 'Requires a synced livestream/video link on this production (from productions site sync)' : undefined}
                      disabled={ytTemplateLocked}
                      onClick={() => selectTemplate(t.id)}
                      style={{
                        fontSize: '12px',
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: `0.5px solid ${emailTemplate === t.id ? '#1e6cb5' : border}`,
                        background: emailTemplate === t.id ? 'rgba(30,108,181,0.12)' : cardBg,
                        color: emailTemplate === t.id ? '#5ba3e0' : muted,
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

            {emailTemplate && templateUsesYoutubeLink(templates.find(t => t.id === emailTemplate)) && !getSyncedYoutubeLink() && (
              <p style={{ fontSize: '12px', color: warningTone, margin: '0 0 12px', padding: '10px 12px', background: statusTone.warning.background, borderRadius: '8px', border: `0.5px solid ${border}` }}>
                This template needs a video/livestream link from the district sync (livestream URL on this production). Sync from the productions site first.
              </p>
            )}

            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Subject</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email subject..." style={{ ...inputStyle }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Message</label>
              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Pick a template or write your message..." style={{ ...inputStyle, minHeight: '240px', resize: 'vertical' as const, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }} />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={openOrganizerEmail} disabled={!emailBody} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: emailBody ? '#1e6cb5' : 'var(--surface-2)', color: emailBody ? '#fff' : muted, border: 'none', cursor: emailBody ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: 500 }}>
                ✉ Open in Outlook
              </button>
              <button onClick={() => setShowEmailModal(false)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
            <p style={{ fontSize: '11px', color: muted, margin: '8px 0 0' }}>Opens your default email app so you can review and send. The send is logged to this production's activity when you click the button.</p>
          </div>
        </div>
      )}

      {/* MARK COMPLETE MODAL */}
      {showCompleteModal && production && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCompleteModal(false) }}>
          <div style={{ background: 'var(--surface-1)', border: `0.5px solid ${border}`, borderRadius: '16px', width: '100%', maxWidth: '480px', padding: '24px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: text, margin: '0 0 4px' }}>Request production completion</h2>
            <p style={{ fontSize: '13px', color: muted, margin: '0 0 16px' }}>#{production.production_number} {production.title}</p>

            <p style={{ fontSize: '13px', fontWeight: 600, color: text, margin: '0 0 10px' }}>Confirm before completing:</p>
            {([
              { key: 'deliverables' as const, label: 'All deliverables have been sent to the organizer' },
              { key: 'organizer' as const, label: 'Organizer has confirmed receipt' },
              { key: 'files' as const, label: 'Project files are saved and organized' },
              { key: 'quality' as const, label: 'Final quality check passed' },
            ]).map(item => (
              <div key={item.key} onClick={() => setCompleteChecks(prev => ({ ...prev, [item.key]: !prev[item.key] }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', marginBottom: '6px', background: completeChecks[item.key] ? 'rgba(34,197,94,0.06)' : (dark ? 'rgba(255,255,255,0.02)' : '#f8fafc'), border: `0.5px solid ${completeChecks[item.key] ? 'rgba(34,197,94,0.2)' : border}`, cursor: 'pointer' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `1.5px solid ${completeChecks[item.key] ? '#22c55e' : border}`, background: completeChecks[item.key] ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {completeChecks[item.key] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span style={{ fontSize: '14px', color: completeChecks[item.key] ? text : muted }}>{item.label}</span>
              </div>
            ))}

            <p style={{ fontSize: '12px', color: muted, margin: '14px 0 12px' }}>This sets status to Complete Requested and emails you + the admin assistant to finish the official district status update.</p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={markProductionComplete} disabled={sendingComplete || !Object.values(completeChecks).every(Boolean)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: Object.values(completeChecks).every(Boolean) ? '#22c55e' : 'var(--surface-2)', color: Object.values(completeChecks).every(Boolean) ? '#fff' : muted, border: 'none', cursor: Object.values(completeChecks).every(Boolean) ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>
                {sendingComplete ? 'Sending...' : 'Set Complete Requested'}
              </button>
              <button onClick={() => setShowCompleteModal(false)} style={{ fontSize: '14px', padding: '10px 20px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}