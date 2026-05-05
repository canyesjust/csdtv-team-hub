'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'
import Loader from '../components/Loader'
import CommentsSection from '../components/CommentsSection'
import { toast } from '@/lib/toast'

interface Production {
  id: string; title: string; production_number: number
  request_type_label: string | null; start_datetime: string | null; status: string | null
}

interface Subtask { id: string; title: string; completed: boolean; sort_order: number }
interface TimeEntry { id: string; hours: number; description: string | null; date: string; user_id: string; user?: { name: string } | null }

interface Task {
  id: string; title: string; description: string | null; status: string; priority: string
  due_date: string | null; created_at: string; assigned_to: string | null; created_by: string
  production_id: string | null; needs_equipment: boolean; notes: string | null
  completed_at: string | null; recurring: string | null; recurring_interval: number | null
  blocked_by: string | null; scanned_sheet_id: string | null
  productions?: { id: string; title: string; production_number: number; request_type_label: string | null; start_datetime: string | null; status: string | null } | null
}

interface TeamMember { id: string; name: string; role: string; avatar_color: string; email: string }
interface CurrentUser { id: string; name: string; role: string }
interface TaskTemplate { id: string; name: string; description: string | null; items?: TaskTemplateItem[] }
interface TaskTemplateItem { id: string; title: string; description: string | null; priority: string; due_offset_days: number | null; sort_order: number }

