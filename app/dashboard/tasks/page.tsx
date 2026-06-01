'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'
import Loader from '../components/Loader'
import type { TasksDashboardPayload } from '@/lib/dashboard/load-tasks-data'
import { useTasksSummary } from '@/lib/hooks/dashboard-cache'
import { ZoneHeader } from '../components/ZoneHeader'
import { uiStyles, statusBadge, statusTone } from '@/lib/ui/styles'
import { toast } from '@/lib/toast'
import { sanitizeEmailSubject } from '@/lib/escape-html'
import { isStudentInternRole } from '@/lib/roles'
import { canPublishTaskSignageIntake } from '@/lib/equipment-access'
import {
  fetchTaskAssignments,
  mergeAssigneeIds,
  replaceTaskAssignees,
  taskHasAssignee,
  taskIsUnassigned,
} from '@/lib/task-assignments'

const CommentsSection = dynamic(() => import('../components/CommentsSection'), {
  ssr: false,
  loading: () => (
    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>Loading comments…</p>
  ),
})
import TaskAssigneePicker from '../components/TaskAssigneePicker'
import {
  type RecurrenceFormState,
  defaultRecurrenceForm,
  buildRecurrenceInsert,
  describeRecurrence,
  createRecurrence,
  WEEKDAY_LABELS,
} from '@/lib/task-recurrence'

interface Production {
  id: string; title: string; production_number: number
  request_type_label: string | null; start_datetime: string | null; status: string | null
}

interface Subtask { id: string; title: string; completed: boolean; sort_order: number }
interface TimeEntry { id: string; hours: number; description: string | null; date: string; user_id: string; user?: { name: string } | null }

interface Task {
  id: string; title: string; description: string | null; status: string; priority: string
  due_date: string | null; created_at: string; assigned_to: string | null; assignee_ids?: string[]
  created_by: string
  production_id: string | null; needs_equipment: boolean; notes: string | null
  purchase_request: boolean; purchase_request_link: string | null
  hide_from_signage?: boolean
  intake_source?: string | null
  intake_submitter_name?: string | null
  intake_submitter_email?: string | null
  completed_at: string | null; recurring: string | null; recurring_interval: number | null
  recurrence_id?: string | null
  blocked_by: string | null; scanned_sheet_id: string | null
  source?: 'task' | 'checklist'
  checklist_item_id?: string | null
  productions?: { id: string; title: string; production_number: number; request_type_label: string | null; start_datetime: string | null; status: string | null } | null
}

interface TeamMember { id: string; name: string; role: string; avatar_color: string; email: string }
interface CurrentUser { id: string; name: string; role: string }
interface TaskTemplate { id: string; name: string; description: string | null; items?: TaskTemplateItem[] }
interface TaskTemplateItem { id: string; title: string; description: string | null; priority: string; due_offset_days: number | null; sort_order: number }
interface ChecklistRow {
  id: string
  title: string
  completed: boolean
  assigned_to: string | null
  production_id: string
  productions?: { id: string; title: string; production_number: number; request_type_label: string | null; start_datetime: string | null; status: string | null } | { id: string; title: string; production_number: number; request_type_label: string | null; start_datetime: string | null; status: string | null }[] | null
}

const PRIORITIES = ['low', 'normal', 'high', 'day of']

const STATUS_TONE: Record<string, keyof typeof statusTone | null> = {
  pending: null,
  'in progress': 'warning',
  'in review': 'review',
  complete: 'success',
}

const INTAKE_PANEL_OPEN_KEY = 'csdtv-tasks-intake-panel-open'

const PRIORITY_TONE: Record<string, keyof typeof statusTone | null> = {
  'day of': 'danger',
  high: 'warning',
  normal: null,
  low: null,
}

type FocusFilter = 'today' | 'overdue' | 'this-week' | 'all' | 'recent-done'
type Scope = 'mine' | 'team' | 'unassigned'
type Grouping = 'none' | 'status' | 'priority' | 'person'

// Parse a 'YYYY-MM-DD' string as a *local* Date (avoids UTC drift)
function parseDueLocal(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1)
}

function daysFromToday(dueDate: string | null): number | null {
  if (!dueDate) return null
  const due = parseDueLocal(dueDate)
  const now = new Date()
  due.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - now.getTime()) / 86400000)
}

function normalizeProductionRelation(
  rel: ChecklistRow['productions']
): { id: string; title: string; production_number: number; request_type_label: string | null; start_datetime: string | null; status: string | null } | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] || null) : rel
}

