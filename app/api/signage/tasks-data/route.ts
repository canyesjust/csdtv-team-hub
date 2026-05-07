import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const expectedKey = process.env.SIGNAGE_TASKS_KEY
  if (!expectedKey) {
    return NextResponse.json({ error: 'SIGNAGE_TASKS_KEY not configured' }, { status: 500 })
  }

  const incomingKey = new URL(request.url).searchParams.get('k')
  if (!incomingKey || incomingKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(url, key)

  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 14)

  const tasksSelectFull =
    'id,title,priority,due_date,assigned_to,production_id,purchase_request,status,productions(production_number,title)'
  const tasksSelectLegacy =
    'id,title,priority,due_date,assigned_to,production_id,status,productions(production_number,title)'

  const [tasksResInitial, teamRes, prodsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select(tasksSelectFull)
      .not('status', 'ilike', 'complete')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('team')
      .select('id,name,avatar_color,role')
      .eq('active', true)
      .order('name'),
    supabase
      .from('productions')
      .select('id,production_number,title,start_datetime,status,request_type_label')
      .gte('start_datetime', start.toISOString())
      .lt('start_datetime', end.toISOString()),
  ])

  let tasksRes = tasksResInitial
  if (tasksRes.error) {
    const msg = tasksRes.error.message || ''
    if (/purchase_request|column .* does not exist/i.test(msg)) {
      tasksRes = await supabase
        .from('tasks')
        .select(tasksSelectLegacy)
        .not('status', 'ilike', 'complete')
        .order('due_date', { ascending: true, nullsFirst: false })
    }
  }

  if (tasksRes.error || teamRes.error || prodsRes.error) {
    return NextResponse.json({
      error: tasksRes.error?.message || teamRes.error?.message || prodsRes.error?.message || 'Query failed',
    }, { status: 500 })
  }

  const tasksPayload = (tasksRes.data || []).map((row: Record<string, unknown>) => ({
    ...row,
    purchase_request: Boolean(row.purchase_request),
  }))

  const upcomingProds = (prodsRes.data || []).filter((p: { status?: string | null }) => {
    const status = (p.status || '').toLowerCase()
    return status !== 'complete' && status !== 'abandoned' && status !== 'cancelled'
  })
  const prodById = new Map(upcomingProds.map((p: { id: string }) => [p.id, p]))
  const prodIds = upcomingProds.map((p: { id: string }) => p.id)
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

  return NextResponse.json({
    tasks: tasksPayload,
    team: teamRes.data || [],
    prodMembers,
  })
}
