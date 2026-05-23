import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { isStudentInternRole } from '@/lib/roles'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  importKbArticles,
  parseKbImportCsv,
  parseKbImportJson,
  type KbImportDuplicateMode,
} from '@/lib/library/kb-import'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isStudentInternRole(teamUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  let rows

  if (typeof body.csv === 'string' && body.csv.trim()) {
    rows = parseKbImportCsv(body.csv)
  } else if (Array.isArray(body.articles)) {
    rows = parseKbImportJson(JSON.stringify(body.articles))
  } else if (typeof body.json === 'string' && body.json.trim()) {
    rows = parseKbImportJson(body.json)
  } else {
    return NextResponse.json({ error: 'Provide csv or articles/json in the request body' }, { status: 400 })
  }

  const valid = rows.filter((r) => !r.error)
  if (valid.length === 0) {
    return NextResponse.json(
      {
        error: 'No valid rows to import',
        errors: rows.map((r) => (r.error ? `Row ${r.row}: ${r.error}` : null)).filter(Boolean),
      },
      { status: 400 },
    )
  }

  const duplicateMode: KbImportDuplicateMode =
    body.duplicateMode === 'update' || body.duplicateMode === 'allow' ? body.duplicateMode : 'skip'

  const result = await importKbArticles(service, rows, teamUser.id, duplicateMode)
  if (result.created === 0 && result.updated === 0 && result.errors.length > 0) {
    return NextResponse.json({ error: 'Import failed', ...result }, { status: 500 })
  }

  return NextResponse.json({
    ...result,
    row_count: rows.length,
    valid_count: valid.length,
  })
}
