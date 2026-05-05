import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { action, payload } = await request.json()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const supabase = createClient(url, key)

  try {
    if (action === 'save_student') {
      const { id, student } = payload || {}
      if (id) {
        const { error } = await supabase.from('students').update(student).eq('id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        return NextResponse.json({ success: true })
      }
      const { data, error } = await supabase.from('students').insert(student).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true, data })
    }

    if (action === 'toggle_active') {
      const { id, active } = payload || {}
      const { error } = await supabase.from('students').update({ active }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === 'import_csv') {
      const { rows } = payload || {}
      const { data, error } = await supabase.from('students').upsert(rows, { onConflict: 'student_number' }).select()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true, data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
