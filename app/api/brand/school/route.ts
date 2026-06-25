import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

// Manager-only: update a school's brand typography (shown on its brand guide).
// Scoped to the three font columns so it can never touch other school metadata.
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { code?: string; headingFont?: string; bodyFont?: string; fontNotes?: string }
  const code = String(body.code || '').trim()
  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })

  const clean = (v: unknown, max: number): string | null => {
    const s = String(v ?? '').trim().slice(0, max)
    return s || null
  }

  const { data: school } = await service
    .from('schools')
    .select('code')
    .eq('code', code)
    .in('type', ['school', 'district', 'department'])
    .maybeSingle()
  if (!school) return NextResponse.json({ error: 'Unknown school code' }, { status: 400 })

  const { error } = await service
    .from('schools')
    .update({
      heading_font: clean(body.headingFont, 120),
      body_font: clean(body.bodyFont, 120),
      font_notes: clean(body.fontNotes, 600),
    })
    .eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
