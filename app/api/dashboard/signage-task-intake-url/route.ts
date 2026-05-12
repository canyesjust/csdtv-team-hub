import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { canPublishTaskSignageIntake } from '@/lib/equipment-access'
import { SIGNAGE_TASK_INTAKE_APP_SETTINGS_KEY } from '@/lib/equipment-power'
import { isStudentInternRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET() {
  const user = await getAuthenticatedTeamUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isStudentInternRole(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = serviceSupabase()
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SIGNAGE_TASK_INTAKE_APP_SETTINGS_KEY)
    .maybeSingle()

  const url = (data?.value && String(data.value).trim()) || null
  return NextResponse.json({ url })
}

export async function POST(request: Request) {
  const user = await getAuthenticatedTeamUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canPublishTaskSignageIntake(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = serviceSupabase()
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  let body: { url?: string | null }
  try {
    body = (await request.json()) as { url?: string | null }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw = body.url != null ? String(body.url).trim() : ''
  const value = raw === '' ? '' : raw

  if (value && !/^https?:\/\//i.test(value) && !value.startsWith('/')) {
    return NextResponse.json({ error: 'URL must start with http://, https://, or /' }, { status: 400 })
  }

  const { error } = await supabase.from('app_settings').upsert({
    key: SIGNAGE_TASK_INTAKE_APP_SETTINGS_KEY,
    value,
    updated_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, url: value || null })
}

export async function DELETE() {
  const user = await getAuthenticatedTeamUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canPublishTaskSignageIntake(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = serviceSupabase()
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { error } = await supabase.from('app_settings').delete().eq('key', SIGNAGE_TASK_INTAKE_APP_SETTINGS_KEY)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