const PRIORITIES = ['low', 'normal', 'high', 'day of']
const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  pending:       { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  'in progress': { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  'in review':   { bg: 'rgba(168,85,247,0.15)',  color: '#a855f7' },
  complete:      { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e' },
}
const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  'day of': { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
  high:     { bg: 'rgba(249,115,22,0.15)',  color: '#f97316' },
  normal:   { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8' },
  low:      { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
}

export default function TasksPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [tasks, setTasks] = useState<Task[]>([])
  const [completedTasks, setCompletedTasks] = useState<Task[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [allProductions, setAllProductions] = useState<Production[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'completed'>('open')
  const [filter, setFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [focusFilter, setFocusFilter] = useState<'all' | 'at-risk' | 'due-soon' | 'blocked' | 'unassigned'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupBy, setGroupBy] = useState<'none' | 'person' | 'status' | 'priority'>('none')
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'normal', assigned_to: '', due_date: '', production_id: '', needs_equipment: false, recurring: '' })
  const [panelNotes, setPanelNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [search, setSearch] = useState('')
  const [myProductions, setMyProductions] = useState<{ id: string; title: string; production_number: number; total: number; done: number }[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const q = params.get('search')
      if (q) setSearch(q)
    }
  }, [])
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [newSubtask, setNewSubtask] = useState('')
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [newTimeHours, setNewTimeHours] = useState('')
  const [newTimeDesc, setNewTimeDesc] = useState('')
  const [detailTab, setDetailTab] = useState<'details' | 'subtasks' | 'time' | 'comments'>('details')
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [subtaskCounts, setSubtaskCounts] = useState<Record<string, { total: number; done: number }>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const panelBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const hoverBg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [tasksRes, completedRes, teamRes, userRes, prodsRes] = await Promise.all([
      supabase.from('tasks').select('*, productions(id,title,production_number,request_type_label,start_datetime,status)').neq('status', 'complete').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('tasks').select('*, productions(id,title,production_number,request_type_label,start_datetime,status)').eq('status', 'complete').order('completed_at', { ascending: false }).limit(50),
      supabase.from('team').select('*').eq('active', true),
      supabase.from('team').select('*').eq('supabase_user_id', session.user.id).single(),
      supabase.from('productions').select('id,title,production_number,request_type_label,start_datetime,status').order('production_number', { ascending: false }).limit(100),
    ])
    setTasks(tasksRes.data || [])
    setCompletedTasks(completedRes.data || [])
    setTeam(teamRes.data || [])
    setCurrentUser(userRes.data)
    setAllProductions(prodsRes.data || [])
    // Load templates
    const { data: tplData } = await supabase.from('task_templates').select('*, items:task_template_items(*)').order('name')
    setTemplates((tplData || []).map((t: any) => ({ ...t, items: t.items?.sort((a: any, b: any) => a.sort_order - b.sort_order) })))
    // Load subtask counts
    const { data: allSubs } = await supabase.from('subtasks').select('task_id, completed')
    const counts: Record<string, { total: number; done: number }> = {}
    ;(allSubs || []).forEach((s: any) => {
      if (!counts[s.task_id]) counts[s.task_id] = { total: 0, done: 0 }
      counts[s.task_id].total++
      if (s.completed) counts[s.task_id].done++
    })
    setSubtaskCounts(counts)

    // Load my productions with checklist progress
    if (userRes.data) {
      const { data: myProdMembers } = await supabase.from('production_members').select('production_id').eq('user_id', userRes.data.id)
      if (myProdMembers && myProdMembers.length > 0) {
        const prodIds = myProdMembers.map(m => m.production_id)
        const { data: prods } = await supabase.from('productions').select('id, title, production_number, status, checklist_items(completed)').in('id', prodIds).not('status', 'in', '("Complete","Abandoned")').order('production_number', { ascending: false })
        const withCounts = (prods || []).map((p: any) => {
          const items = p.checklist_items || []
          return { id: p.id, title: p.title, production_number: p.production_number, total: items.length, done: items.filter((i: any) => i.completed).length }
        }).filter(p => p.total > 0 && p.done < p.total)
        setMyProductions(withCounts)
      }
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const getMember = (id: string | null) => id ? team.find(m => m.id === id) || null : null

  // Template functions
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
  }

  const applyTemplate = async (template: TaskTemplate, productionId?: string) => {
    if (!currentUser || !template.items) return
    const today = new Date()
    const inserts = template.items.map(item => ({
      title: item.title, description: item.description, priority: item.priority, status: 'pending',
      created_by: currentUser.id, production_id: productionId || null,
      due_date: item.due_offset_days ? new Date(today.getTime() + item.due_offset_days * 86400000).toISOString().split('T')[0] : null,
    }))
    const { data } = await supabase.from('tasks').select('*, productions(id,title,production_number,request_type_label,start_datetime,status)').in('id', (await supabase.from('tasks').insert(inserts).select('id')).data?.map((d: any) => d.id) || [])
    if (data) setTasks(prev => [...data, ...prev])
    setShowTemplates(false)
  }

  const deleteTemplate = async (id: string) => {
    await supabase.from('task_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const openTask = async (task: Task) => {
    setSelectedTask(task); setPanelNotes(task.notes || ''); setEditTitle(task.title); setEditDescription(task.description || ''); setDetailTab('details')
    const [subRes, timeRes] = await Promise.all([
      supabase.from('subtasks').select('*').eq('task_id', task.id).order('sort_order'),
      supabase.from('time_entries').select('*, user:team!time_entries_user_id_fkey(name)').eq('task_id', task.id).order('date', { ascending: false }),
    ])
    setSubtasks(subRes.data || [])
    setTimeEntries(timeRes.data as any || [])
  }
  const closePanel = () => { setSelectedTask(null); setSubtasks([]); setTimeEntries([]) }

  const sendAssignEmail = useCallback(async (assigneeId: string, taskTitle: string) => {
    const assignee = team.find(m => m.id === assigneeId)
    if (!assignee || !currentUser) return
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) return
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          type: 'task_assigned',
          recipientEmail: assignee.email,
          recipientName: assignee.name.split(' ')[0],
          subject: `New task assigned: ${taskTitle}`,
          body: `${currentUser.name} assigned you a task: "${taskTitle}". Log in to see the details and get started.`,
          actionUrl: '/dashboard/tasks',
          actionLabel: 'View task',
        }),
      })
      if (!res.ok) { /* email failed */ }
    } catch { /* email error */ }
  }, [team, currentUser, supabase])

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const { error } = await supabase.from('tasks').update(updates).eq('id', id)
    if (error) { toast('Failed to update task', 'error'); return }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    setSelectedTask(prev => prev?.id === id ? { ...prev, ...updates } : prev)
    if (updates.assigned_to && updates.assigned_to !== selectedTask?.assigned_to) {
      const task = tasks.find(t => t.id === id)
      if (task) sendAssignEmail(updates.assigned_to, task.title)
    }
  }, [supabase, selectedTask, tasks, sendAssignEmail])

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

  // FIX: insert without FK join to avoid 400 error, then attach production from local list
  const createTask = useCallback(async () => {
    if (!newTask.title || !currentUser) return
    const { data, error } = await supabase.from('tasks').insert({
      title: newTask.title, description: newTask.description || null,
      priority: newTask.priority, assigned_to: newTask.assigned_to || null,
      due_date: newTask.due_date || null, production_id: newTask.production_id || null,
      needs_equipment: newTask.needs_equipment, recurring: newTask.recurring || null,
      recurring_interval: newTask.recurring ? 1 : null, status: 'pending', created_by: currentUser.id,
    }).select('*').single()
    if (error) { toast('Failed to create task', 'error'); return }
    if (data) {
      const linkedProd = newTask.production_id ? allProductions.find(p => p.id === newTask.production_id) || null : null
      setTasks(prev => [{ ...data, productions: linkedProd }, ...prev])
      if (newTask.assigned_to) sendAssignEmail(newTask.assigned_to, newTask.title)
      setNewTask({ title: '', description: '', priority: 'normal', assigned_to: '', due_date: '', production_id: '', needs_equipment: false, recurring: '' })
      setShowNewTask(false)
    }
  }, [newTask, currentUser, supabase, sendAssignEmail, allProductions])

  const cycleStatus = useCallback(async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = task.status === 'pending' ? 'in progress' : task.status === 'in progress' ? 'in review' : task.status === 'in review' ? 'complete' : 'pending'
    const { error: statusError } = await supabase.from('tasks').update({ status: next, completed_at: next === 'complete' ? new Date().toISOString() : null }).eq('id', task.id)
    if (statusError) { toast('Failed to update task status', 'error'); return }
    if (next === 'complete') {
      // Auto-unblock tasks blocked by this one
      const blockedTasks = tasks.filter(t => t.blocked_by === task.id)
      if (blockedTasks.length > 0) {
        const { error: unblockError } = await supabase.from('tasks').update({ blocked_by: null }).eq('blocked_by', task.id)
        if (unblockError) { toast('Failed to unblock related tasks', 'error') }
        setTasks(prev => prev.map(t => t.blocked_by === task.id ? { ...t, blocked_by: null } : t))
      }
      // Auto-create next recurring task
      if (task.recurring && task.due_date) {
        const interval = task.recurring_interval || 1
        const nextDate = new Date(task.due_date + 'T00:00:00')
        if (task.recurring === 'daily') nextDate.setDate(nextDate.getDate() + interval)
        else if (task.recurring === 'weekly') nextDate.setDate(nextDate.getDate() + (7 * interval))
        else if (task.recurring === 'monthly') nextDate.setMonth(nextDate.getMonth() + interval)
        const { data: newTask, error: recurringError } = await supabase.from('tasks').insert({
          title: task.title, description: task.description, priority: task.priority,
          assigned_to: task.assigned_to, production_id: task.production_id,
          needs_equipment: task.needs_equipment, recurring: task.recurring,
          recurring_interval: task.recurring_interval, status: 'pending',
          due_date: nextDate.toISOString().split('T')[0], created_by: task.created_by,
        }).select('*, productions(id,title,production_number,request_type_label,start_datetime,status)').single()
        if (recurringError) toast('Failed to create next recurring task', 'error')
        if (newTask) setTasks(prev => [newTask, ...prev.filter(t => t.id !== task.id)])
        else setTasks(prev => prev.filter(t => t.id !== task.id))
      } else {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'complete' } : t))
        setTimeout(() => { setTasks(prev => prev.filter(t => t.id !== task.id)) }, 3000)
      }
      setCompleting(prev => new Set(prev).add(task.id))
      if (selectedTask?.id === task.id) closePanel()
      const completed = { ...task, status: 'complete', completed_at: new Date().toISOString() }
      setTimeout(() => {
        setCompletedTasks(prev => [completed, ...prev])
        setCompleting(prev => { const n = new Set(prev); n.delete(task.id); return n })
      }, 1000)
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
      setSelectedTask(prev => prev?.id === task.id ? { ...prev, status: next } : prev)
    }
  }, [supabase, selectedTask])

  const reopenTask = useCallback(async (task: Task) => {
    const { error } = await supabase.from('tasks').update({ status: 'pending', completed_at: null }).eq('id', task.id)
    if (error) { toast('Failed to reopen task', 'error'); return }
    setCompletedTasks(prev => prev.filter(t => t.id !== task.id))
    setTasks(prev => [{ ...task, status: 'pending', completed_at: null }, ...prev])
  }, [supabase])

  // Subtask management
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

  // Time entry management
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

  const formatDate = (d: string | null): { label: string; color: string } | null => {
    if (!d) return null
    const date = new Date(d), today = new Date()
    const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return { label: 'Overdue', color: '#ef4444' }
    if (diff === 0) return { label: 'Today', color: '#f59e0b' }
    if (diff === 1) return { label: 'Tomorrow', color: '#f59e0b' }
    if (diff <= 7) return { label: `${diff}d`, color: muted }
    return { label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: muted }
  }

  const formatEventDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const eventCountdown = (d: string | null): { label: string; color: string } | null => {
    if (!d) return null
    const diff = Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return { label: 'Event passed', color: muted }
    if (diff === 0) return { label: 'Event is TODAY', color: '#ef4444' }
    if (diff <= 1) return { label: 'Event tomorrow', color: '#f97316' }
    if (diff <= 3) return { label: `Event in ${diff} days`, color: '#f97316' }
    if (diff <= 7) return { label: `Event in ${diff} days`, color: '#f59e0b' }
    return { label: `Event in ${diff} days`, color: muted }
  }

  const daysUntilDue = (dueDate: string | null): number | null => {
    if (!dueDate) return null
    const due = new Date(dueDate)
    const now = new Date()
    due.setHours(0, 0, 0, 0)
    now.setHours(0, 0, 0, 0)
    return Math.ceil((due.getTime() - now.getTime()) / 86400000)
  }

  const isAtRiskTask = (task: Task): boolean => {
    const dueInDays = daysUntilDue(task.due_date)
    const overdue = dueInDays !== null && dueInDays < 0
    const dueWithin48h = dueInDays !== null && dueInDays >= 0 && dueInDays <= 2
    return overdue || task.status === 'in review' || task.priority === 'day of' || dueWithin48h
  }

  const focusCounts = {
    all: tasks.length,
    ['at-risk']: tasks.filter(isAtRiskTask).length,
    ['due-soon']: tasks.filter(t => {
      const dueInDays = daysUntilDue(t.due_date)
      return dueInDays !== null && dueInDays >= 0 && dueInDays <= 2
    }).length,
    blocked: tasks.filter(t => Boolean(t.blocked_by)).length,
    unassigned: tasks.filter(t => !t.assigned_to).length,
  }

  const filtered = tasks.filter(t => {
    const dueInDays = daysUntilDue(t.due_date)
    const matchFocus =
      focusFilter === 'all' ||
      (focusFilter === 'at-risk' && isAtRiskTask(t)) ||
      (focusFilter === 'due-soon' && dueInDays !== null && dueInDays >= 0 && dueInDays <= 2) ||
      (focusFilter === 'blocked' && Boolean(t.blocked_by)) ||
      (focusFilter === 'unassigned' && !t.assigned_to)
    const matchFilter = filter === 'all' || (filter === 'mine' && t.assigned_to === currentUser?.id) || (filter === 'unassigned' && !t.assigned_to)
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    const matchSearch = search === '' || t.title.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase()) || t.productions?.title?.toLowerCase().includes(search.toLowerCase()) || (t.scanned_sheet_id || '').toLowerCase().includes(search.toLowerCase())
    return matchFocus && matchFilter && matchStatus && matchSearch
  })

  const grouped = (): { label: string | null; tasks: Task[] }[] => {
    if (groupBy === 'none') return [{ label: null, tasks: filtered }]
    if (groupBy === 'priority') {
      const order = ['day of', 'high', 'normal', 'low']
      const groups: Record<string, Task[]> = {}
      filtered.forEach(t => { if (!groups[t.priority]) groups[t.priority] = []; groups[t.priority].push(t) })
      return order.filter(p => groups[p]).map(p => ({ label: p, tasks: groups[p] }))
    }
    if (groupBy === 'person') {
      const groups: Record<string, Task[]> = {}
      filtered.forEach(t => { const n = getMember(t.assigned_to)?.name || 'Unassigned'; if (!groups[n]) groups[n] = []; groups[n].push(t) })
      return Object.entries(groups).map(([label, tasks]) => ({ label, tasks }))
    }
    if (groupBy === 'status') {
      const groups: Record<string, Task[]> = {}
      filtered.forEach(t => { if (!groups[t.status]) groups[t.status] = []; groups[t.status].push(t) })
      return Object.entries(groups).map(([label, tasks]) => ({ label, tasks }))
    }
    return [{ label: null, tasks: filtered }]
  }

  const filterBtn = (active: boolean): React.CSSProperties => ({
    fontSize: '14px', padding: '6px 14px', borderRadius: '8px', border: `0.5px solid ${border}`,
    background: active ? '#1e6cb5' : cardBg, color: active ? '#fff' : muted,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', minHeight: '36px',
  })

  const inputStyle: React.CSSProperties = {
    width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px',
    padding: '9px 12px', fontSize: '14px', color: text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><Loader /></div>

  const openCount = filtered.filter(t => !completing.has(t.id)).length

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, color: text, margin: 0 }}>Tasks</h1>
            <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0' }}>{openCount} open · {completedTasks.length} completed</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowTemplates(!showTemplates)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', padding: '10px 18px', borderRadius: '10px', background: cardBg, color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              Templates
            </button>
            <button onClick={() => setShowNewTask(!showNewTask)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', padding: '10px 18px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New task
            </button>
          </div>
        </div>

        {/* My Productions — checklist progress */}
        {myProductions.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 8px' }}>My Productions — Outstanding Checklist Items</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {myProductions.map(p => {
              const pct = Math.round((p.done / p.total) * 100)
              return (
                <a key={p.id} href={`/dashboard/productions/${p.production_number}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', minWidth: '180px', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#1e6cb5'; (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = border; (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>#{p.production_number} {p.title}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <div style={{ flex: 1, height: '3px', background: 'var(--surface-2)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22c55e' : '#1e6cb5', borderRadius: '2px' }} />
                      </div>
                      <span style={{ fontSize: '11px', color: pct === 100 ? '#22c55e' : muted, fontWeight: 500, flexShrink: 0 }}>{p.done}/{p.total}</span>
                    </div>
                  </div>
                </a>
              )
            })}
            </div>
          </div>
        )}

        {/* Tabs: Open / Completed + View toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `0.5px solid ${border}`, marginBottom: '16px' }}>
          <div style={{ display: 'flex' }}>
          {([['open', `Open (${openCount})`], ['completed', `Completed (${completedTasks.length})`]] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ fontSize: '14px', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: activeTab === tab ? '#5ba3e0' : muted, borderBottom: activeTab === tab ? '2px solid #1e6cb5' : '2px solid transparent', fontWeight: activeTab === tab ? 500 : 400 }}>
              {label}
            </button>
          ))}
          </div>
          {activeTab === 'open' && (
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              <button onClick={() => setViewMode('list')} style={{ padding: '6px 10px', background: viewMode === 'list' ? 'var(--surface-2)' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: viewMode === 'list' ? text : muted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </button>
              <button onClick={() => setViewMode('kanban')} style={{ padding: '6px 10px', background: viewMode === 'kanban' ? 'var(--surface-2)' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: viewMode === 'kanban' ? text : muted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="18"/><rect x="10" y="3" width="5" height="12"/><rect x="17" y="3" width="4" height="15"/></svg>
              </button>
            </div>
          )}
        </div>

        {/* Templates panel */}
        {showTemplates && (
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '18px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 14px' }}>Task templates</h3>
            {templates.length === 0 ? (
              <p style={{ fontSize: '14px', color: muted, margin: '0 0 14px' }}>No templates yet. Create one from your current open tasks.</p>
            ) : (
              <div style={{ marginBottom: '14px' }}>
                {templates.map(tpl => (
                  <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: `0.5px solid ${border}` }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: 0 }}>{tpl.name}</p>
                      <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>{tpl.items?.length || 0} tasks</p>
                    </div>
                    <button onClick={() => applyTemplate(tpl)} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Apply</button>
                    <button onClick={() => { if (confirm(`Delete template "${tpl.name}"?`)) deleteTemplate(tpl.id) }} style={{ fontSize: '13px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveAsTemplate()} placeholder="Template name..." style={{ ...inputStyle, flex: 1, fontSize: '14px' }} />
              <button onClick={saveAsTemplate} disabled={!newTemplateName.trim() || tasks.length === 0} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: newTemplateName.trim() ? '#1e6cb5' : 'var(--surface-2)', color: newTemplateName.trim() ? '#fff' : muted, border: 'none', cursor: newTemplateName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap' as const }}>Save current tasks as template</button>
            </div>
            <p style={{ fontSize: '12px', color: muted, margin: '8px 0 0' }}>Saving captures all {tasks.length} open tasks as a reusable template.</p>
          </div>
        )}

        {/* New task form */}
        {showNewTask && (
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '18px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 500, color: text, margin: '0 0 14px' }}>New task</h3>
            <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Task title" style={{ ...inputStyle, marginBottom: '8px' }} />
            <textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const, marginBottom: '8px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '8px' }}>
              <select value={newTask.assigned_to} onChange={e => setNewTask(p => ({ ...p, assigned_to: e.target.value }))} style={inputStyle}>
                <option value="">Unassigned</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))} style={inputStyle}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p === 'day of' ? 'Day of event' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
              <input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} />
            </div>
            <select value={newTask.production_id} onChange={e => setNewTask(p => ({ ...p, production_id: e.target.value }))} style={{ ...inputStyle, marginBottom: '10px' }}>
              <option value="">Not linked to a production</option>
              {allProductions.map(p => <option key={p.id} value={p.id}>#{p.production_number} — {p.title}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <input type="checkbox" id="needs_equipment" checked={newTask.needs_equipment} onChange={e => setNewTask(p => ({ ...p, needs_equipment: e.target.checked }))} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
              <label htmlFor="needs_equipment" style={{ fontSize: '14px', color: muted, cursor: 'pointer' }}>Needs equipment pulled</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <label style={{ fontSize: '14px', color: muted }}>Repeat:</label>
              <select value={newTask.recurring} onChange={e => setNewTask(p => ({ ...p, recurring: e.target.value }))} style={{ ...inputStyle, width: 'auto', minWidth: '100px' }}>
                <option value="">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={createTask} style={{ fontSize: '14px', padding: '8px 18px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Create task</button>
              <button onClick={() => setShowNewTask(false)} style={{ fontSize: '14px', padding: '8px 18px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* OPEN TAB */}
        {activeTab === 'open' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', marginBottom: '12px' }}>
              {[
                { key: 'all', label: 'All open', hint: 'Everything active', color: muted },
                { key: 'at-risk', label: 'At risk', hint: 'Overdue, review, day-of', color: '#ef4444' },
                { key: 'due-soon', label: 'Due in 48h', hint: 'Next two days', color: '#f59e0b' },
                { key: 'blocked', label: 'Blocked', hint: 'Needs dependency', color: '#a855f7' },
                { key: 'unassigned', label: 'Unassigned', hint: 'Needs an owner', color: '#5ba3e0' },
              ].map(item => {
                const active = focusFilter === item.key
                const count = focusCounts[item.key as keyof typeof focusCounts]
                return (
                  <button
                    key={item.key}
                    onClick={() => setFocusFilter(item.key as typeof focusFilter)}
                    style={{
                      textAlign: 'left',
                      borderRadius: '10px',
                      border: `0.5px solid ${active ? item.color : border}`,
                      background: active ? (dark ? 'rgba(255,255,255,0.02)' : '#f8fbff') : cardBg,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.3px', textTransform: 'uppercase', color: active ? item.color : muted, fontWeight: 700 }}>{item.label}</p>
                    <p style={{ margin: '4px 0 0', fontSize: '22px', color: text, fontWeight: 700 }}>{count}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: muted }}>{item.hint}</p>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '8px 14px', marginBottom: '12px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: '14px', color: text, fontFamily: 'inherit', width: '100%' }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <button style={filterBtn(filter === 'all')} onClick={() => setFilter('all')}>All</button>
              <button style={filterBtn(filter === 'mine')} onClick={() => setFilter('mine')}>Mine</button>
              <button style={filterBtn(filter === 'unassigned')} onClick={() => setFilter('unassigned')}>Unassigned</button>
              <div style={{ width: '1px', background: border, margin: '0 4px' }} />
              <button style={filterBtn(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>All status</button>
              <button style={filterBtn(statusFilter === 'pending')} onClick={() => setStatusFilter('pending')}>Pending</button>
              <button style={filterBtn(statusFilter === 'in progress')} onClick={() => setStatusFilter('in progress')}>In progress</button>
              <button style={filterBtn(statusFilter === 'in review')} onClick={() => setStatusFilter('in review')}>In review</button>
              <div style={{ width: '1px', background: border, margin: '0 4px' }} />
              <button style={filterBtn(groupBy === 'none')} onClick={() => setGroupBy('none')}>No grouping</button>
              <button style={filterBtn(groupBy === 'priority')} onClick={() => setGroupBy('priority')}>Priority</button>
              <button style={filterBtn(groupBy === 'person')} onClick={() => setGroupBy('person')}>Person</button>
              <button style={filterBtn(groupBy === 'status')} onClick={() => setGroupBy('status')}>Status</button>
            </div>
            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'rgba(30,108,181,0.08)', border: '0.5px solid rgba(30,108,181,0.2)', borderRadius: '10px', marginBottom: '12px', fontSize: '13px' }}>
                <span style={{ color: '#5ba3e0', fontWeight: 600 }}>{selectedIds.size} selected</span>
                <button onClick={async () => {
                  if (!confirm(`Mark ${selectedIds.size} tasks complete?`)) return
                  const ids = Array.from(selectedIds)
                  await supabase.from('tasks').update({ status: 'complete', completed_at: new Date().toISOString() }).in('id', ids)
                  setTasks(prev => prev.filter(t => !selectedIds.has(t.id)))
                  setCompletedTasks(prev => [...ids.map(id => { const t = tasks.find(x => x.id === id); return t ? { ...t, status: 'complete', completed_at: new Date().toISOString() } : null }).filter(Boolean) as Task[], ...prev])
                  setSelectedIds(new Set())
                }} style={{ padding: '5px 12px', borderRadius: '6px', background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 500 }}>Complete all</button>
                <select onChange={async e => {
                  if (!e.target.value) return
                  const ids = Array.from(selectedIds)
                  await supabase.from('tasks').update({ assigned_to: e.target.value }).in('id', ids)
                  setTasks(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, assigned_to: e.target.value } : t))
                  setSelectedIds(new Set())
                  e.target.value = ''
                }} style={{ padding: '5px 10px', borderRadius: '6px', background: cardBg, border: `0.5px solid ${border}`, color: text, fontFamily: 'inherit', fontSize: '12px' }}>
                  <option value="">Assign to...</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button onClick={async () => {
                  if (!confirm(`Delete ${selectedIds.size} tasks? This cannot be undone.`)) return
                  const ids = Array.from(selectedIds)
                  await supabase.from('tasks').delete().in('id', ids)
                  setTasks(prev => prev.filter(t => !selectedIds.has(t.id)))
                  setSelectedIds(new Set())
                }} style={{ padding: '5px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>Delete</button>
                <button onClick={() => setSelectedIds(new Set())} style={{ padding: '5px 12px', borderRadius: '6px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', marginLeft: 'auto' }}>Clear</button>
              </div>
            )}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
                <p style={{ color: muted, fontSize: '15px' }}>No tasks match your filters</p>
              </div>
            ) : viewMode === 'kanban' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', minHeight: '300px' }}>
                {(['pending', 'in progress', 'in review', 'complete'] as const).map(status => {
                  const col = filtered.filter(t => t.status === status)
                  const colStyle = STATUS_STYLES[status] || STATUS_STYLES['pending']
                  const isOver = dragOverCol === status
                  return (
                    <div key={status}
                      onDragOver={e => { e.preventDefault(); setDragOverCol(status) }}
                      onDragLeave={() => setDragOverCol(null)}
                      onDrop={async e => {
                        e.preventDefault(); setDragOverCol(null)
                        if (!draggedTaskId) return
                        const task = tasks.find(t => t.id === draggedTaskId)
                        if (!task || task.status === status) return
                        const isComplete = status === 'complete'
                        await supabase.from('tasks').update({ status, completed_at: isComplete ? new Date().toISOString() : null }).eq('id', draggedTaskId)
                        if (isComplete) {
                          setTasks(prev => prev.filter(t => t.id !== draggedTaskId))
                          setCompletedTasks(prev => [{ ...task, status: 'complete', completed_at: new Date().toISOString() }, ...prev])
                        } else {
                          setTasks(prev => prev.map(t => t.id === draggedTaskId ? { ...t, status, completed_at: null } : t))
                        }
                        setDraggedTaskId(null)
                      }}
                      style={{ background: isOver ? (dark ? 'rgba(30,108,181,0.08)' : 'rgba(30,108,181,0.06)') : (dark ? 'rgba(255,255,255,0.02)' : '#f8fafc'), borderRadius: '12px', padding: '12px', border: `${isOver ? '1.5px' : '0.5px'} solid ${isOver ? '#1e6cb5' : border}`, transition: 'all 0.15s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: colStyle.color, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{status}</span>
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: colStyle.bg, color: colStyle.color }}>{col.length}</span>
                      </div>
                      {col.map(task => {
                        const dateInfo = formatDate(task.due_date)
                        const assignee = getMember(task.assigned_to)
                        const isDragging = draggedTaskId === task.id
                        return (
                          <div key={task.id} draggable
                            onDragStart={() => setDraggedTaskId(task.id)}
                            onDragEnd={() => { setDraggedTaskId(null); setDragOverCol(null) }}
                            onClick={() => openTask(task)}
                            style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '12px', marginBottom: '8px', cursor: 'grab', transition: 'all 0.15s', opacity: isDragging ? 0.5 : 1 }}
                            onMouseEnter={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.borderColor = '#1e6cb5' }}
                            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = border}
                          >
                            <p style={{ fontSize: '13px', fontWeight: 500, color: text, margin: '0 0 6px' }}>
                              {task.needs_equipment && <span style={{ marginRight: '4px' }}>📦</span>}
                              {task.recurring && <span style={{ marginRight: '4px', fontSize: '11px' }}>🔁</span>}
                              {task.blocked_by && <span style={{ marginRight: '4px', fontSize: '11px' }}>🔒</span>}
                              {task.title}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {task.priority !== 'normal' && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: (PRIORITY_STYLES[task.priority] || PRIORITY_STYLES['normal']).bg, color: (PRIORITY_STYLES[task.priority] || PRIORITY_STYLES['normal']).color }}>{task.priority}</span>}
                                {dateInfo && <span style={{ fontSize: '11px', color: dateInfo.color, fontWeight: 500 }}>{dateInfo.label}</span>}
                                {subtaskCounts[task.id] && <span style={{ fontSize: '10px', color: subtaskCounts[task.id].done === subtaskCounts[task.id].total ? '#22c55e' : muted }}>☑ {subtaskCounts[task.id].done}/{subtaskCounts[task.id].total}</span>}
                              </div>
                              {assignee && <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: assignee.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e' }}>{assignee.name.slice(0, 2).toUpperCase()}</div>}
                            </div>
                          </div>
                        )
                      })}
                      {col.length === 0 && <p style={{ fontSize: '12px', color: muted, textAlign: 'center' as const, padding: '20px 0', opacity: 0.5 }}>Drop tasks here</p>}
                    </div>
                  )
                })}
              </div>
            ) : grouped().map(({ label, tasks: groupTasks }) => (
              <div key={label || 'all'} style={{ marginBottom: '16px' }}>
                {label && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: PRIORITY_STYLES[label]?.color || muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                      {label === 'day of' ? '🎬 Day of event' : label}
                    </span>
                    <span style={{ fontSize: '12px', color: muted }}>· {groupTasks.length}</span>
                  </div>
                )}
                <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                  {groupTasks.map((task, i) => {
                    const isCompleting = completing.has(task.id)
                    const isSelected = selectedTask?.id === task.id
                    const dateInfo = formatDate(task.due_date)
                    const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['pending']
                    const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES['normal']
                    const assignee = getMember(task.assigned_to)
                    return (
                      <div key={task.id} onClick={() => !isCompleting && openTask(task)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: i < groupTasks.length - 1 ? `0.5px solid ${border}` : 'none', background: isSelected ? (dark ? 'rgba(30,108,181,0.12)' : 'rgba(30,108,181,0.06)') : isCompleting ? 'rgba(34,197,94,0.06)' : 'transparent', cursor: isCompleting ? 'default' : 'pointer', transition: 'background 0.15s', opacity: isCompleting ? 0.7 : 1, borderLeft: isSelected ? '3px solid #1e6cb5' : '3px solid transparent' }}
                        onMouseEnter={e => { if (!isSelected && !isCompleting) (e.currentTarget as HTMLDivElement).style.background = hoverBg }}
                        onMouseLeave={e => { if (!isSelected && !isCompleting) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                      >
                        <input type="checkbox" checked={selectedIds.has(task.id)} onChange={e => { e.stopPropagation(); setSelectedIds(prev => { const n = new Set(prev); if (n.has(task.id)) n.delete(task.id); else n.add(task.id); return n }) }} onClick={e => e.stopPropagation()} style={{ width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0, accentColor: '#1e6cb5' }} />
                        <button onClick={e => cycleStatus(task, e)} style={{ width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0, border: `1.5px solid ${isCompleting || task.status === 'complete' ? '#22c55e' : task.status === 'in progress' ? '#f59e0b' : task.status === 'in review' ? '#a855f7' : border}`, background: isCompleting || task.status === 'complete' ? '#22c55e' : task.status === 'in progress' ? 'rgba(245,158,11,0.15)' : task.status === 'in review' ? 'rgba(168,85,247,0.15)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                          {(isCompleting || task.status === 'complete') && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '15px', color: isCompleting ? muted : text, margin: 0, fontWeight: 500, textDecoration: isCompleting ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {task.needs_equipment && <span style={{ marginRight: '5px' }}>📦</span>}
                            {task.recurring && <span style={{ marginRight: '5px', fontSize: '12px' }}>🔁</span>}
                            {task.blocked_by && <span style={{ marginRight: '5px', fontSize: '12px' }}>🔒</span>}
                            {task.title}
                          </p>
                          {task.productions?.title && <p style={{ fontSize: '13px', color: '#5ba3e0', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>🎬 #{task.productions.production_number} {task.productions.title}</p>}
                          {subtaskCounts[task.id] && <p style={{ fontSize: '12px', color: subtaskCounts[task.id].done === subtaskCounts[task.id].total ? '#22c55e' : muted, margin: '2px 0 0' }}>☑ {subtaskCounts[task.id].done}/{subtaskCounts[task.id].total} subtasks</p>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {isCompleting ? <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: 500 }}>Done ✓</span> : (
                            <>
                              {task.priority !== 'normal' && <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: priorityStyle.bg, color: priorityStyle.color, whiteSpace: 'nowrap' as const }}>{task.priority === 'day of' ? 'Day of' : task.priority}</span>}
                              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: statusStyle.bg, color: statusStyle.color }}>{task.status}</span>
                              {dateInfo && <span style={{ fontSize: '13px', color: dateInfo.color, fontWeight: 500, minWidth: '52px', textAlign: 'right' as const }}>{dateInfo.label}</span>}
                            </>
                          )}
                          {assignee ? (
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: assignee.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>{assignee.name.slice(0, 2).toUpperCase()}</div>
                          ) : <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: `1.5px dashed ${border}`, flexShrink: 0 }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* COMPLETED TAB */}
        {activeTab === 'completed' && (
          <div>
            {completedTasks.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '60px 20px' }}>
                <p style={{ fontSize: '15px', color: muted }}>No completed tasks yet</p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                  <button onClick={clearCompleted} style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                    Clear all completed
                  </button>
                </div>
                <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
                {completedTasks.map((task, i) => {
                  const assignee = getMember(task.assigned_to)
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: i < completedTasks.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0, border: '1.5px solid #22c55e', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '15px', color: muted, margin: 0, textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{task.title}</p>
                        {task.productions?.title && <p style={{ fontSize: '13px', color: muted, margin: '2px 0 0', opacity: 0.7 }}>#{task.productions.production_number} {task.productions.title}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {task.completed_at && <span style={{ fontSize: '13px', color: muted }}>{new Date(task.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                        {assignee && <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: assignee.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#0a0f1e' }}>{assignee.name.slice(0, 2).toUpperCase()}</div>}
                        <button onClick={() => reopenTask(task)} style={{ fontSize: '13px', padding: '4px 12px', borderRadius: '6px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}>Reopen</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedTask && (
        <div style={{ width: '380px', flexShrink: 0, position: 'sticky', top: '80px', background: panelBg, border: `0.5px solid ${border}`, borderRadius: '14px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' as const }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `0.5px solid ${border}` }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Task detail</span>
            <button onClick={closePanel} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
          </div>

          {/* Title */}
          <div style={{ padding: '14px 18px 0' }}>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={() => { if (editTitle !== selectedTask.title) updateTask(selectedTask.id, { title: editTitle }) }} style={{ fontSize: '17px', fontWeight: 600, color: text, margin: '0 0 10px', lineHeight: 1.3, background: 'transparent', border: `0.5px solid ${border}`, borderRadius: '8px', padding: '8px 10px', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit', outline: 'none' }} />
          </div>

          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, padding: '0 18px' }}>
            {([['details', 'Details'], ['subtasks', `Subtasks (${subtasks.length})`], ['time', 'Time'], ['comments', 'Comments']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setDetailTab(key as any)} style={{ fontSize: '12px', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: detailTab === key ? '#5ba3e0' : muted, borderBottom: detailTab === key ? '2px solid #1e6cb5' : '2px solid transparent', fontWeight: detailTab === key ? 600 : 400 }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ padding: '14px 18px' }}>

            {/* DETAILS TAB */}
            {detailTab === 'details' && (
              <div>
                {selectedTask.productions && (
                  <div style={{ background: dark ? 'rgba(91,163,224,0.08)' : 'rgba(30,108,181,0.06)', border: '0.5px solid rgba(30,108,181,0.2)', borderRadius: '10px', padding: '13px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', color: '#5ba3e0', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>🎬 Linked production</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: text, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>#{selectedTask.productions.production_number} — {selectedTask.productions.title}</p>
                        {selectedTask.productions.request_type_label && <p style={{ fontSize: '13px', color: muted, margin: '0 0 6px' }}>{selectedTask.productions.request_type_label}</p>}
                        {selectedTask.productions.start_datetime && <p style={{ fontSize: '13px', color: muted, margin: '0 0 4px' }}>📅 {formatEventDate(selectedTask.productions.start_datetime)}</p>}
                        {(() => { const c = eventCountdown(selectedTask.productions.start_datetime); return c ? <p style={{ fontSize: '13px', fontWeight: 600, color: c.color, margin: 0 }}>⏱ {c.label}</p> : null })()}
                      </div>
                      <Link href={`/dashboard/productions/${selectedTask.productions.production_number}`} style={{ fontSize: '13px', color: '#5ba3e0', textDecoration: 'none', padding: '5px 12px', borderRadius: '6px', border: '0.5px solid rgba(30,108,181,0.3)', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>Open →</Link>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Status</p>
                    <select value={selectedTask.status} onChange={e => updateTask(selectedTask.id, { status: e.target.value })} style={{ ...inputStyle, fontSize: '14px' }}>
                      <option value="pending">Pending</option>
                      <option value="in progress">In progress</option>
                      <option value="in review">In review</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Priority</p>
                    <select value={selectedTask.priority} onChange={e => updateTask(selectedTask.id, { priority: e.target.value })} style={{ ...inputStyle, fontSize: '14px' }}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p === 'day of' ? 'Day of event' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Assigned to</p>
                  <select value={selectedTask.assigned_to || ''} onChange={e => updateTask(selectedTask.id, { assigned_to: e.target.value || null })} style={{ ...inputStyle, fontSize: '14px' }}>
                    <option value="">Unassigned</option>
                    {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Due date</p>
                  <input type="date" value={selectedTask.due_date || ''} onChange={e => updateTask(selectedTask.id, { due_date: e.target.value || null })} style={{ ...inputStyle, fontSize: '14px' }} />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Link to production</p>
                  <select value={selectedTask.production_id || ''} onChange={e => {
                    const newProdId = e.target.value || null
                    const linkedProd = newProdId ? allProductions.find(p => p.id === newProdId) || null : null
                    updateTask(selectedTask.id, { production_id: newProdId } as Partial<Task>)
                    setSelectedTask(prev => prev ? { ...prev, production_id: newProdId, productions: linkedProd } : prev)
                  }} style={{ ...inputStyle, fontSize: '14px' }}>
                    <option value="">No production linked</option>
                    {allProductions.map(p => <option key={p.id} value={p.id}>#{p.production_number} — {p.title}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', padding: '11px 13px', background: selectedTask.needs_equipment ? 'rgba(249,115,22,0.1)' : inputBg, borderRadius: '8px', border: `0.5px solid ${selectedTask.needs_equipment ? 'rgba(249,115,22,0.3)' : border}`, cursor: 'pointer' }}
                  onClick={() => updateTask(selectedTask.id, { needs_equipment: !selectedTask.needs_equipment })}>
                  <input type="checkbox" checked={selectedTask.needs_equipment} onChange={() => {}} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '14px', color: selectedTask.needs_equipment ? '#f97316' : muted, fontWeight: selectedTask.needs_equipment ? 600 : 400 }}>📦 Needs equipment pulled</span>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Blocked by</p>
                  <select value={selectedTask.blocked_by || ''} onChange={e => updateTask(selectedTask.id, { blocked_by: e.target.value || null } as Partial<Task>)} style={{ ...inputStyle, fontSize: '14px' }}>
                    <option value="">Not blocked</option>
                    {tasks.filter(t => t.id !== selectedTask.id).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  {selectedTask.blocked_by && (() => {
                    const blocker = tasks.find(t => t.id === selectedTask.blocked_by)
                    return blocker ? (
                      <p style={{ fontSize: '12px', color: '#f59e0b', margin: '6px 0 0' }}>🔒 Waiting on: {blocker.title} ({blocker.status})</p>
                    ) : null
                  })()}
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Description</p>
                  <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} onBlur={() => { if (editDescription !== (selectedTask.description || '')) updateTask(selectedTask.id, { description: editDescription || null }) }} placeholder="Add a description..." style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const, lineHeight: 1.5 }} />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Notes</p>
                  <textarea value={panelNotes} onChange={e => setPanelNotes(e.target.value)} placeholder="Add internal notes..." style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' as const, lineHeight: 1.5, marginBottom: '8px' }} />
                  <button onClick={saveNotes} disabled={savingNotes} style={{ fontSize: '14px', padding: '8px 16px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: savingNotes ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                    {savingNotes ? 'Saving...' : 'Save notes'}
                  </button>
                </div>

                <div style={{ borderTop: `0.5px solid ${border}`, paddingTop: '14px' }}>
                  <button onClick={() => deleteTask(selectedTask.id)} style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, width: '100%' }}>
                    Delete task
                  </button>
                </div>
              </div>
            )}

            {/* SUBTASKS TAB */}
            {detailTab === 'subtasks' && (
              <div>
                {subtasks.length === 0 && <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '16px 0' }}>No subtasks yet</p>}
                {subtasks.map(sub => (
                  <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `0.5px solid ${border}` }}>
                    <button onClick={() => toggleSubtask(sub)} style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, border: `1.5px solid ${sub.completed ? '#22c55e' : border}`, background: sub.completed ? '#22c55e' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sub.completed && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                    <span style={{ flex: 1, fontSize: '14px', color: sub.completed ? muted : text, textDecoration: sub.completed ? 'line-through' : 'none' }}>{sub.title}</span>
                    <button onClick={() => removeSubtask(sub.id)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '16px', lineHeight: 1, opacity: 0.5 }}>×</button>
                  </div>
                ))}
                {subtasks.length > 0 && (
                  <p style={{ fontSize: '12px', color: muted, margin: '10px 0 0' }}>{subtasks.filter(s => s.completed).length} of {subtasks.length} done</p>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
                  <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSubtask()} placeholder="Add a subtask..." style={{ ...inputStyle, flex: 1, fontSize: '13px', padding: '8px 10px' }} />
                  <button onClick={addSubtask} disabled={!newSubtask.trim()} style={{ padding: '8px 14px', borderRadius: '8px', background: newSubtask.trim() ? '#1e6cb5' : 'var(--surface-2)', color: newSubtask.trim() ? '#fff' : muted, border: 'none', cursor: newSubtask.trim() ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500 }}>Add</button>
                </div>
              </div>
            )}

            {/* TIME TAB */}
            {detailTab === 'time' && (
              <div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'flex-end' }}>
                  <div style={{ flex: '0 0 70px' }}>
                    <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>Hours</p>
                    <input type="number" step="0.25" min="0" value={newTimeHours} onChange={e => setNewTimeHours(e.target.value)} placeholder="0" style={{ ...inputStyle, fontSize: '14px', padding: '8px 10px', textAlign: 'center' as const }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '11px', color: muted, margin: '0 0 4px' }}>What did you work on?</p>
                    <input value={newTimeDesc} onChange={e => setNewTimeDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTimeEntry()} placeholder="Description (optional)" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }} />
                  </div>
                  <button onClick={addTimeEntry} disabled={!newTimeHours} style={{ padding: '8px 14px', borderRadius: '8px', background: newTimeHours ? '#1e6cb5' : 'var(--surface-2)', color: newTimeHours ? '#fff' : muted, border: 'none', cursor: newTimeHours ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, minHeight: '38px' }}>Log</button>
                </div>
                {timeEntries.length === 0 ? (
                  <p style={{ fontSize: '13px', color: muted, textAlign: 'center' as const, padding: '16px 0' }}>No time logged yet</p>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: muted }}>Total logged</span>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#22c55e' }}>{timeEntries.reduce((s, e) => s + Number(e.hours), 0).toFixed(1)}h</span>
                    </div>
                    {timeEntries.map(entry => (
                      <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `0.5px solid ${border}` }}>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: text, minWidth: '40px' }}>{Number(entry.hours).toFixed(1)}h</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {entry.description && <p style={{ fontSize: '13px', color: text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{entry.description}</p>}
                          <p style={{ fontSize: '11px', color: muted, margin: entry.description ? '2px 0 0' : 0 }}>{(entry.user as any)?.name} · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                        <button onClick={() => removeTimeEntry(entry.id)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '16px', lineHeight: 1, opacity: 0.5 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* COMMENTS TAB */}
            {detailTab === 'comments' && (
              <CommentsSection entityType="task" entityId={selectedTask.id} currentUserId={currentUser?.id || ''} team={team} />
            )}

          </div>
        </div>
      )}
    </div>
  )
}