export default function TasksPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const router = useRouter()
  const supabase = createClient()

  const [tasks, setTasks] = useState<Task[]>([])
  const [completedTasks, setCompletedTasks] = useState<Task[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [allProductions, setAllProductions] = useState<Production[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { data: tasksSummary, error: tasksError, isLoading: tasksLoading, mutate: refreshTasks } =
    useTasksSummary<TasksDashboardPayload & { redirect?: string }>()
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all')
  const [scope, setScope] = useState<Scope>('mine')
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupBy, setGroupBy] = useState<Grouping>('none')
  const [showNewTask, setShowNewTask] = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showProductions, setShowProductions] = useState(true)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'normal',
    assignee_ids: [] as string[],
    due_date: '',
    production_id: '',
    needs_equipment: false,
    purchase_request: false,
    purchase_request_link: '',
    hide_from_signage: false,
  })
  const [recur, setRecur] = useState<RecurrenceFormState>(defaultRecurrenceForm())
  const [panelNotes, setPanelNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [search, setSearch] = useState('')
  const [denseMode, setDenseMode] = useState(true)
  const [productionFilterId, setProductionFilterId] = useState<string | null>(null)
  const [myProductions, setMyProductions] = useState<{ id: string; title: string; production_number: number; total: number; done: number }[]>([])
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [newSubtask, setNewSubtask] = useState('')
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [newTimeHours, setNewTimeHours] = useState('')
  const [newTimeDesc, setNewTimeDesc] = useState('')
  const [expandSubtasks, setExpandSubtasks] = useState(false)
  const [expandTime, setExpandTime] = useState(false)
  const [expandComments, setExpandComments] = useState(false)
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [newTemplateName, setNewTemplateName] = useState('')
  const [subtaskCounts, setSubtaskCounts] = useState<Record<string, { total: number; done: number }>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const overflowRef = useRef<HTMLDivElement | null>(null)
  const newTaskTitleRef = useRef<HTMLInputElement | null>(null)

  const [intakeActive, setIntakeActive] = useState(false)
  const [intakeCreatedAt, setIntakeCreatedAt] = useState<string | null>(null)
  const [intakeLastUsedAt, setIntakeLastUsedAt] = useState<string | null>(null)
  const [intakeUrlReveal, setIntakeUrlReveal] = useState<string | null>(null)
  const [intakeQrDataUrl, setIntakeQrDataUrl] = useState<string | null>(null)
  const [intakePanelLoading, setIntakePanelLoading] = useState(false)
  const [intakeBusy, setIntakeBusy] = useState(false)
  /** Active token row has no stored plaintext (created before migration) — rotate once to show URL. */
  const [intakeNeedsLegacyRotate, setIntakeNeedsLegacyRotate] = useState(false)
  /** Shown after rotating the magic link so staff know to redistribute URL/QR. */
  const [intakeRotateNotice, setIntakeRotateNotice] = useState(false)
  /** URL stored for task ops signage QR (`app_settings`). */
  const [signageTaskIntakeUrl, setSignageTaskIntakeUrl] = useState<string | null>(null)
  const [signageTaskIntakeBusy, setSignageTaskIntakeBusy] = useState(false)
  const [intakePanelOpen, setIntakePanelOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (localStorage.getItem(INTAKE_PANEL_OPEN_KEY) === '1') setIntakePanelOpen(true)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(INTAKE_PANEL_OPEN_KEY, intakePanelOpen ? '1' : '0')
    } catch { /* ignore */ }
  }, [intakePanelOpen])

  useEffect(() => {
    if (intakeRotateNotice) setIntakePanelOpen(true)
  }, [intakeRotateNotice])

  useEffect(() => {
    if (!intakePanelLoading && intakeActive && intakeNeedsLegacyRotate && !intakeUrlReveal) {
      setIntakePanelOpen(true)
    }
  }, [intakePanelLoading, intakeActive, intakeNeedsLegacyRotate, intakeUrlReveal])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const q = params.get('search')
      if (q) { setSearch(q); setFocusFilter('all'); setScope('team') }
    }
  }, [])

  // Close overflow menu on outside click / Escape
  useEffect(() => {
    if (!showOverflow) return
    const onDown = (e: MouseEvent) => {
      if (!overflowRef.current) return
      const target = e.target as Node
      if (!overflowRef.current.contains(target)) setShowOverflow(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowOverflow(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showOverflow])

  // Lock body scroll when detail drawer is open on mobile
  useEffect(() => {
    if (!selectedTask || typeof window === 'undefined') return
    const isMobile = window.matchMedia('(max-width: 1023px)').matches
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [selectedTask])

  // Close drawer on Escape
  useEffect(() => {
    if (!selectedTask) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedTask(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedTask])

  useEffect(() => {
    if (!showNewTask) return
    const id = requestAnimationFrame(() => newTaskTitleRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [showNewTask])

  // Alt+Shift+N: new task (avoid Cmd/Ctrl+N and Cmd/Ctrl+Shift+N browser bindings)
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | undefined
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey || e.key.toLowerCase() !== 'n') return
      if (e.metaKey || e.ctrlKey) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      setShowTemplates(false)
      setShowOverflow(false)
      setNewTask(p => ({
        ...p,
        assignee_ids: p.assignee_ids.length > 0 ? p.assignee_ids : currentUser?.id ? [currentUser.id] : [],
      }))
      setShowNewTask(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentUser?.id])

  const text     = 'var(--text-primary)'
  const muted    = 'var(--text-muted)'
  const border   = 'var(--border-subtle)'
  const cardBg   = 'var(--surface-1)'
  const surface2 = 'var(--surface-2)'
  const hoverBg  = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  const success = statusTone.success.color
  const successBg = statusTone.success.background
  const warning = statusTone.warning.color
  const warningBg = statusTone.warning.background
  const danger = statusTone.danger.color
  const dangerBg = statusTone.danger.background
  const info = statusTone.info.color
  const review = statusTone.review.color

  const enrichTasksWithAssignees = useCallback(async (rows: Task[]): Promise<Task[]> => {
    const taskRows = rows.filter(t => t.source !== 'checklist')
    const map = await fetchTaskAssignments(
      supabase,
      taskRows.map(t => t.id),
    ).catch(() => new Map<string, string[]>())
    return rows.map(t => {
      if (t.source === 'checklist') return t
      const assignee_ids = map.get(t.id) ?? mergeAssigneeIds(t.assigned_to, t.assignee_ids)
      return {
        ...t,
        assignee_ids,
        assigned_to: assignee_ids[0] ?? null,
      }
    })
  }, [supabase])

  const applyTasksSummary = useCallback((payload: TasksDashboardPayload) => {
    setLoadError(null)
    setCurrentUser(payload.user)
    setTasks(payload.tasks as Task[])
    setCompletedTasks(payload.completedTasks as Task[])
    setTeam(payload.team as TeamMember[])
    setAllProductions(payload.allProductions as Production[])
    setTemplates(payload.templates as TaskTemplate[])
    setSubtaskCounts(payload.subtaskCounts)
    setMyProductions(payload.myProductions)
    if (isStudentInternRole(payload.user.role)) {
      setTemplates([])
      setShowTemplates(false)
    }
  }, [])

  useEffect(() => {
    if (!tasksSummary) return
    if (tasksSummary.redirect) {
      router.replace(tasksSummary.redirect)
      return
    }
    applyTasksSummary(tasksSummary)
  }, [tasksSummary, router, applyTasksSummary])

  useEffect(() => {
    if (tasksError) {
      setLoadError(tasksError.message)
      toast(tasksError.message, 'error')
    }
  }, [tasksError])

  const loading = tasksLoading && !tasksSummary

  const loadData = useCallback(async () => {
    try {
      await refreshTasks()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tasks'
      setLoadError(msg)
      toast(msg, 'error')
    }
  }, [refreshTasks])

  const isStudentInternUser = useMemo(() => isStudentInternRole(currentUser?.role), [currentUser?.role])

  useEffect(() => {
    if (isStudentInternUser) setScope('mine')
  }, [isStudentInternUser])

  useEffect(() => {
    if (!currentUser || isStudentInternUser) {
      setIntakeActive(false)
      setIntakeCreatedAt(null)
      setIntakeLastUsedAt(null)
      setIntakeUrlReveal(null)
      setIntakeNeedsLegacyRotate(false)
      setIntakeRotateNotice(false)
      setIntakePanelLoading(false)
      return
    }
    let cancelled = false
    setIntakePanelLoading(true)
    fetch('/api/dashboard/task-intake-token', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data.active) {
          setIntakeActive(true)
          setIntakeCreatedAt(data.created_at ?? null)
          setIntakeLastUsedAt(data.last_used_at ?? null)
          setIntakeNeedsLegacyRotate(!!data.needs_rotate_for_stored_url)
          if (typeof data.url === 'string' && data.url) setIntakeUrlReveal(data.url)
          else setIntakeUrlReveal(null)
        } else {
          setIntakeActive(false)
          setIntakeCreatedAt(null)
          setIntakeLastUsedAt(null)
          setIntakeUrlReveal(null)
          setIntakeNeedsLegacyRotate(false)
          setIntakeRotateNotice(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIntakeActive(false)
          setIntakeUrlReveal(null)
          setIntakeNeedsLegacyRotate(false)
          setIntakeRotateNotice(false)
        }
      })
      .finally(() => { if (!cancelled) setIntakePanelLoading(false) })
    return () => { cancelled = true }
  }, [currentUser, isStudentInternUser])

  useEffect(() => {
    if (!currentUser || isStudentInternUser) {
      setSignageTaskIntakeUrl(null)
      return
    }
    let cancelled = false
    fetch('/api/dashboard/signage-task-intake-url', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const u = typeof data.url === 'string' && data.url.trim() ? data.url.trim() : null
        setSignageTaskIntakeUrl(u)
      })
      .catch(() => {
        if (!cancelled) setSignageTaskIntakeUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [currentUser, isStudentInternUser])

  useEffect(() => {
    if (!intakeUrlReveal) {
      setIntakeQrDataUrl(null)
      return
    }
    let cancelled = false
    void import('qrcode').then(({ default: QR }) =>
      QR.toDataURL(intakeUrlReveal, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
        .then(dataUrl => { if (!cancelled) setIntakeQrDataUrl(dataUrl) })
        .catch(() => { if (!cancelled) setIntakeQrDataUrl(null) })
    )
    return () => { cancelled = true }
  }, [intakeUrlReveal])

  const generateIntakeLink = useCallback(async () => {
    const wasRotating = intakeActive
    setIntakeBusy(true)
    try {
      const res = await fetch('/api/dashboard/task-intake-token', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(typeof data.error === 'string' ? data.error : 'Failed to create link', 'error')
        return
      }
      const url = data.url as string
      setIntakeUrlReveal(url)
      setIntakeActive(true)
      setIntakeCreatedAt(data.created_at ?? null)
      setIntakeLastUsedAt(null)
      setIntakeNeedsLegacyRotate(false)
      if (wasRotating) {
        setIntakeRotateNotice(true)
        toast('Link rotated. Anyone using the old URL or QR should contact CSDtv for the new link.', 'success')
      } else {
        setIntakeRotateNotice(false)
        toast('Magic link created. The URL and QR stay here until you rotate or revoke.', 'success')
      }
    } finally {
      setIntakeBusy(false)
    }
  }, [intakeActive])

  const revokeIntakeLink = useCallback(async () => {
    if (!confirm('Revoke this intake link? Shared QR codes and URLs will stop working.')) return
    setIntakeBusy(true)
    try {
      const res = await fetch('/api/dashboard/task-intake-token', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(typeof data.error === 'string' ? data.error : 'Failed to revoke', 'error')
        return
      }
      setIntakeActive(false)
      setIntakeCreatedAt(null)
      setIntakeLastUsedAt(null)
      setIntakeUrlReveal(null)
      setIntakeQrDataUrl(null)
      setIntakeNeedsLegacyRotate(false)
      setIntakeRotateNotice(false)
      toast('Intake link revoked', 'success')
    } finally {
      setIntakeBusy(false)
    }
  }, [])

  const copyIntakeUrl = useCallback(async () => {
    if (!intakeUrlReveal) return
    try {
      await navigator.clipboard.writeText(intakeUrlReveal)
      toast('Copied link', 'success')
    } catch {
      toast('Could not copy — copy manually', 'error')
    }
  }, [intakeUrlReveal])

  const sameTaskIntakeUrl = useCallback((a: string | null, b: string | null) => {
    if (!a || !b) return false
    const ta = a.trim()
    const tb = b.trim()
    if (ta === tb) return true
    try {
      return new URL(ta).href === new URL(tb).href
    } catch {
      return false
    }
  }, [])

  const publishIntakeToTaskSignage = useCallback(async () => {
    if (!intakeUrlReveal || !canPublishTaskSignageIntake(currentUser?.role)) return
    setSignageTaskIntakeBusy(true)
    try {
      const res = await fetch('/api/dashboard/signage-task-intake-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: intakeUrlReveal }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(typeof data.error === 'string' ? data.error : 'Could not update signage URL', 'error')
        return
      }
      setSignageTaskIntakeUrl(intakeUrlReveal)
      toast('Task signage will show this intake QR after the board refreshes.', 'success')
    } finally {
      setSignageTaskIntakeBusy(false)
    }
  }, [intakeUrlReveal, currentUser?.role])

  const clearTaskSignageIntake = useCallback(async () => {
    if (!canPublishTaskSignageIntake(currentUser?.role)) return
    if (!confirm('Remove the intake QR from the task ops signage board?')) return
    setSignageTaskIntakeBusy(true)
    try {
      const res = await fetch('/api/dashboard/signage-task-intake-url', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(typeof data.error === 'string' ? data.error : 'Could not clear signage URL', 'error')
        return
      }
      setSignageTaskIntakeUrl(null)
      toast('Removed intake QR from task signage.', 'success')
    } finally {
      setSignageTaskIntakeBusy(false)
    }
  }, [currentUser?.role])

  const getMember = (id: string | null) => id ? team.find(m => m.id === id) || null : null
  const getAssigneeMembers = (task: Task) =>
    mergeAssigneeIds(task.assigned_to, task.assignee_ids)
      .map(id => getMember(id))
      .filter((m): m is TeamMember => !!m)

  const saveAsTemplate = async () => {
    if (!newTemplateName.trim() || !currentUser) return
    const openTasks = tasks.filter(t => t.status !== 'complete')
    if (openTasks.length === 0) return
    const { data: tpl } = await supabase.from('task_templates').insert({ name: newTemplateName.trim(), created_by: currentUser.id }).select('*').single()
    if (!tpl) return
    const items = openTasks.map((t, i) => ({ template_id: tpl.id, title: t.title, description: t.description, priority: t.priority, due_offset_days: 0, sort_order: i }))
    const { data: itemsData } = await supabase.from('task_template_items').insert(items).select('*')
    setTemplates(prev => [...prev, { ...tpl, items: itemsData || [] }])
    setNewTemplateName('')
    setShowTemplates(false)
    toast('Template saved', 'success')
  }

  const applyTemplate = async (template: TaskTemplate) => {
    if (!currentUser || !template.items) return
    const today = new Date()
    const inserts = template.items.map(item => ({
      title: item.title, description: item.description, priority: item.priority, status: 'pending',
      created_by: currentUser.id,
      due_date: item.due_offset_days ? new Date(today.getTime() + item.due_offset_days * 86400000).toISOString().split('T')[0] : null,
    }))
    const { data: insertedIds } = await supabase.from('tasks').insert(inserts).select('id')
    if (insertedIds && insertedIds.length > 0) {
      const { data } = await supabase.from('tasks').select('*, productions(id,title,production_number,request_type_label,start_datetime,status)').in('id', insertedIds.map((d: any) => d.id))
      if (data) setTasks(prev => [...data, ...prev])
    }
    setShowTemplates(false)
    toast(`Applied "${template.name}"`, 'success')
  }

  const deleteTemplate = async (id: string) => {
    await supabase.from('task_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const openTask = async (task: Task) => {
    setSelectedTask(task); setPanelNotes(task.notes || ''); setEditTitle(task.title); setEditDescription(task.description || '')
    setExpandSubtasks(false); setExpandTime(false); setExpandComments(false)
    const [subRes, timeRes] = await Promise.all([
      supabase.from('subtasks').select('*').eq('task_id', task.id).order('sort_order'),
      supabase.from('time_entries').select('*, user:team!time_entries_user_id_fkey(name)').eq('task_id', task.id).order('date', { ascending: false }),
    ])
    setSubtasks(subRes.data || [])
    setTimeEntries(timeRes.data as any || [])
  }
  const closePanel = useCallback(() => { setSelectedTask(null); setSubtasks([]); setTimeEntries([]) }, [])

  const sendAssignEmail = useCallback(async (assigneeId: string, taskTitle: string) => {
    const assignee = team.find(m => m.id === assigneeId)
    if (!assignee || !currentUser) return
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) return
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          type: 'task_assigned',
          recipientEmail: assignee.email,
          recipientName: assignee.name.split(' ')[0],
          subject: sanitizeEmailSubject(`New task assigned: ${taskTitle}`),
          body: `${currentUser.name} assigned you a task: "${taskTitle}". Log in to see the details and get started.`,
          actionUrl: '/dashboard/tasks',
          actionLabel: 'View task',
        }),
      })
    } catch { /* email error */ }
  }, [team, currentUser, supabase])

  const setTaskAssignees = useCallback(
    async (taskId: string, assigneeIds: string[], taskTitle: string, priorIds: string[]) => {
      try {
        const unique = await replaceTaskAssignees(supabase, taskId, assigneeIds, currentUser?.id)
        const primary = unique[0] ?? null
        setTasks(prev =>
          prev.map(t => (t.id === taskId ? { ...t, assignee_ids: unique, assigned_to: primary } : t)),
        )
        setCompletedTasks(prev =>
          prev.map(t => (t.id === taskId ? { ...t, assignee_ids: unique, assigned_to: primary } : t)),
        )
        setSelectedTask(prev =>
          prev?.id === taskId ? { ...prev, assignee_ids: unique, assigned_to: primary } : prev,
        )
        for (const id of unique) {
          if (!priorIds.includes(id)) void sendAssignEmail(id, taskTitle)
        }
      } catch {
        toast('Failed to update assignees', 'error')
      }
    },
    [supabase, currentUser?.id, sendAssignEmail],
  )

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const { error } = await supabase.from('tasks').update(updates).eq('id', id)
    if (error) { toast('Failed to update task', 'error'); return }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    setSelectedTask(prev => prev?.id === id ? { ...prev, ...updates } : prev)
  }, [supabase])

  const saveNotes = useCallback(async () => {
    if (!selectedTask) return
    setSavingNotes(true)
    await updateTask(selectedTask.id, { notes: panelNotes })
    setSavingNotes(false)
  }, [selectedTask, panelNotes, updateTask])

  const deleteTask = useCallback(async (id: string) => {
    if (!confirm('Delete this task? This cannot be undone.')) return
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) { toast('Failed to delete task', 'error'); return }
    setTasks(prev => prev.filter(t => t.id !== id))
    setCompletedTasks(prev => prev.filter(t => t.id !== id))
    if (selectedTask?.id === id) closePanel()
  }, [supabase, selectedTask, closePanel])

  const clearCompleted = useCallback(async () => {
    if (!confirm(`Delete all ${completedTasks.length} completed tasks? This cannot be undone.`)) return
    const ids = completedTasks.map(t => t.id)
    const { error } = await supabase.from('tasks').delete().in('id', ids)
    if (error) { toast('Failed to clear completed tasks', 'error'); return }
    setCompletedTasks([])
  }, [supabase, completedTasks])

  const resetNewTaskForm = useCallback(() => {
    setNewTask({
      title: '',
      description: '',
      priority: 'normal',
      assignee_ids: currentUser?.id ? [currentUser.id] : [],
      due_date: '',
      production_id: '',
      needs_equipment: false,
      purchase_request: false,
      purchase_request_link: '',
      hide_from_signage: false,
    })
    setRecur(defaultRecurrenceForm())
  }, [currentUser])

  const createTask = useCallback(async () => {
    if (!newTask.title || !currentUser) return

    // Recurring series: create a rule that materializes per-person copies on a schedule.
    if (recur.frequency) {
      const payload = buildRecurrenceInsert(
        {
          title: newTask.title,
          description: newTask.description || null,
          priority: newTask.priority,
          production_id: newTask.production_id || null,
          needs_equipment: newTask.needs_equipment,
          hide_from_signage: newTask.hide_from_signage,
          createdBy: currentUser.id,
        },
        recur,
      )
      if (!payload) return
      try {
        await createRecurrence(supabase, payload, newTask.assignee_ids)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create recurring task'
        toast(msg, 'error')
        return
      }
      await loadData()
      resetNewTaskForm()
      setShowNewTask(false)
      toast('Recurring task scheduled', 'success')
      return
    }

    const primaryAssignee = newTask.assignee_ids[0] ?? null
    const { data, error } = await supabase.from('tasks').insert({
      title: newTask.title, description: newTask.description || null,
      priority: newTask.priority, assigned_to: primaryAssignee,
      due_date: newTask.due_date || null, production_id: newTask.production_id || null,
      needs_equipment: newTask.needs_equipment,
      purchase_request: newTask.purchase_request,
      purchase_request_link: newTask.purchase_request_link?.trim() || null,
      hide_from_signage: newTask.hide_from_signage,
      recurring: null,
      recurring_interval: null, status: 'pending', created_by: currentUser.id,
    }).select('*').single()
    if (error) { toast('Failed to create task', 'error'); return }
    if (data) {
      const assignee_ids = await replaceTaskAssignees(
        supabase,
        data.id,
        newTask.assignee_ids,
        currentUser.id,
      ).catch(() => newTask.assignee_ids)
      const linkedProd = newTask.production_id ? allProductions.find(p => p.id === newTask.production_id) || null : null
      setTasks(prev => [
        {
          ...data,
          productions: linkedProd,
          assignee_ids,
          assigned_to: assignee_ids[0] ?? null,
        },
        ...prev,
      ])
      for (const id of assignee_ids) void sendAssignEmail(id, newTask.title)
      resetNewTaskForm()
      setShowNewTask(false)
      toast('Task created', 'success')
    }
  }, [newTask, recur, currentUser, supabase, sendAssignEmail, allProductions, loadData, resetNewTaskForm])

  const completeTask = useCallback(async (task: Task) => {
    if (task.source === 'checklist' && task.checklist_item_id) {
      const { error } = await supabase.from('checklist_items').update({ completed: true }).eq('id', task.checklist_item_id)
      if (error) { toast('Failed to complete checklist item', 'error'); return }
      setTasks(prev => prev.filter(t => t.id !== task.id))
      if (selectedTask?.id === task.id) closePanel()
      toast('Checklist item complete', 'success')
      return
    }

    const { error } = await supabase.from('tasks').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', task.id)
    if (error) { toast('Failed to complete task', 'error'); return }
    setCompleting(prev => new Set(prev).add(task.id))

    // Auto-unblock dependent tasks
    const blockedTasks = tasks.filter(t => t.blocked_by === task.id)
    if (blockedTasks.length > 0) {
      await supabase.from('tasks').update({ blocked_by: null }).eq('blocked_by', task.id)
      setTasks(prev => prev.map(t => t.blocked_by === task.id ? { ...t, blocked_by: null } : t))
    }

    // Auto-create next recurring task (legacy completion-spawn). Recurrence-series
    // instances are materialized by the scheduled generator instead — skip them.
    if (task.recurring && task.due_date && !task.recurrence_id) {
      const interval = task.recurring_interval || 1
      const nextDate = new Date(task.due_date + 'T00:00:00')
      if (task.recurring === 'daily') nextDate.setDate(nextDate.getDate() + interval)
      else if (task.recurring === 'weekly') nextDate.setDate(nextDate.getDate() + (7 * interval))
      else if (task.recurring === 'monthly') nextDate.setMonth(nextDate.getMonth() + interval)
      const recurringAssignees = mergeAssigneeIds(task.assigned_to, task.assignee_ids)
      const { data: newRecurring } = await supabase.from('tasks').insert({
        title: task.title, description: task.description, priority: task.priority,
        assigned_to: recurringAssignees[0] ?? null, production_id: task.production_id,
        needs_equipment: task.needs_equipment,
        purchase_request: task.purchase_request,
        purchase_request_link: task.purchase_request_link,
        hide_from_signage: task.hide_from_signage,
        recurring: task.recurring,
        recurring_interval: task.recurring_interval, status: 'pending',
        due_date: nextDate.toISOString().split('T')[0], created_by: task.created_by,
      }).select('*, productions(id,title,production_number,request_type_label,start_datetime,status)').single()
      if (newRecurring) {
        const assignee_ids = await replaceTaskAssignees(
          supabase,
          newRecurring.id,
          recurringAssignees,
          currentUser?.id,
        ).catch(() => recurringAssignees)
        setTasks(prev => [
          {
            ...newRecurring,
            assignee_ids,
            assigned_to: assignee_ids[0] ?? null,
          },
          ...prev,
        ])
      }
    }

    if (selectedTask?.id === task.id) closePanel()
    const completed = { ...task, status: 'complete', completed_at: new Date().toISOString() }
    setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== task.id))
      setCompletedTasks(prev => [completed, ...prev])
      setCompleting(prev => { const n = new Set(prev); n.delete(task.id); return n })
    }, 600)
  }, [supabase, tasks, selectedTask, closePanel, currentUser?.id])

  const reopenTask = useCallback(async (task: Task) => {
    const { error } = await supabase.from('tasks').update({ status: 'pending', completed_at: null }).eq('id', task.id)
    if (error) { toast('Failed to reopen task', 'error'); return }
    setCompletedTasks(prev => prev.filter(t => t.id !== task.id))
    setTasks(prev => [{ ...task, status: 'pending', completed_at: null }, ...prev])
  }, [supabase])

  const addSubtask = async () => {
    if (!newSubtask.trim() || !selectedTask) return
    const { data, error } = await supabase.from('subtasks').insert({ task_id: selectedTask.id, title: newSubtask.trim(), sort_order: subtasks.length }).select('*').single()
    if (error) { toast('Failed to add subtask', 'error'); return }
    if (data) setSubtasks(prev => [...prev, data])
    setNewSubtask('')
  }
  const toggleSubtask = async (sub: Subtask) => {
    const updates = { completed: !sub.completed, completed_at: !sub.completed ? new Date().toISOString() : null }
    const { error } = await supabase.from('subtasks').update(updates).eq('id', sub.id)
    if (error) { toast('Failed to update subtask', 'error'); return }
    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, ...updates } : s))
  }
  const removeSubtask = async (id: string) => {
    const { error } = await supabase.from('subtasks').delete().eq('id', id)
    if (error) { toast('Failed to remove subtask', 'error'); return }
    setSubtasks(prev => prev.filter(s => s.id !== id))
  }

  const addTimeEntry = async () => {
    if (!newTimeHours || !selectedTask || !currentUser) return
    const { data, error } = await supabase.from('time_entries').insert({ task_id: selectedTask.id, user_id: currentUser.id, hours: parseFloat(newTimeHours), description: newTimeDesc || null }).select('*, user:team!time_entries_user_id_fkey(name)').single()
    if (error) { toast('Failed to add time entry', 'error'); return }
    if (data) setTimeEntries(prev => [data as any, ...prev])
    setNewTimeHours(''); setNewTimeDesc('')
  }
  const removeTimeEntry = async (id: string) => {
    const { error } = await supabase.from('time_entries').delete().eq('id', id)
    if (error) { toast('Failed to remove time entry', 'error'); return }
    setTimeEntries(prev => prev.filter(e => e.id !== id))
  }

  const formatDate = useCallback((d: string | null): { label: string; color: string } | null => {
    if (!d) return null
    const diff = daysFromToday(d)
    if (diff === null) return null
    if (diff < 0) return { label: 'Overdue', color: danger }
    if (diff === 0) return { label: 'Today', color: warning }
    if (diff === 1) return { label: 'Tomorrow', color: warning }
    if (diff <= 7) return { label: `${diff}d`, color: muted }
    return { label: parseDueLocal(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: muted }
  }, [danger, warning, muted])

  const formatEventDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const eventCountdown = (d: string | null): { label: string; color: string } | null => {
    if (!d) return null
    const eventDay = new Date(d)
    eventDay.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = Math.round((eventDay.getTime() - today.getTime()) / 86400000)
    if (diff < 0) return { label: 'Event passed', color: muted }
    if (diff === 0) return { label: 'Event is TODAY', color: danger }
    if (diff === 1) return { label: 'Event tomorrow', color: warning }
    if (diff <= 7) return { label: `Event in ${diff} days`, color: warning }
    return { label: `Event in ${diff} days`, color: muted }
  }

  // Scope-aware source for chip counts and briefing — keeps numbers honest with the visible list
  const scopedTasks = useMemo(() => tasks.filter(t => {
    if (scope === 'mine') return taskHasAssignee(t.assignee_ids, t.assigned_to, currentUser?.id)
    if (scope === 'unassigned') return taskIsUnassigned(t.assignee_ids, t.assigned_to)
    return true
  }), [tasks, scope, currentUser?.id])

  const scopedCompleted = useMemo(() => completedTasks.filter(t => {
    if (scope === 'mine') return taskHasAssignee(t.assignee_ids, t.assigned_to, currentUser?.id)
    if (scope === 'unassigned') return taskIsUnassigned(t.assignee_ids, t.assigned_to)
    return true
  }), [completedTasks, scope, currentUser?.id])

  const counts = useMemo(() => ({
    today: scopedTasks.filter(t => daysFromToday(t.due_date) === 0).length,
    overdue: scopedTasks.filter(t => { const d = daysFromToday(t.due_date); return d !== null && d < 0 }).length,
    thisWeek: scopedTasks.filter(t => { const d = daysFromToday(t.due_date); return d !== null && d >= 0 && d <= 7 }).length,
    open: scopedTasks.length,
    recentDone: scopedCompleted.filter(t => t.completed_at && (Date.now() - new Date(t.completed_at).getTime()) / 86400000 <= 7).length,
  }), [scopedTasks, scopedCompleted])

  const briefingText = useMemo(() => {
    const parts: string[] = []
    if (counts.today > 0) parts.push(`${counts.today} due today`)
    if (counts.overdue > 0) parts.push(`${counts.overdue} overdue`)
    parts.push(`${counts.open} open`)
    return parts.join(' · ')
  }, [counts])

  const filtered = useMemo(() => {
    const source = focusFilter === 'recent-done' ? scopedCompleted : scopedTasks
    return source.filter(t => {
      // Open-task views always show all tasks; focus chips are informational.
      // Only "Recent done" is an explicit filtered view.
      if (focusFilter === 'recent-done') {
        if (!t.completed_at) return false
        if ((Date.now() - new Date(t.completed_at).getTime()) / 86400000 > 7) return false
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hit = t.title.toLowerCase().includes(q)
          || (t.description || '').toLowerCase().includes(q)
          || (t.productions?.title || '').toLowerCase().includes(q)
          || (t.scanned_sheet_id || '').toLowerCase().includes(q)
        if (!hit) return false
      }
      if (productionFilterId && t.production_id !== productionFilterId) return false
      return true
    })
  }, [scopedTasks, scopedCompleted, focusFilter, statusFilter, search, productionFilterId])

  const regularFiltered = useMemo(() => filtered.filter(t => t.source !== 'checklist'), [filtered])
  const checklistFiltered = useMemo(() => filtered.filter(t => t.source === 'checklist'), [filtered])

  const grouped = useMemo<{ label: string | null; tasks: Task[] }[]>(() => {
    if (groupBy === 'none') return [{ label: null, tasks: regularFiltered }]
    if (groupBy === 'priority') {
      const order = ['day of', 'high', 'normal', 'low']
      const groups: Record<string, Task[]> = {}
      regularFiltered.forEach(t => { if (!groups[t.priority]) groups[t.priority] = []; groups[t.priority].push(t) })
      return order.filter(p => groups[p]).map(p => ({ label: p, tasks: groups[p] }))
    }
    if (groupBy === 'person') {
      const groups: Record<string, Task[]> = {}
      regularFiltered.forEach(t => {
        const ids = mergeAssigneeIds(t.assigned_to, t.assignee_ids)
        const labels = ids.length > 0 ? ids.map(id => getMember(id)?.name).filter(Boolean) as string[] : ['Unassigned']
        for (const n of labels) {
          if (!groups[n]) groups[n] = []
          groups[n].push(t)
        }
      })
      return Object.entries(groups).map(([label, tasks]) => ({ label, tasks }))
    }
    if (groupBy === 'status') {
      const order = ['pending', 'in progress', 'in review', 'complete']
      const groups: Record<string, Task[]> = {}
      regularFiltered.forEach(t => { if (!groups[t.status]) groups[t.status] = []; groups[t.status].push(t) })
      return order.filter(s => groups[s]).map(s => ({ label: s, tasks: groups[s] }))
    }
    return [{ label: null, tasks: regularFiltered }]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regularFiltered, groupBy, team])

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

  const inputStyle: React.CSSProperties = {
    width: '100%', background: surface2, border: `1px solid ${border}`, borderRadius: '8px',
    padding: '9px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  const intakeNeedsAttention = intakeRotateNotice || (intakeActive && intakeNeedsLegacyRotate && !intakeUrlReveal)

  const intakeCollapsedSummary = useMemo(() => {
    if (intakePanelLoading) return 'Loading status…'
    if (intakeRotateNotice) return 'Link rotated — share the new URL or QR'
    if (intakeActive && intakeNeedsLegacyRotate && !intakeUrlReveal) return 'Rotate link once to show URL and QR'
    if (intakeActive && intakeUrlReveal) {
      const parts = ['Link active']
      if (intakeLastUsedAt) {
        parts.push(`Last used ${new Date(intakeLastUsedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
      }
      return parts.join(' · ')
    }
    if (intakeActive) return 'Link active'
    return 'No intake link'
  }, [intakePanelLoading, intakeRotateNotice, intakeActive, intakeNeedsLegacyRotate, intakeUrlReveal, intakeLastUsedAt])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>
  if (loadError) {
    return (
      <div style={{ padding: '32px', maxWidth: '520px' }}>
        <p style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--text-primary)' }}>
          Could not load tasks.
        </p>
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--text-muted)' }}>{loadError}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          style={{
            fontSize: '14px',
            padding: '9px 18px',
            borderRadius: '8px',
            background: 'var(--brand-primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  const renderStatusPill = (status: string) => {
    const tone = STATUS_TONE[status]
    if (!tone) {
      return <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px', background: surface2, color: muted, whiteSpace: 'nowrap' as const }}>{status}</span>
    }
    return <span style={{ ...statusBadge(tone, true), fontSize: '11px', whiteSpace: 'nowrap' as const }}>{status}</span>
  }

  const renderPriorityPill = (priority: string) => {
    const tone = PRIORITY_TONE[priority]
    if (!tone) return null
    return <span style={{ ...statusBadge(tone, true), fontSize: '11px', whiteSpace: 'nowrap' as const }}>{priority === 'day of' ? 'Day of' : priority}</span>
  }

  const sectionToggle = (label: string, open: boolean, onToggle: () => void, count?: number, action?: ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${border}`, gap: '10px' }}>
      <button onClick={onToggle} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', color: text, fontSize: '13px', fontWeight: 600 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
        <span>{label}</span>
        {typeof count === 'number' && <span style={{ fontSize: '11px', color: muted, fontWeight: 500 }}>({count})</span>}
      </button>
      {action}
    </div>
  )

  const activeProductionFilter = productionFilterId
    ? myProductions.find(p => p.id === productionFilterId) || null
    : null

  return (
    <div className="tasks-shell" style={{ maxWidth: '1760px', margin: '0 auto' }}>
      <div className="tasks-layout" style={{ display: 'flex', gap: denseMode ? '14px' : '20px', alignItems: 'flex-start' }}>
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* HEADER */}
          <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: denseMode ? '14px' : '24px', gap: '12px', flexWrap: 'wrap' as const }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 700, color: text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Tasks</h1>
              <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{briefingText}<span style={{ opacity: 0.9 }}> · Alt+Shift+N new task</span></p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
              <button
                type="button"
                title="New task (Alt+Shift+N)"
                onClick={() => {
                  setShowNewTask(v => {
                    const next = !v
                    if (next) {
                      setNewTask(p => ({
        ...p,
        assignee_ids: p.assignee_ids.length > 0 ? p.assignee_ids : currentUser?.id ? [currentUser.id] : [],
      }))
                    }
                    return next
                  })
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', padding: '9px 16px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New task
              </button>
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
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: '220px', background: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '6px', zIndex: 50, boxShadow: 'var(--shadow-raised)' }}>
                  {!isStudentInternUser && (
                    <>
                      <button onClick={() => { setShowTemplates(true); setShowOverflow(false) }} style={overflowItem(text)}>Templates &amp; saved sets</button>
                      <div style={{ height: '1px', background: border, margin: '4px 6px' }} />
                    </>
                  )}
                  <div style={{ padding: '6px 10px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: muted, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Group by</p>
                    <select value={groupBy} onChange={e => { setGroupBy(e.target.value as Grouping); setShowOverflow(false) }} style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}>
                      <option value="none">None</option>
                      <option value="status">Status</option>
                      <option value="priority">Priority</option>
                      <option value="person">Person</option>
                    </select>
                  </div>
                  <div style={{ padding: '6px 10px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: muted, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Status filter</p>
                    <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setShowOverflow(false) }} style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}>
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="in progress">In progress</option>
                      <option value="in review">In review</option>
                    </select>
                  </div>
                  {focusFilter === 'recent-done' && completedTasks.length > 0 && (
                    <>
                      <div style={{ height: '1px', background: border, margin: '4px 6px' }} />
                      <button onClick={() => { clearCompleted(); setShowOverflow(false) }} style={{ ...overflowItem(danger), color: danger }}>Clear all completed</button>
                    </>
                  )}
                </div>
                )}
              </div>
            </div>
          </header>

          {!isStudentInternUser && (
            <section style={{ ...uiStyles.card, padding: denseMode ? '12px 14px' : '14px 18px', marginBottom: denseMode ? '12px' : '20px' }}>
              <button
                type="button"
                onClick={() => setIntakePanelOpen(v => !v)}
                aria-expanded={intakePanelOpen}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap' as const,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                  textAlign: 'left' as const,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1, minWidth: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" style={{ flexShrink: 0, marginTop: '3px', transform: intakePanelOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} aria-hidden><polyline points="9 18 15 12 9 6"/></svg>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 700, color: text, margin: '0 0 2px' }}>Public task intake</h2>
                    <p style={{ fontSize: '12px', color: intakeNeedsAttention ? warning : muted, margin: 0, lineHeight: 1.4 }}>{intakeCollapsedSummary}</p>
                  </div>
                </div>
                {!intakePanelOpen && intakeNeedsAttention && (
                  <span style={{ ...statusBadge('warning', true), fontSize: '11px', flexShrink: 0 }}>Action needed</span>
                )}
              </button>

              {intakePanelOpen && (
              <>
              <p style={{ fontSize: '12px', color: muted, margin: '12px 0 0', lineHeight: 1.45 }}>
                Anyone with your magic link can submit a task with the same fields as &ldquo;New task&rdquo;. Submissions are assigned to you until you reassign them. The link and QR stay on this page until you rotate or revoke. If you rotate the link, anyone using the old URL or QR should contact <strong style={{ color: text }}>CSDtv</strong> for the new one.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const, alignItems: 'center', marginTop: '12px' }}>
                <button type="button" disabled={intakeBusy} onClick={generateIntakeLink} style={{ fontSize: '13px', fontWeight: 600, padding: '8px 14px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: intakeBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: intakeBusy ? 0.7 : 1 }}>
                  {intakeActive ? 'Rotate link' : 'Create magic link'}
                </button>
                {intakeActive && (
                  <button type="button" disabled={intakeBusy} onClick={revokeIntakeLink} style={{ fontSize: '13px', fontWeight: 600, padding: '8px 14px', borderRadius: '8px', background: 'transparent', color: danger, border: `1px solid ${danger}`, cursor: intakeBusy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                    Revoke link
                  </button>
                )}
              </div>
              {intakePanelLoading && <p style={{ fontSize: '12px', color: muted, margin: '10px 0 0' }}>Loading intake status…</p>}
              {!intakePanelLoading && intakeRotateNotice && (
                <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '10px', background: warningBg, border: `1px solid ${warning}55`, fontSize: '12px', color: text, lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' as const }}>
                  <span>
                    <strong>Link rotated.</strong> Anyone using the previous URL or QR should <strong>contact CSDtv</strong> for the new link. Share the new URL or QR from this page with people who should submit tasks.
                  </span>
                  <button type="button" onClick={() => setIntakeRotateNotice(false)} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', background: cardBg, border: `1px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    Dismiss
                  </button>
                </div>
              )}
              {!intakePanelLoading && intakeActive && intakeNeedsLegacyRotate && !intakeUrlReveal && (
                <p style={{ fontSize: '12px', color: muted, margin: '10px 0 0', lineHeight: 1.45 }}>
                  Your intake link was created before the hub could store it here. Click <strong style={{ color: text }}>Rotate link</strong> once to save your permanent URL and QR on this page. Anyone on the old link will need to <strong style={{ color: text }}>contact CSDtv</strong> for the new link.
                  {intakeLastUsedAt && <span> Last submission: {new Date(intakeLastUsedAt).toLocaleString()}</span>}
                </p>
              )}
              {intakeUrlReveal && (
                <div style={{ marginTop: '14px', display: 'flex', gap: '16px', flexWrap: 'wrap' as const, alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: muted, marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Magic link</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                      <input readOnly value={intakeUrlReveal} style={{ ...inputStyle, flex: 1, fontSize: '12px' }} onFocus={e => e.currentTarget.select()} />
                      <button type="button" onClick={copyIntakeUrl} style={{ fontSize: '13px', fontWeight: 600, padding: '0 14px', borderRadius: '8px', background: surface2, color: text, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Copy</button>
                    </div>
                  </div>
                  {intakeQrDataUrl && (
                    <div style={{ flexShrink: 0, textAlign: 'center' as const }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>QR</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={intakeQrDataUrl} alt="QR code for task intake link" width={200} height={200} style={{ display: 'block', borderRadius: '8px', border: `1px solid ${border}` }} />
                    </div>
                  )}
                  {canPublishTaskSignageIntake(currentUser?.role) && (
                    <div style={{ flex: '1 1 100%', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${border}`, background: cardBg }}>
                      <p style={{ fontSize: '12px', color: text, margin: '0 0 10px', lineHeight: 1.45 }}>
                        <strong>Task ops signage</strong> — the wall at <code style={{ fontSize: '11px' }}>/signage/tasks</code> can show this QR after you publish.{' '}
                        {sameTaskIntakeUrl(signageTaskIntakeUrl, intakeUrlReveal)
                          ? 'This link is what the board is set to use.'
                          : signageTaskIntakeUrl
                            ? 'The board may still use a different URL — update below if you want the wall to match this link.'
                            : 'Nothing is published yet for the wall QR.'}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
                        {!sameTaskIntakeUrl(signageTaskIntakeUrl, intakeUrlReveal) && (
                          <button
                            type="button"
                            disabled={signageTaskIntakeBusy}
                            onClick={publishIntakeToTaskSignage}
                            style={{ fontSize: '13px', fontWeight: 600, padding: '8px 14px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: signageTaskIntakeBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: signageTaskIntakeBusy ? 0.7 : 1 }}
                          >
                            {signageTaskIntakeUrl ? 'Update signage to this link' : 'Publish this link to task signage'}
                          </button>
                        )}
                        {sameTaskIntakeUrl(signageTaskIntakeUrl, intakeUrlReveal) && (
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e' }}>Published on task signage</span>
                        )}
                        {signageTaskIntakeUrl && (
                          <button
                            type="button"
                            disabled={signageTaskIntakeBusy}
                            onClick={clearTaskSignageIntake}
                            style={{ fontSize: '13px', fontWeight: 600, padding: '8px 14px', borderRadius: '8px', background: 'transparent', color: muted, border: `1px solid ${border}`, cursor: signageTaskIntakeBusy ? 'default' : 'pointer', fontFamily: 'inherit' }}
                          >
                            Remove from signage
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              </>
              )}
            </section>
          )}

          {/* FOCUS ZONE */}
          <section style={{ ...uiStyles.zoneSection, marginBottom: denseMode ? '12px' : '20px' }}>
            <ZoneHeader
              label="Focus"
              hint="Pick what matters now"
            />
            <div className="focus-chips" style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px' }}>
              {focusChip('today', 'Today', counts.today, 'info')}
              {focusChip('overdue', 'Overdue', counts.overdue, 'danger')}
              {focusChip('this-week', 'This week', counts.thisWeek, 'warning')}
              {focusChip('all', 'All open', counts.open, null)}
              {focusChip('recent-done', 'Recent done', counts.recentDone, 'success')}
            </div>
          </section>

          {/* SCOPE / SEARCH ROW */}
          <section style={{ marginBottom: denseMode ? '12px' : '20px' }}>
            <div className="scope-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const }}>
              {!isStudentInternUser && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  {scopeBtn('mine', 'Mine')}
                  {scopeBtn('team', 'Team')}
                  {scopeBtn('unassigned', 'Unassigned')}
                </div>
              )}
              <div className="search-wrap" style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 12px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: text, fontFamily: 'inherit' }} />
                {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>}
              </div>
              <button
                onClick={() => setDenseMode(v => !v)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: `1px solid ${border}`,
                  background: denseMode ? surface2 : cardBg,
                  color: denseMode ? text : muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {denseMode ? 'Dense mode on' : 'Dense mode off'}
              </button>
            </div>
            {(statusFilter !== 'all' || groupBy !== 'none') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const, marginTop: '10px', fontSize: '12px', color: muted }}>
                {statusFilter !== 'all' && (
                  <span style={{ ...statusBadge('info', true), fontSize: '11px' }}>
                    Status: {statusFilter} <button onClick={() => setStatusFilter('all')} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '4px', padding: 0, fontSize: '12px', lineHeight: 1 }}>×</button>
                  </span>
                )}
                {groupBy !== 'none' && (
                  <span style={{ ...statusBadge('info', true), fontSize: '11px' }}>
                    Grouped by: {groupBy} <button onClick={() => setGroupBy('none')} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '4px', padding: 0, fontSize: '12px', lineHeight: 1 }}>×</button>
                  </span>
                )}
              </div>
            )}
          </section>

          {/* MY PRODUCTIONS strip — collapsible */}
          {myProductions.length > 0 && (
            <section style={{ marginBottom: denseMode ? '12px' : '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <button onClick={() => setShowProductions(v => !v)} aria-expanded={showProductions} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', color: muted, fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase' as const }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showProductions ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                  My productions · {myProductions.length}
                </button>
              </div>
              {showProductions && (
                <div style={{ display: 'flex', gap: denseMode ? '6px' : '8px', flexWrap: 'wrap' as const }}>
                  {myProductions.map(p => {
                    const pct = Math.round((p.done / p.total) * 100)
                    const active = productionFilterId === p.id
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: denseMode ? '7px 10px' : '8px 14px', background: active ? statusTone.info.background : cardBg, border: `1px solid ${active ? info : border}`, borderRadius: '10px', minWidth: denseMode ? '170px' : '200px' }}
                      >
                        <button
                          onClick={() => {
                            setProductionFilterId(prev => prev === p.id ? null : p.id)
                            if (!isStudentInternUser) setScope('team')
                            setFocusFilter('all')
                          }}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textAlign: 'left', flex: 1, minWidth: 0 }}
                          title={active ? 'Clear production filter' : 'Filter tasks to this production'}
                        >
                          <p style={{ fontSize: denseMode ? '12px' : '13px', fontWeight: 700, color: active ? info : text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>#{p.production_number} {p.title}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <div style={{ flex: 1, height: '3px', background: surface2, borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? success : 'var(--brand-primary)' }} />
                            </div>
                            <span style={{ fontSize: '11px', color: active ? info : (pct === 100 ? success : muted), fontWeight: 600, flexShrink: 0 }}>{p.done}/{p.total}</span>
                          </div>
                        </button>
                        <Link href={`/dashboard/productions/${p.production_number}`} style={{ textDecoration: 'none', fontSize: '11px', color: muted, fontWeight: 700, whiteSpace: 'nowrap' as const }}>
                          Open →
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {activeProductionFilter && (
            <div style={{ marginBottom: denseMode ? '10px' : '14px' }}>
              <span style={{ ...statusBadge('info', true), fontSize: '11px' }}>
                Production filter: #{activeProductionFilter.production_number} {activeProductionFilter.title}
                <button onClick={() => setProductionFilterId(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '4px', padding: 0, fontSize: '12px', lineHeight: 1 }}>×</button>
              </span>
            </div>
          )}

          {/* NEW TASK FORM */}
          {showNewTask && (
            <div style={{ ...uiStyles.card, padding: denseMode ? '14px' : '18px', marginBottom: denseMode ? '12px' : '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: text, margin: '0 0 14px' }}>New task</h3>
              <input ref={newTaskTitleRef} value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Task title" style={{ ...inputStyle, marginBottom: '8px' }} />
              <textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const, marginBottom: '8px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <TaskAssigneePicker
                    team={team}
                    value={newTask.assignee_ids}
                    onChange={ids => setNewTask(p => ({ ...p, assignee_ids: ids }))}
                  />
                </div>
                <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))} style={inputStyle}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p === 'day of' ? 'Day of event' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
                <input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} />
              </div>
              <select value={newTask.production_id} onChange={e => setNewTask(p => ({ ...p, production_id: e.target.value }))} style={{ ...inputStyle, marginBottom: '12px' }}>
                <option value="">Not linked to a production</option>
                {allProductions.map(p => <option key={p.id} value={p.id}>#{p.production_number} — {p.title}</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <input type="checkbox" id="needs_equipment" checked={newTask.needs_equipment} onChange={e => setNewTask(p => ({ ...p, needs_equipment: e.target.checked }))} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }} />
                <label htmlFor="needs_equipment" style={{ fontSize: '13px', color: muted, cursor: 'pointer' }}>Needs equipment pulled</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: newTask.purchase_request ? '8px' : '12px' }}>
                <input
                  type="checkbox"
                  id="purchase_request"
                  checked={newTask.purchase_request}
                  onChange={e => setNewTask(p => ({ ...p, purchase_request: e.target.checked, purchase_request_link: e.target.checked ? p.purchase_request_link : '' }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                />
                <label htmlFor="purchase_request" style={{ fontSize: '13px', color: muted, cursor: 'pointer' }}>Purchase request</label>
              </div>
              {newTask.purchase_request && (
                <input
                  value={newTask.purchase_request_link}
                  onChange={e => setNewTask(p => ({ ...p, purchase_request_link: e.target.value }))}
                  placeholder="Purchase link (optional)"
                  style={{ ...inputStyle, marginBottom: '12px' }}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  id="hide_from_signage"
                  checked={newTask.hide_from_signage}
                  onChange={e => setNewTask(p => ({ ...p, hide_from_signage: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                />
                <label htmlFor="hide_from_signage" style={{ fontSize: '13px', color: muted, cursor: 'pointer' }}>Hide from task signage</label>
              </div>
              <div style={{ border: `1px solid ${border}`, borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '13px', color: muted }}>Repeat:</label>
                  <select
                    value={recur.frequency}
                    onChange={e => setRecur(p => ({ ...p, frequency: e.target.value as RecurrenceFormState['frequency'] }))}
                    style={{ ...inputStyle, width: 'auto', minWidth: '110px' }}
                  >
                    <option value="">Never</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {recur.frequency && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
                    {recur.frequency === 'weekly' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <label style={{ fontSize: '12px', color: muted }}>
                          Appears on
                          <select value={recur.showWeekday} onChange={e => setRecur(p => ({ ...p, showWeekday: Number(e.target.value) }))} style={{ ...inputStyle, marginTop: '3px' }}>
                            {WEEKDAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                          </select>
                        </label>
                        <label style={{ fontSize: '12px', color: muted }}>
                          Due on
                          <select value={recur.dueWeekday} onChange={e => setRecur(p => ({ ...p, dueWeekday: Number(e.target.value) }))} style={{ ...inputStyle, marginTop: '3px' }}>
                            {WEEKDAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                    {recur.frequency === 'monthly' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <label style={{ fontSize: '12px', color: muted }}>
                          Day of month
                          <input type="number" min={1} max={31} value={recur.showMonthday} onChange={e => setRecur(p => ({ ...p, showMonthday: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))} style={{ ...inputStyle, marginTop: '3px' }} />
                        </label>
                        <label style={{ fontSize: '12px', color: muted }}>
                          Due (days later)
                          <input type="number" min={0} value={recur.dueOffsetDays} onChange={e => setRecur(p => ({ ...p, dueOffsetDays: Math.max(0, Number(e.target.value) || 0) }))} style={{ ...inputStyle, marginTop: '3px' }} />
                        </label>
                      </div>
                    )}
                    {recur.frequency === 'daily' && (
                      <label style={{ fontSize: '12px', color: muted }}>
                        Due (days after it appears)
                        <input type="number" min={0} value={recur.dueOffsetDays} onChange={e => setRecur(p => ({ ...p, dueOffsetDays: Math.max(0, Number(e.target.value) || 0) }))} style={{ ...inputStyle, marginTop: '3px', maxWidth: '160px' }} />
                      </label>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <label style={{ fontSize: '12px', color: muted }}>
                        Starts
                        <input type="date" value={recur.startDate} onChange={e => setRecur(p => ({ ...p, startDate: e.target.value }))} style={{ ...inputStyle, marginTop: '3px' }} />
                      </label>
                      <label style={{ fontSize: '12px', color: muted }}>
                        Until (optional)
                        <input type="date" value={recur.endDate} onChange={e => setRecur(p => ({ ...p, endDate: e.target.value }))} style={{ ...inputStyle, marginTop: '3px' }} />
                      </label>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--brand-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                      {describeRecurrence(recur, newTask.assignee_ids.length)}
                    </p>
                    {newTask.assignee_ids.length === 0 && (
                      <p style={{ margin: 0, fontSize: '12px', color: statusTone.warning.color }}>
                        Pick who this repeats for in the assignees above — each person gets their own copy.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={createTask} style={{ fontSize: '14px', padding: '9px 18px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{recur.frequency ? 'Schedule recurring task' : 'Create task'}</button>
                <button onClick={() => setShowNewTask(false)} style={{ fontSize: '14px', padding: '9px 18px', borderRadius: '8px', background: 'transparent', color: muted, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          )}

          {/* TEMPLATES PANEL */}
          {showTemplates && !isStudentInternUser && (
            <div style={{ ...uiStyles.card, padding: denseMode ? '14px' : '18px', marginBottom: denseMode ? '12px' : '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: text, margin: 0 }}>Task templates</h3>
                <button onClick={() => setShowTemplates(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
              </div>
              {templates.length === 0 ? (
                <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>No templates yet. Create one from your current open tasks.</p>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  {templates.map(tpl => (
                    <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: `1px solid ${border}` }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: text, margin: 0 }}>{tpl.name}</p>
                        <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>{tpl.items?.length || 0} tasks</p>
                      </div>
                      <button onClick={() => applyTemplate(tpl)} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Apply</button>
                      <button onClick={() => { if (confirm(`Delete template "${tpl.name}"?`)) deleteTemplate(tpl.id) }} style={{ fontSize: '14px', padding: '6px 10px', borderRadius: '8px', background: dangerBg, color: danger, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveAsTemplate()} placeholder="Template name..." style={{ ...inputStyle, flex: 1 }} />
                <button onClick={saveAsTemplate} disabled={!newTemplateName.trim() || tasks.length === 0} style={{ fontSize: '13px', padding: '9px 14px', borderRadius: '8px', background: newTemplateName.trim() ? 'var(--brand-primary)' : surface2, color: newTemplateName.trim() ? '#fff' : muted, border: 'none', cursor: newTemplateName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' as const }}>Save current as template</button>
              </div>
              <p style={{ fontSize: '12px', color: muted, margin: '8px 0 0' }}>Saving captures all {tasks.length} open tasks.</p>
            </div>
          )}

          {/* BULK ACTION BAR */}
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: cardBg, border: `1px solid var(--brand-primary)`, borderRadius: '10px', marginBottom: '12px', fontSize: '13px', flexWrap: 'wrap' as const }}>
              <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>{selectedIds.size} selected</span>
              {focusFilter !== 'recent-done' && (
                <button onClick={async () => {
                  if (!confirm(`Mark ${selectedIds.size} tasks complete?`)) return
                  const ids = Array.from(selectedIds)
                  const completedAt = new Date().toISOString()
                  const { error } = await supabase.from('tasks').update({ status: 'complete', completed_at: completedAt }).in('id', ids)
                  if (error) { toast('Failed to bulk complete', 'error'); return }
                  const movedTasks = tasks.filter(t => selectedIds.has(t.id)).map(t => ({ ...t, status: 'complete', completed_at: completedAt }))
                  setTasks(prev => prev.filter(t => !selectedIds.has(t.id)))
                  setCompletedTasks(prev => [...movedTasks, ...prev])
                  if (selectedTask && selectedIds.has(selectedTask.id)) closePanel()
                  setSelectedIds(new Set())
                }} style={{ padding: '6px 12px', borderRadius: '6px', background: 'transparent', color: 'var(--brand-primary)', border: '1px solid var(--brand-primary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600 }}>Complete all</button>
              )}
              <select onChange={async e => {
                if (!e.target.value) return
                const ids = Array.from(selectedIds).filter(id => !id.startsWith('checklist:'))
                const newAssignee = e.target.value
                try {
                  for (const taskId of ids) {
                    await replaceTaskAssignees(supabase, taskId, [newAssignee], currentUser?.id)
                  }
                } catch {
                  toast('Failed to bulk assign', 'error')
                  e.target.value = ''
                  return
                }
                setTasks(prev =>
                  prev.map(t =>
                    selectedIds.has(t.id)
                      ? { ...t, assignee_ids: [newAssignee], assigned_to: newAssignee }
                      : t,
                  ),
                )
                setSelectedTask(prev =>
                  prev && selectedIds.has(prev.id)
                    ? { ...prev, assignee_ids: [newAssignee], assigned_to: newAssignee }
                    : prev,
                )
                setSelectedIds(new Set())
                e.target.value = ''
              }} style={{ padding: '6px 10px', borderRadius: '6px', background: cardBg, border: `1px solid ${border}`, color: text, fontFamily: 'inherit', fontSize: '12px' }}>
                <option value="">Assign to...</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button onClick={async () => {
                if (!confirm(`Delete ${selectedIds.size} tasks? This cannot be undone.`)) return
                const ids = Array.from(selectedIds)
                const { error } = await supabase.from('tasks').delete().in('id', ids)
                if (error) { toast('Failed to bulk delete', 'error'); return }
                setTasks(prev => prev.filter(t => !selectedIds.has(t.id)))
                setCompletedTasks(prev => prev.filter(t => !selectedIds.has(t.id)))
                if (selectedTask && selectedIds.has(selectedTask.id)) closePanel()
                setSelectedIds(new Set())
              }} style={{ padding: '6px 12px', borderRadius: '6px', background: dangerBg, color: danger, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>Delete</button>
              <button onClick={() => setSelectedIds(new Set())} style={{ padding: '6px 12px', borderRadius: '6px', background: 'transparent', color: muted, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', marginLeft: 'auto' }}>Clear</button>
            </div>
          )}

          {/* TASKS LIST */}
          {(regularFiltered.length + checklistFiltered.length) === 0 ? (
            <div style={{ ...uiStyles.card, padding: denseMode ? '36px 14px' : '60px 20px', textAlign: 'center' as const }}>
              <p style={{ color: muted, fontSize: '14px', margin: 0 }}>
                {focusFilter === 'today' ? 'Nothing due today.' :
                 focusFilter === 'overdue' ? 'No overdue tasks. Nice.' :
                 focusFilter === 'this-week' ? 'Nothing due this week.' :
                 focusFilter === 'recent-done' ? 'No tasks completed in the last 7 days.' :
                 'No tasks match your filters.'}
              </p>
              <p style={{ color: muted, fontSize: '12px', margin: '8px 0 0' }}>
                {productionFilterId ? 'Clear the production filter to see all open work.' :
                 search ? 'Try a shorter search or clear filters in the menu.' :
                 'Try switching scope, status, or opening Recent done.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: checklistFiltered.length > 0 ? 'minmax(0,1fr) minmax(280px,360px)' : '1fr', gap: denseMode ? '10px' : '14px', alignItems: 'start' }}>
              <div>
                {grouped.map(({ label, tasks: groupTasks }) => (
                  <div key={label || 'all'} style={{ marginBottom: '14px' }}>
                    {label && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>{label}</span>
                        <span style={{ fontSize: '11px', color: muted, opacity: 0.7 }}>· {groupTasks.length}</span>
                      </div>
                    )}
                    <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
                      {groupTasks.map((task, i) => {
                  const isCompleting = completing.has(task.id)
                  const isOpen = selectedTask?.id === task.id
                  const isBulkSelected = selectedIds.has(task.id)
                  const dateInfo = formatDate(task.due_date)
                  const assignees = getAssigneeMembers(task)
                  const subCount = subtaskCounts[task.id]
                  const statusColor = task.status === 'in progress' ? warning : task.status === 'in review' ? review : task.status === 'complete' ? success : 'transparent'
                  const rowBg = isOpen
                    ? 'rgba(91,163,224,0.10)'
                    : isCompleting
                    ? successBg
                    : isBulkSelected
                    ? hoverBg
                    : 'transparent'
                        return (
                    <div
                      key={task.id}
                      onClick={() => !isCompleting && openTask(task)}
                      style={{
                        position: 'relative',
                        display: 'flex', alignItems: 'center', gap: denseMode ? '8px' : '12px',
                        padding: denseMode ? '8px 10px' : '12px 16px',
                        borderBottom: i < groupTasks.length - 1 ? `1px solid ${border}` : 'none',
                        background: rowBg,
                        cursor: isCompleting ? 'default' : 'pointer',
                        transition: 'background 0.15s',
                        opacity: isCompleting ? 0.6 : 1,
                      }}
                      onMouseEnter={e => { if (!isOpen && !isCompleting && !isBulkSelected) (e.currentTarget as HTMLDivElement).style.background = hoverBg }}
                      onMouseLeave={e => { if (!isOpen && !isCompleting && !isBulkSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      {/* status edge */}
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: statusColor }} />

                      {/* bulk select */}
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onChange={() => setSelectedIds(prev => { const n = new Set(prev); if (n.has(task.id)) n.delete(task.id); else n.add(task.id); return n })}
                        onClick={e => e.stopPropagation()}
                        aria-label="Select task"
                        style={{ width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0, accentColor: 'var(--brand-primary)' }}
                      />

                      {/* complete / reopen button */}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (isCompleting) return
                          if (task.status === 'complete') reopenTask(task)
                          else completeTask(task)
                        }}
                        aria-label={task.status === 'complete' ? 'Reopen task' : 'Complete task'}
                        title={task.status === 'complete' ? 'Reopen' : 'Mark complete'}
                        disabled={isCompleting}
                        style={{
                          width: denseMode ? '18px' : '20px', height: denseMode ? '18px' : '20px', borderRadius: '6px', flexShrink: 0,
                          border: `1.5px solid ${task.status === 'complete' || isCompleting ? success : border}`,
                          background: task.status === 'complete' || isCompleting ? success : 'transparent',
                          cursor: isCompleting ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0, transition: 'all 0.15s',
                        }}
                      >
                        {(task.status === 'complete' || isCompleting) && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>

                      {/* main content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: denseMode ? '13px' : '14px', fontWeight: 600, color: isCompleting ? muted : text, margin: 0, textDecoration: isCompleting ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {task.title}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: denseMode ? '6px' : '8px', marginTop: '2px', fontSize: denseMode ? '11px' : '12px', color: muted, overflow: 'hidden' }}>
                          {task.productions?.title && (
                            <span style={{ color: info, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '48%', border: `1px solid ${info}`, borderRadius: '999px', padding: denseMode ? '1px 6px' : '2px 8px', fontWeight: 700 }}>
                              #{task.productions.production_number} {task.productions.title}
                            </span>
                          )}
                          {subCount && (
                            <span style={{ color: subCount.done === subCount.total ? success : muted, whiteSpace: 'nowrap' as const }}>
                              {subCount.done}/{subCount.total} subtasks
                            </span>
                          )}
                          {task.needs_equipment && <span style={{ color: warning, fontWeight: 600, whiteSpace: 'nowrap' as const }}>Equipment</span>}
                          {task.purchase_request && <span style={{ color: info, fontWeight: 600, whiteSpace: 'nowrap' as const }}>Purchase</span>}
                          {task.hide_from_signage && task.source !== 'checklist' && <span style={{ color: muted, fontWeight: 600, whiteSpace: 'nowrap' as const }}>Off signage</span>}
                          {task.source === 'checklist' && <span style={{ color: info, fontWeight: 700, whiteSpace: 'nowrap' as const }}>Checklist</span>}
                          {task.intake_source === 'magic_link' && <span style={{ color: review, fontWeight: 700, whiteSpace: 'nowrap' as const }}>Intake</span>}
                          {(task.recurring || task.recurrence_id) && <span style={{ whiteSpace: 'nowrap' as const }}>Recurring</span>}
                          {task.blocked_by && <span style={{ color: review, whiteSpace: 'nowrap' as const, fontWeight: 600 }}>Blocked</span>}
                        </div>
                      </div>

                      {/* right meta */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {renderPriorityPill(task.priority)}
                        {task.status !== 'pending' && renderStatusPill(task.status)}
                        {task.status !== 'complete' && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); if (!isCompleting) completeTask(task) }}
                            disabled={isCompleting}
                            title="Mark complete"
                            style={{ padding: denseMode ? '4px 8px' : '5px 10px', borderRadius: '999px', background: 'transparent', color: 'var(--brand-primary)', border: '1px solid var(--brand-primary)', cursor: isCompleting ? 'default' : 'pointer', fontSize: denseMode ? '10px' : '11px', fontWeight: 700, fontFamily: 'inherit', opacity: isCompleting ? 0.5 : 1 }}
                          >
                            Complete
                          </button>
                        )}
                        {dateInfo && <span style={{ fontSize: '12px', color: dateInfo.color, fontWeight: 600, whiteSpace: 'nowrap' as const, minWidth: '52px', textAlign: 'right' as const }}>{dateInfo.label}</span>}
                        {assignees.length > 0 ? (
                          <div style={{ display: 'flex', flexShrink: 0 }}>
                            {assignees.slice(0, 3).map((a, ai) => (
                              <div
                                key={a.id}
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  background: a.avatar_color,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: '#0a0f1e',
                                  marginLeft: ai > 0 ? '-8px' : 0,
                                  border: `2px solid ${cardBg}`,
                                }}
                                title={a.name}
                              >
                                {a.name.slice(0, 2).toUpperCase()}
                              </div>
                            ))}
                            {assignees.length > 3 ? (
                              <span style={{ fontSize: '10px', color: muted, marginLeft: '4px' }}>+{assignees.length - 3}</span>
                            ) : null}
                          </div>
                        ) : (
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: `1.5px dashed ${border}`, flexShrink: 0 }} />
                        )}
                      </div>
                    </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {checklistFiltered.length > 0 && (
                <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
                  <div style={{ padding: denseMode ? '8px 10px' : '10px 12px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: info, textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>
                      Production checklist
                    </p>
                    <span style={{ fontSize: '11px', color: muted }}>{checklistFiltered.length}</span>
                  </div>
                  {checklistFiltered.map((task, i) => (
                    <div key={task.id} style={{ padding: denseMode ? '8px 10px' : '10px 12px', borderBottom: i < checklistFiltered.length - 1 ? `1px solid ${border}` : 'none' }}>
                      <p style={{ margin: 0, fontSize: denseMode ? '12px' : '13px', fontWeight: 600, color: text }}>{task.title}</p>
                      <p style={{ margin: '3px 0 8px', fontSize: '11px', color: info, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {task.productions ? `#${task.productions.production_number} ${task.productions.title}` : 'Linked production'}
                      </p>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => completeTask(task)}
                          title="Mark checklist item complete"
                          style={{ padding: '4px 8px', borderRadius: '999px', background: 'transparent', color: 'var(--brand-primary)', border: '1px solid var(--brand-primary)', cursor: 'pointer', fontSize: '10px', fontWeight: 700, fontFamily: 'inherit' }}
                        >
                          Complete
                        </button>
                        {task.productions?.production_number && (
                          <Link href={`/dashboard/productions/${task.productions.production_number}`} style={{ padding: '4px 8px', borderRadius: '999px', background: surface2, color: muted, border: `1px solid ${border}`, fontSize: '10px', fontWeight: 700, textDecoration: 'none' }}>
                            Open production
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* DETAIL DRAWER */}
        {selectedTask && (
          <>
            <div className="drawer-backdrop" onClick={closePanel} />
            <aside className="drawer-panel" style={{ flexShrink: 0, background: cardBg, border: `1px solid ${border}`, borderRadius: '16px', overflowY: 'auto' as const }}>
              <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${border}`, position: 'sticky' as const, top: 0, background: cardBg, zIndex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>Task detail</span>
                <button onClick={closePanel} aria-label="Close detail" style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: 0 }}>×</button>
              </header>

              <div style={{ padding: '14px 18px' }}>
                {/* TITLE */}
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onBlur={() => { if (editTitle !== selectedTask.title) updateTask(selectedTask.id, { title: editTitle }) }}
                  style={{ fontSize: '17px', fontWeight: 700, color: text, lineHeight: 1.3, background: 'transparent', border: 'none', borderBottom: `1px solid transparent`, padding: '4px 0', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit', outline: 'none', marginBottom: '14px' }}
                  onFocus={e => (e.currentTarget as HTMLInputElement).style.borderBottomColor = border}
                  onMouseEnter={e => { if (document.activeElement !== e.currentTarget) (e.currentTarget as HTMLInputElement).style.borderBottomColor = border }}
                  onMouseLeave={e => { if (document.activeElement !== e.currentTarget) (e.currentTarget as HTMLInputElement).style.borderBottomColor = 'transparent' }}
                />

                {/* CHIP ROW: status / priority / due / assignee */}
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px', marginBottom: '14px' }}>
                  <select value={selectedTask.status} onChange={e => updateTask(selectedTask.id, { status: e.target.value })} style={chipSelect(STATUS_TONE[selectedTask.status] || null)}>
                    <option value="pending">Pending</option>
                    <option value="in progress">In progress</option>
                    <option value="in review">In review</option>
                    <option value="complete">Complete</option>
                  </select>
                  <select value={selectedTask.priority} onChange={e => updateTask(selectedTask.id, { priority: e.target.value })} style={chipSelect(PRIORITY_TONE[selectedTask.priority] || null)}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p === 'day of' ? 'Day of event' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                  <input type="date" value={selectedTask.due_date || ''} onChange={e => updateTask(selectedTask.id, { due_date: e.target.value || null })} style={chipSelect(dueDateTone(selectedTask.due_date))} />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '11px', color: muted, fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>Assigned to</p>
                  <TaskAssigneePicker
                    team={team}
                    value={mergeAssigneeIds(selectedTask.assigned_to, selectedTask.assignee_ids)}
                    onChange={ids =>
                      void setTaskAssignees(
                        selectedTask.id,
                        ids,
                        selectedTask.title,
                        mergeAssigneeIds(selectedTask.assigned_to, selectedTask.assignee_ids),
                      )
                    }
                  />
                </div>

                {selectedTask.intake_source === 'magic_link' && (selectedTask.intake_submitter_name || selectedTask.intake_submitter_email) && (
                  <div style={{ background: statusTone.review.background, borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', border: `1px solid ${border}` }}>
                    <p style={{ fontSize: '11px', color: muted, fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>Submitted via magic link</p>
                    {selectedTask.intake_submitter_name && <p style={{ fontSize: '13px', color: text, margin: '0 0 4px' }}>{selectedTask.intake_submitter_name}</p>}
                    {selectedTask.intake_submitter_email && (
                      <a href={`mailto:${selectedTask.intake_submitter_email}`} style={{ fontSize: '13px', color: info, textDecoration: 'none', wordBreak: 'break-all' as const }} onClick={e => e.stopPropagation()}>{selectedTask.intake_submitter_email}</a>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  {selectedTask.status === 'complete' ? (
                    <button
                      onClick={() => reopenTask(selectedTask)}
                      style={{ fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: cardBg, color: text, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                    >
                      Reopen task
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => completeTask(selectedTask)}
                      style={{ fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'transparent', color: 'var(--brand-primary)', border: '1px solid var(--brand-primary)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                    >
                      Mark complete
                    </button>
                  )}
                </div>

                {/* LINKED PRODUCTION */}
                {selectedTask.productions && (
                  <div style={{ background: surface2, borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', border: `1px solid ${border}` }}>
                    <p style={{ fontSize: '11px', color: info, fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>Linked production</p>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: text, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>#{selectedTask.productions.production_number} {selectedTask.productions.title}</p>
                    {selectedTask.productions.request_type_label && <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>{selectedTask.productions.request_type_label}</p>}
                    {selectedTask.productions.start_datetime && <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>{formatEventDate(selectedTask.productions.start_datetime)}</p>}
                    {(() => { const c = eventCountdown(selectedTask.productions.start_datetime); return c ? <p style={{ fontSize: '12px', fontWeight: 600, color: c.color, margin: '0 0 8px' }}>{c.label}</p> : null })()}
                    <Link href={`/dashboard/productions/${selectedTask.productions.production_number}`} style={{ fontSize: '12px', color: info, textDecoration: 'none', fontWeight: 600 }}>Open production →</Link>
                  </div>
                )}

                {/* CHANGE PRODUCTION LINK */}
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: 700 }}>Production link</p>
                  <select value={selectedTask.production_id || ''} onChange={e => {
                    const newProdId = e.target.value || null
                    const linkedProd = newProdId ? allProductions.find(p => p.id === newProdId) || null : null
                    updateTask(selectedTask.id, { production_id: newProdId } as Partial<Task>)
                    setSelectedTask(prev => prev ? { ...prev, production_id: newProdId, productions: linkedProd } : prev)
                  }} style={{ ...inputStyle, fontSize: '13px' }}>
                    <option value="">No production linked</option>
                    {allProductions.map(p => <option key={p.id} value={p.id}>#{p.production_number} — {p.title}</option>)}
                  </select>
                </div>

                {/* EQUIPMENT */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '11px 13px', background: selectedTask.needs_equipment ? statusTone.warning.background : surface2, borderRadius: '10px', border: `1px solid ${selectedTask.needs_equipment ? warning : border}`, cursor: 'pointer' }}
                  onClick={() => updateTask(selectedTask.id, { needs_equipment: !selectedTask.needs_equipment })}>
                  <input type="checkbox" checked={selectedTask.needs_equipment} onChange={() => {}} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }} />
                  <span style={{ fontSize: '13px', color: selectedTask.needs_equipment ? warning : muted, fontWeight: selectedTask.needs_equipment ? 700 : 500 }}>Needs equipment pulled</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: selectedTask.purchase_request ? '8px' : '14px', padding: '11px 13px', background: selectedTask.purchase_request ? statusTone.info.background : surface2, borderRadius: '10px', border: `1px solid ${selectedTask.purchase_request ? info : border}`, cursor: 'pointer' }}
                  onClick={() => updateTask(selectedTask.id, { purchase_request: !selectedTask.purchase_request, purchase_request_link: selectedTask.purchase_request ? null : selectedTask.purchase_request_link })}>
                  <input type="checkbox" checked={selectedTask.purchase_request} onChange={() => {}} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }} />
                  <span style={{ fontSize: '13px', color: selectedTask.purchase_request ? info : muted, fontWeight: selectedTask.purchase_request ? 700 : 500 }}>Purchase request</span>
                </div>
                {selectedTask.purchase_request && (
                  <div style={{ marginBottom: '14px' }}>
                    <input
                      value={selectedTask.purchase_request_link || ''}
                      onChange={e => updateTask(selectedTask.id, { purchase_request_link: e.target.value || null })}
                      placeholder="Purchase link (optional)"
                      style={{ ...inputStyle, fontSize: '13px' }}
                    />
                    {selectedTask.purchase_request_link && (
                      <a
                        href={selectedTask.purchase_request_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-block', marginTop: '6px', fontSize: '12px', color: info, textDecoration: 'none', fontWeight: 600 }}
                      >
                        Open purchase link →
                      </a>
                    )}
                  </div>
                )}

                {selectedTask.source !== 'checklist' && (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '11px 13px', background: surface2, borderRadius: '10px', border: `1px solid ${selectedTask.hide_from_signage ? muted : border}`, cursor: 'pointer' }}
                    onClick={() => updateTask(selectedTask.id, { hide_from_signage: !selectedTask.hide_from_signage })}
                  >
                    <input type="checkbox" checked={!!selectedTask.hide_from_signage} onChange={() => {}} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }} />
                    <span style={{ fontSize: '13px', color: selectedTask.hide_from_signage ? text : muted, fontWeight: selectedTask.hide_from_signage ? 600 : 500 }}>Hide from task signage</span>
                  </div>
                )}

                {/* BLOCKED BY */}
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: 700 }}>Blocked by</p>
                  <select value={selectedTask.blocked_by || ''} onChange={e => updateTask(selectedTask.id, { blocked_by: e.target.value || null } as Partial<Task>)} style={{ ...inputStyle, fontSize: '13px' }}>
                    <option value="">Not blocked</option>
                    {tasks.filter(t => t.id !== selectedTask.id).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  {selectedTask.blocked_by && (() => {
                    const blocker = tasks.find(t => t.id === selectedTask.blocked_by)
                    return blocker ? (
                      <p style={{ fontSize: '12px', color: review, margin: '6px 0 0', fontWeight: 500 }}>Waiting on: {blocker.title} ({blocker.status})</p>
                    ) : null
                  })()}
                </div>

                {/* DESCRIPTION */}
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '11px', color: muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: 700 }}>Description</p>
                  <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} onBlur={() => { if (editDescription !== (selectedTask.description || '')) updateTask(selectedTask.id, { description: editDescription || null }) }} placeholder="Add a description..." style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const, lineHeight: 1.5, fontSize: '13px' }} />
                </div>

                {/* NOTES */}
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '11px', color: muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: 700 }}>Notes</p>
                  <textarea value={panelNotes} onChange={e => setPanelNotes(e.target.value)} placeholder="Add internal notes..." style={{ ...inputStyle, minHeight: '64px', resize: 'vertical' as const, lineHeight: 1.5, marginBottom: '8px', fontSize: '13px' }} />
                  <button onClick={saveNotes} disabled={savingNotes} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: savingNotes ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    {savingNotes ? 'Saving...' : 'Save notes'}
                  </button>
                </div>

                {/* SUBTASKS — collapsible */}
                {sectionToggle(
                  'Subtasks',
                  expandSubtasks,
                  () => setExpandSubtasks(v => !v),
                  subtasks.length || undefined,
                )}
                {expandSubtasks && (
                  <div style={{ paddingBottom: '14px' }}>
                    {subtasks.length === 0 && <p style={{ fontSize: '12px', color: muted, margin: '0 0 10px' }}>No subtasks yet</p>}
                    {subtasks.map(sub => (
                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0' }}>
                        <button onClick={() => toggleSubtask(sub)} aria-label={sub.completed ? 'Uncheck subtask' : 'Check subtask'} style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, border: `1.5px solid ${sub.completed ? success : border}`, background: sub.completed ? success : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                          {sub.completed && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                        <span style={{ flex: 1, fontSize: '13px', color: sub.completed ? muted : text, textDecoration: sub.completed ? 'line-through' : 'none' }}>{sub.title}</span>
                        <button onClick={() => removeSubtask(sub.id)} aria-label="Remove subtask" style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '15px', lineHeight: 1, opacity: 0.5, padding: 0 }}>×</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSubtask()} placeholder="Add a subtask..." style={{ ...inputStyle, flex: 1, fontSize: '13px', padding: '7px 10px' }} />
                      <button onClick={addSubtask} disabled={!newSubtask.trim()} style={{ padding: '7px 14px', borderRadius: '8px', background: newSubtask.trim() ? 'var(--brand-primary)' : surface2, color: newSubtask.trim() ? '#fff' : muted, border: 'none', cursor: newSubtask.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600 }}>Add</button>
                    </div>
                  </div>
                )}

                {/* TIME — collapsible */}
                {sectionToggle(
                  'Time tracking',
                  expandTime,
                  () => setExpandTime(v => !v),
                  timeEntries.length || undefined,
                  timeEntries.length > 0 ? (
                    <span style={{ fontSize: '12px', color: success, fontWeight: 700 }}>{timeEntries.reduce((s, e) => s + Number(e.hours), 0).toFixed(1)}h</span>
                  ) : null
                )}
                {expandTime && (
                  <div style={{ paddingBottom: '14px' }}>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', alignItems: 'flex-end' }}>
                      <div style={{ flex: '0 0 70px' }}>
                        <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>Hours</p>
                        <input type="number" step="0.25" min="0" value={newTimeHours} onChange={e => setNewTimeHours(e.target.value)} placeholder="0" style={{ ...inputStyle, fontSize: '13px', padding: '7px 10px', textAlign: 'center' as const }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>Description (optional)</p>
                        <input value={newTimeDesc} onChange={e => setNewTimeDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTimeEntry()} placeholder="What did you work on?" style={{ ...inputStyle, fontSize: '13px', padding: '7px 10px' }} />
                      </div>
                      <button onClick={addTimeEntry} disabled={!newTimeHours} style={{ padding: '7px 14px', borderRadius: '8px', background: newTimeHours ? 'var(--brand-primary)' : surface2, color: newTimeHours ? '#fff' : muted, border: 'none', cursor: newTimeHours ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600 }}>Log</button>
                    </div>
                    {timeEntries.length === 0 ? (
                      <p style={{ fontSize: '12px', color: muted, margin: 0 }}>No time logged yet</p>
                    ) : timeEntries.map(entry => (
                      <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderTop: `1px solid ${border}` }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: text, minWidth: '40px' }}>{Number(entry.hours).toFixed(1)}h</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {entry.description && <p style={{ fontSize: '13px', color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{entry.description}</p>}
                          <p style={{ fontSize: '11px', color: muted, margin: entry.description ? '2px 0 0' : 0 }}>{(entry.user as any)?.name} · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                        <button onClick={() => removeTimeEntry(entry.id)} aria-label="Remove time entry" style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '15px', lineHeight: 1, opacity: 0.5, padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* COMMENTS — collapsible */}
                {sectionToggle(
                  'Comments',
                  expandComments,
                  () => setExpandComments(v => !v),
                )}
                {expandComments && (
                  <div style={{ paddingBottom: '14px' }}>
                    <CommentsSection entityType="task" entityId={selectedTask.id} currentUserId={currentUser?.id || ''} team={team} />
                  </div>
                )}

                {/* DELETE */}
                <div style={{ borderTop: `1px solid ${border}`, paddingTop: '14px' }}>
                  <button onClick={() => deleteTask(selectedTask.id)} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', background: dangerBg, color: danger, border: `1px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, width: '100%' }}>
                    Delete task
                  </button>
                </div>
              </div>
            </aside>
          </>
        )}
      </div>

      <style>{`
        .drawer-panel {
          width: 380px;
          position: sticky;
          top: 80px;
          max-height: calc(100vh - 100px);
        }
        .drawer-backdrop { display: none; }
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
          }
        }
        @media (max-width: 767px) {
          .focus-chips { flex-wrap: wrap !important; }
          .scope-row { gap: 8px !important; }
        }
      `}</style>
    </div>
  )
}

const overflowItem = (color: string): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left' as const,
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color,
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
})

const chipSelect = (tone: keyof typeof statusTone | null): React.CSSProperties => {
  const color = tone ? statusTone[tone].color : 'var(--text-muted)'
  const bg = tone ? statusTone[tone].background : 'var(--surface-2)'
  return {
    fontSize: '12px',
    fontWeight: 600,
    padding: '5px 10px',
    borderRadius: '999px',
    background: bg,
    color,
    border: `1px solid ${tone ? color : 'var(--border-subtle)'}`,
    cursor: 'pointer',
    fontFamily: 'inherit',
    outline: 'none',
  }
}

function dueDateTone(d: string | null): keyof typeof statusTone | null {
  const diff = daysFromToday(d)
  if (diff === null) return null
  if (diff < 0) return 'danger'
  if (diff <= 1) return 'warning'
  return null
}
