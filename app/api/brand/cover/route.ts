import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

// Set which logo is a school's cover (the card preview). One cover per school.
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { code?: string; category?: string; name?: string }
  const code = String(body.code || '').trim()
  const category = String(body.category || '').trim()
  const name = String(body.name || '').trim()
  if (!code || !category || !name) {
    return NextResponse.json({ error: 'Missing code, category, or name' }, { status: 400 })
  }

  // Clear any existing cover for this school, then set the chosen logo (all formats).
  const clear = await service.from('school_logos').update({ is_cover: false }).eq('school_code', code).eq('is_cover', true)
  if (clear.error) return NextResponse.json({ error: clear.error.message }, { status: 500 })

  const set = await service
    .from('school_logos')
    .update({ is_cover: true })
    .eq('school_code', code)
    .eq('category', category)
    .eq('name', name)
    .select('id')
  if (set.error) return NextResponse.json({ error: set.error.message }, { status: 500 })
  if (!set.data || set.data.length === 0) return NextResponse.json({ error: 'Logo not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
