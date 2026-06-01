import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchTaskAssignments, mergeAssigneeIds } from '@/lib/task-assignments'
import { isStudentInternRole } from '@/lib/roles'

const TASK_SELECT =
  '*, productions(id,title,production_number,request_type_label,start_datetime,status)'

const CHECKLIST_SELECT =
  'id,title,completed,assigned_to,production_id,productions(id,title,production_number,request_type_label,start_datetime,status)'

export interface TasksDashboardUser {
  id: string
  name: string
  role: string
}

export interface TasksDashboardTeamMember {
  id: string
  name: string
  role: string
  avatar_color: string
  email?: string
}

export interface TasksDashboardProduction {
  id: string
  title: string
  production_number: number
  request_type_label: string | null
  start_datetime: string | null
  status: string | null
}

export interface TasksDashboardTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  created_at: string
  assigned_to: string | null
  assignee_ids?: string[]
  created_by: string
  production_id: string | null
  needs_equipment: boolean
  notes: string | null
  purchase_request: boolean
  purchase_request_link: string | null
  hide_from_signage?: boolean
  intake_source?: string | null
  intake_submitter_name?: string | null
  intake_submitter_email?: string | null
  completed_at: string | null
  recurring: string | null
  recurring_interval: number | null
  recurrence_id?: string | null
  blocked_by: string | null
  scanned_sheet_id: string | null
  source?: 'task' | 'checklist'
  checklist_item_id?: string | null
  productions?: {
    id: string
    title: string
    production_number: number
    request_type_label: string | null
    start_datetime: string | null
    status: string | null
  } | null
}

export interface TasksDashboardTemplate {
  id: string
  name: string
  description: string | null
  items?: { id: string; title: string; description: string | null; priority: string; due_offset_days: number | null; sort_order: number }[]
}

export interface TasksDashboardMyProduction {
  id: string
  title: string
  production_number: number
  total: number
  done: number
}

export interface TasksDashboardPayload {
  user: TasksDashboardUser
  tasks: TasksDashboardTask[]
  completedTasks: TasksDashboardTask[]
  team: TasksDashboardTeamMember[]
  allProductions: TasksDashboardProduction[]
  templates: TasksDashboardTemplate[]
  subtaskCounts: Record<string, { total: number; done: number }>
  myProductions: TasksDashboardMyProduction[]
}

type ChecklistRow = {
  id: string
  title: string
  completed: boolean
  assigned_to: string | null
  production_id: string
  productions?: TasksDashboardTask['productions'] | TasksDashboardTask['productions'][] | null
}

function normalizeProductionRelation(
  rel: ChecklistRow['productions'],
): TasksDashboardTask['productions'] {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] || null) : rel
}

function enrichTasksWithAssignees(
  rows: TasksDashboardTask[],
  map: Map<string, string[]>,
): TasksDashboardTask[] {
  return rows.map(t => {
    if (t.source === 'checklist') return t
    const assignee_ids = map.get(t.id) ?? mergeAssigneeIds(t.assigned_to, t.assignee_ids)
    return {
      ...t,
      assignee_ids,
      assigned_to: assignee_ids[0] ?? null,
    }
  })
}

const SUBTASK_ID_CHUNK = 120

