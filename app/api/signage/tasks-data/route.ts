import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
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

  const [tasksRes, teamRes, prodsRes, pmRes] = await Promise.all([
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
    supabase
      .from('production_members')
      .select('production_id,user_id'),
  ])

  if (tasksRes.error || teamRes.error || prodsRes.error || pmRes.error) {
    return NextResponse.json({
      error: tasksRes.error?.message || teamRes.error?.message || prodsRes.error?.message || pmRes.error?.message || 'Query failed',
    }, { status: 500 })
  }

  const upcomingProds = (prodsRes.data || []).filter((p: { status?: string | null }) => {
    const status = (p.status || '').toLowerCase()
    return status !== 'complete' && status !== 'abandoned' && status !== 'cancelled'
  })
  const prodById = new Map(upcomingProds.map((p: { id: string }) => [p.id, p]))

  const prodMembers = (pmRes.data || [])
    .filter((row: { production_id: string }) => prodById.has(row.production_id))
    .map((row: { production_id: string; user_id: string }) => {
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

  return NextResponse.json({
    tasks: tasksRes.data || [],
    team: teamRes.data || [],
    prodMembers,
  })
}
