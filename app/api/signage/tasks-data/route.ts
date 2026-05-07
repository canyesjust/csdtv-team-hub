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

  const [tasksRes, teamRes, prodsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id,title,priority,due_date,assigned_to,production_id,purchase_request,status,productions(production_number,title)')
      .not('status', 'ilike', 'complete')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('team')
      .select('id,name,avatar_color,role')
      .eq('active', true)
      .order('name'),
    supabase
      .from('productions')
      .select('id,production_number,title,start_datetime,status')
      .gte('start_datetime', start.toISOString())
      .lt('start_datetime', end.toISOString()),
  ])

  if (tasksRes.error || teamRes.error || prodsRes.error) {
    return NextResponse.json({
      error: tasksRes.error?.message || teamRes.error?.message || prodsRes.error?.message || 'Query failed',
    }, { status: 500 })
  }

  const upcomingProds = (prodsRes.data || []).filter((p: { status?: string | null }) => {
    const status = (p.status || '').toLowerCase()
    return status !== 'complete' && status !== 'abandoned' && status !== 'cancelled'
  })
  const prodById = new Map(upcomingProds.map((p: { id: string }) => [p.id, p]))
  const prodIds = upcomingProds.map((p: { id: string }) => p.id)
  let prodMembers: Array<{ production_id: string; user_id: string; productions: { production_number: number; title: string; start_datetime: string | null; status: string | null } | null }> = []

  if (prodIds.length > 0) {
    const { data: pmRows, error: pmErr } = await supabase
      .from('production_members')
      .select('production_id,user_id')
      .in('production_id', prodIds)

    if (pmErr) {
      return NextResponse.json({ error: pmErr.message }, { status: 500 })
    }

    prodMembers = (pmRows || []).map((row: { production_id: string; user_id: string }) => {
      const prod = prodById.get(row.production_id) as { production_number: number; title: string; start_datetime: string | null; status: string | null } | undefined
      return {
        production_id: row.production_id,
        user_id: row.user_id,
        productions: prod
          ? {
              production_number: prod.production_number,
              title: prod.title,
              start_datetime: prod.start_datetime,
              status: prod.status,
            }
          : null,
      }
    })
  }

  return NextResponse.json({
    tasks: tasksRes.data || [],
    team: teamRes.data || [],
    prodMembers,
  })
}