export async function loadTasksDashboardData(
  supabase: SupabaseClient,
  user: TasksDashboardUser,
): Promise<TasksDashboardPayload> {
  const uid = user.id
  const isStu = isStudentInternRole(user.role)

  let openTasks: TasksDashboardTask[] = []
  let doneTasks: TasksDashboardTask[] = []
  let teamList: TasksDashboardTeamMember[] = []
  let prodsList: TasksDashboardProduction[] = []
  let checklistRows: ChecklistRow[] = []

  if (isStu && uid) {
    const { data: myAssignmentRows, error: assignmentQueryError } = await supabase
      .from('task_assignments')
      .select('task_id')
      .eq('team_id', uid)
    const assignedTaskIds = assignmentQueryError
      ? []
      : [...new Set((myAssignmentRows || []).map(r => r.task_id as string))]
    const openFilter =
      assignedTaskIds.length > 0
        ? `assigned_to.eq.${uid},id.in.(${assignedTaskIds.join(',')})`
        : `assigned_to.eq.${uid}`
    const doneFilter =
      assignedTaskIds.length > 0
        ? `assigned_to.eq.${uid},id.in.(${assignedTaskIds.join(',')})`
        : `assigned_to.eq.${uid}`

    const [tasksRes, completedRes, checklistRes, memRes] = await Promise.all([
      supabase
        .from('tasks')
        .select(TASK_SELECT)
        .or(openFilter)
        .neq('status', 'complete')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('tasks')
        .select(TASK_SELECT)
        .or(doneFilter)
        .eq('status', 'complete')
        .order('completed_at', { ascending: false })
        .limit(50),
      supabase
        .from('checklist_items')
        .select(CHECKLIST_SELECT)
        .eq('assigned_to', uid)
        .eq('completed', false)
        .order('sort_order', { ascending: true }),
      supabase.from('production_members').select('production_id').eq('user_id', uid),
    ])

    if (tasksRes.error) throw tasksRes.error
    if (completedRes.error) throw completedRes.error

    openTasks = (tasksRes.data || []) as TasksDashboardTask[]
    doneTasks = (completedRes.data || []) as TasksDashboardTask[]
    checklistRows = (checklistRes.data as ChecklistRow[] | null) || []

    const pids = [...new Set((memRes.data || []).map(m => m.production_id).filter(Boolean))] as string[]
    if (pids.length === 0) {
      prodsList = []
    } else {
      const { data } = await supabase
        .from('productions')
        .select('id,title,production_number,request_type_label,start_datetime,status')
        .in('id', pids)
        .order('production_number', { ascending: false })
      prodsList = (data as TasksDashboardProduction[]) || []
    }
    const { data: selfRow } = await supabase
      .from('team')
      .select('id, name, role, avatar_color, email')
      .eq('id', uid)
      .maybeSingle()
    teamList = selfRow
      ? [(selfRow as TasksDashboardTeamMember)]
      : [{ ...user, avatar_color: '', email: '' }]
  } else {
    const [tRes, cRes, tmRes, pRes, checklistRes] = await Promise.all([
      supabase
        .from('tasks')
        .select(TASK_SELECT)
        .neq('status', 'complete')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('status', 'complete')
        .order('completed_at', { ascending: false })
        .limit(50),
      supabase.from('team').select('id, name, role, avatar_color, email').eq('active', true),
      supabase
        .from('productions')
        .select('id,title,production_number,request_type_label,start_datetime,status')
        .order('production_number', { ascending: false })
        .limit(100),
      supabase
        .from('checklist_items')
        .select(CHECKLIST_SELECT)
        .eq('completed', false)
        .order('sort_order', { ascending: true }),
    ])

    if (tRes.error) throw tRes.error
    if (cRes.error) throw cRes.error

    openTasks = (tRes.data || []) as TasksDashboardTask[]
    doneTasks = (cRes.data || []) as TasksDashboardTask[]
    teamList = (tmRes.data as TasksDashboardTeamMember[]) || []
    prodsList = (pRes.data as TasksDashboardProduction[]) || []
    checklistRows = (checklistRes.data as ChecklistRow[] | null) || []
  }

  const checklistAsTasks: TasksDashboardTask[] = checklistRows.map(row => ({
    id: `checklist:${row.id}`,
    title: row.title,
    description: null,
    status: 'pending',
    priority: 'normal',
    due_date: null,
    created_at: new Date().toISOString(),
    assigned_to: row.assigned_to,
    created_by: row.assigned_to || uid || '',
    production_id: row.production_id,
    needs_equipment: false,
    notes: null,
    purchase_request: false,
    purchase_request_link: null,
    hide_from_signage: false,
    completed_at: null,
    recurring: null,
    recurring_interval: null,
    blocked_by: null,
    scanned_sheet_id: null,
    source: 'checklist',
    checklist_item_id: row.id,
    productions: normalizeProductionRelation(row.productions),
  }))

  const taskRowsForAssignees = [...openTasks, ...doneTasks]
  const assigneeMap = await fetchTaskAssignments(
    supabase,
    taskRowsForAssignees.map(t => t.id),
  ).catch(() => new Map<string, string[]>())

  const tasks = enrichTasksWithAssignees([...openTasks, ...checklistAsTasks], assigneeMap)
  const completedTasks = enrichTasksWithAssignees(doneTasks, assigneeMap)

  let templates: TasksDashboardTemplate[] = []
  if (!isStu) {
    const { data: tplData } = await supabase
      .from('task_templates')
      .select('*, items:task_template_items(*)')
      .order('name')
    templates = ((tplData || []) as TasksDashboardTemplate[]).map(t => ({
      ...t,
      items: t.items?.sort((a, b) => a.sort_order - b.sort_order),
    }))
  }

  const taskIdsForSubs = [...new Set([...openTasks, ...doneTasks].map(t => t.id))]
  const allSubs: { task_id: string; completed: boolean }[] = []
  for (let i = 0; i < taskIdsForSubs.length; i += SUBTASK_ID_CHUNK) {
    const chunk = taskIdsForSubs.slice(i, i + SUBTASK_ID_CHUNK)
    const { data: subChunk } = await supabase
      .from('subtasks')
      .select('task_id, completed')
      .in('task_id', chunk)
    if (subChunk) allSubs.push(...subChunk)
  }
  const subtaskCounts: Record<string, { total: number; done: number }> = {}
  allSubs.forEach(s => {
    if (!subtaskCounts[s.task_id]) subtaskCounts[s.task_id] = { total: 0, done: 0 }
    subtaskCounts[s.task_id].total++
    if (s.completed) subtaskCounts[s.task_id].done++
  })

  let myProductions: TasksDashboardMyProduction[] = []
  const { data: myProdMembers } = await supabase
    .from('production_members')
    .select('production_id')
    .eq('user_id', uid)
  if (myProdMembers && myProdMembers.length > 0) {
    const prodIds = myProdMembers.map(m => m.production_id)
    const { data: prods } = await supabase
      .from('productions')
      .select('id, title, production_number, status, checklist_items(completed)')
      .in('id', prodIds)
      .not('status', 'in', '("Complete","Abandoned")')
      .order('production_number', { ascending: false })
    myProductions = (prods || [])
      .map((p: { id: string; title: string; production_number: number; checklist_items?: { completed: boolean }[] }) => {
        const items = p.checklist_items || []
        return {
          id: p.id,
          title: p.title,
          production_number: p.production_number,
          total: items.length,
          done: items.filter(i => i.completed).length,
        }
      })
      .filter(p => p.total > 0 && p.done < p.total)
  }

  return {
    user,
    tasks,
    completedTasks,
    team: teamList,
    allProductions: prodsList,
    templates,
    subtaskCounts,
    myProductions,
  }
}
