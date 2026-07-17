import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SIGNAGE_TASK_INTAKE_APP_SETTINGS_KEY } from '@/lib/equipment-power'
import { isProductionInDateWindow, normalizeProductionDatetimeFields } from '@/lib/productions/effective-datetime'
import { SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES } from '@/lib/productions/status-filters'
import { fetchTaskAssignments } from '@/lib/task-assignments'
import { timingSafeEqualStr } from '@/lib/server/security'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { SIGNAGE_TASKS_CACHE_HEADERS } from '@/lib/signage/public-api-cache'

export const dynamic = 'force-dynamic'

function normalizeProductionStatus(status: string | null | undefined): string {
  return status ? status.replace(/^\d+\s*-\s*/, '') : ''
}

function absoluteIntakeUrl(stored: string | null): string | null {
  if (!stored || !String(stored).trim()) return null
  const t = String(stored).trim()
  if (/^https?:\/\//i.test(t)) return t
  const siteBase =
    (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}`.replace(/\/$/, '') : '')
  if (t.startsWith('/') && siteBase) return `${siteBase}${t}`
  return t
}

function bearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim() || null
}

export async function GET(request: Request) {
  const expectedKey = process.env.SIGNAGE_TASKS_KEY
  if (!expectedKey) {
    return NextResponse.json({ error: 'SIGNAGE_TASKS_KEY not configured' }, { status: 500 })
  }

  // Prefer Authorization: Bearer (keeps the secret out of access logs). Still
  // accept legacy ?k= so players / CDNs that strip Authorization keep working.
  const url = new URL(request.url)
  const incomingKey = bearerToken(request) ?? url.searchParams.get('k')
  if (!timingSafeEqualStr(incomingKey, expectedKey)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const rl = await checkRateLimit(request, {
    scope: 'signage_tasks_data',
    max: 120,
    windowMs: 60 * 1000,
  })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfterSec),
          'Cache-Control': 'private, no-store',
        },
      },
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, key)

  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 14)

  const TASK_FULL =
    'id,title,priority,due_date,assigned_to,production_id,purchase_request,hide_from_signage,status,productions(production_number,title)'
  const TASK_NO_PURCHASE =
    'id,title,priority,due_date,assigned_to,production_id,hide_from_signage,status,productions(production_number,title)'
  const TASK_NO_HIDE =
    'id,title,priority,due_date,assigned_to,production_id,purchase_request,status,productions(production_number,title)'
  const TASK_MINIMAL =
    'id,title,priority,due_date,assigned_to,production_id,status,productions(production_number,title)'

  const tasksOpenQuery = (cols: string) =>
    supabase
      .from('tasks')
      .select(cols)
      .not('status', 'ilike', 'complete')
      .order('due_date', { ascending: true, nullsFirst: false })

  const [tasksResInitial, teamRes, prodsRes] = await Promise.all([
    tasksOpenQuery(TASK_FULL),
    supabase
      .from('team')
      .select('id,name,avatar_color,role')
      .eq('active', true)
      .order('name'),
    supabase
      .from('productions')
      .select('id,production_number,title,start_datetime,start_datetime_label,event_date,status,request_type_label')
      .not('status', 'in', SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES),
  ])

  let tasksRes = tasksResInitial
  if (tasksRes.error) {
    const msg = tasksRes.error.message || ''
    if (/purchase_request/i.test(msg)) {
      tasksRes = await tasksOpenQuery(TASK_NO_PURCHASE)
    }
  }
  if (tasksRes.error) {
    const msg = tasksRes.error.message || ''
    if (/hide_from_signage/i.test(msg)) {
      tasksRes = await tasksOpenQuery(TASK_NO_HIDE)
    }
  }
  if (tasksRes.error) {
    tasksRes = await tasksOpenQuery(TASK_MINIMAL)
  }

  if (tasksRes.error || teamRes.error || prodsRes.error) {
    return NextResponse.json({
      error: tasksRes.error?.message || teamRes.error?.message || prodsRes.error?.message || 'Query failed',
    }, { status: 500 })
  }

  const taskRows = (tasksRes.data ?? []) as unknown as Record<string, unknown>[]
  const tasksPayload = taskRows
    .map((row): Record<string, unknown> => ({
      ...row,
      purchase_request: Boolean(row.purchase_request),
    }))
    .filter((row) => !Boolean(row['hide_from_signage']))

  // Tasks can have multiple assignees via task_assignments; tasks.assigned_to is only
  // the primary assignee. Attach the full assignee list so signage can show a task on
  // every assigned person's card.
  const taskIds = tasksPayload.map((row) => String(row.id)).filter(Boolean)
  let assigneesByTask = new Map<string, string[]>()
  try {
    assigneesByTask = await fetchTaskAssignments(supabase, taskIds)
  } catch {
    assigneesByTask = new Map()
  }
  const tasksWithAssignees = tasksPayload.map((row) => {
    const id = String(row.id)
    const ids = assigneesByTask.get(id)
    const assignedTo = row.assigned_to ? String(row.assigned_to) : null
    return {
      ...row,
      assignee_ids: ids && ids.length > 0 ? ids : assignedTo ? [assignedTo] : [],
    }
  })

  const { data: checklistRowsRaw, error: checklistErr } = await supabase
    .from('checklist_items')
    .select('assigned_to, productions(status)')
    .eq('completed', false)

  const checklistOpenByUser: Record<string, number> = {}
  let checklistUnassignedOpen = 0
  if (!checklistErr && checklistRowsRaw) {
    for (const row of checklistRowsRaw as Array<{ assigned_to: string | null; productions: { status: string | null } | { status: string | null }[] | null }>) {
      const prodRel = row.productions
      const prod = Array.isArray(prodRel) ? prodRel[0] : prodRel
      const st = (prod?.status || '').toLowerCase()
      if (st === 'complete' || st === 'abandoned' || st === 'cancelled') continue
      if (!row.assigned_to) checklistUnassignedOpen += 1
      else checklistOpenByUser[row.assigned_to] = (checklistOpenByUser[row.assigned_to] || 0) + 1
    }
  }

  const allProds = ((prodsRes.data || []) as Array<{
    id: string
    production_number: number
    title: string
    status?: string | null
    start_datetime?: string | null
    start_datetime_label?: string | null
    event_date?: string | null
    request_type_label?: string | null
  }>).map(p => normalizeProductionDatetimeFields(p))

  const inProgressProductions = allProds
    .filter(p => normalizeProductionStatus(p.status) === 'In Progress')
    .map(p => ({
      id: p.id,
      production_number: p.production_number,
      title: p.title,
      start_datetime: p.start_datetime ?? null,
      request_type_label: p.request_type_label ?? null,
    }))
    .sort((a, b) => {
      const aMs = a.start_datetime ? new Date(a.start_datetime).getTime() : Number.MAX_SAFE_INTEGER
      const bMs = b.start_datetime ? new Date(b.start_datetime).getTime() : Number.MAX_SAFE_INTEGER
      return aMs - bMs
    })

  const upcomingProds = allProds
    .filter(p => isProductionInDateWindow(p, start, end))
    .filter(p => {
      const status = (p.status || '').toLowerCase()
      return status !== 'complete' && status !== 'abandoned' && status !== 'cancelled'
    })
  const prodById = new Map(allProds.map(p => [p.id, p]))
  const prodIds = [...new Set([
    ...inProgressProductions.map(p => p.id),
    ...upcomingProds.map(p => p.id),
  ])]
  let prodMembers: Array<{
    production_id: string
    user_id: string
    productions: {
      production_number: number
      title: string
      start_datetime: string | null
      status: string | null
      request_type_label: string | null
    } | null
  }> = []

  if (prodIds.length > 0) {
    const { data: pmRows, error: pmErr } = await supabase
      .from('production_members')
      .select('production_id,user_id')
      .in('production_id', prodIds)

    if (pmErr) {
      return NextResponse.json({ error: pmErr.message }, { status: 500 })
    }

    prodMembers = (pmRows || []).map((row: { production_id: string; user_id: string }) => {
      const prod = prodById.get(row.production_id) as
        | {
            production_number: number
            title: string
            start_datetime: string | null
            status: string | null
            request_type_label: string | null
          }
        | undefined
      return {
        production_id: row.production_id,
        user_id: row.user_id,
        productions: prod
          ? {
              production_number: prod.production_number,
              title: prod.title,
              start_datetime: prod.start_datetime,
              status: prod.status,
              request_type_label: prod.request_type_label ?? null,
            }
          : null,
      }
    })
  }

  const { data: signRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SIGNAGE_TASK_INTAKE_APP_SETTINGS_KEY)
    .maybeSingle()

  const taskIntakeUrl = absoluteIntakeUrl(
    signRow?.value != null && String(signRow.value).trim() ? String(signRow.value) : null
  )

  return NextResponse.json({
    tasks: tasksWithAssignees,
    team: teamRes.data || [],
    prodMembers,
    inProgressProductions,
    checklistOpenByUser,
    checklistUnassignedOpen,
    taskIntakeUrl,
  }, { headers: SIGNAGE_TASKS_CACHE_HEADERS })
}
