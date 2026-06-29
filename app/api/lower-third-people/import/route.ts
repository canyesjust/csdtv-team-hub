import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { importPeopleRows, parsePeopleImportCsv } from '@/lib/board-meetings/people-import'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const csv = typeof body.csv === 'string' ? body.csv : ''
  if (!csv.trim()) {
    return NextResponse.json({ error: 'Missing csv in request body' }, { status: 400 })
  }

  const parsed = parsePeopleImportCsv(csv)
  const valid = parsed.filter(r => !r.error)
  if (valid.length === 0) {
    return NextResponse.json(
      { error: 'No valid rows to import', errors: parsed.map(r => r.error).filter(Boolean) },
      { status: 400 },
    )
  }

  const result = await importPeopleRows(service, parsed, teamUser.id)
  return NextResponse.json({
    ...result,
    row_count: parsed.length,
    valid_count: valid.length,
  })
}
