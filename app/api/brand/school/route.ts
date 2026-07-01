import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

// Manager-only: update a school's brand typography and/or brand colors (shown on its
// brand pages and guide). Scoped to those columns so it can never touch other metadata.
// Only fields present in the request body are changed.
export const dynamic = 'force-dynamic'

// undefined -> invalid input; null -> clear; string -> normalized #rrggbb.
function normalizeHex(value: unknown): string | null | undefined {
  const t = String(value ?? '').trim()
  if (!t) return null
  const h = t.startsWith('#') ? t : `#${t}`
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? h.toLowerCase() : undefined
}

export async function PATCH(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown> & { code?: string }
  const code = String(body.code || '').trim()
  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })

  const clean = (v: unknown, max: number): string | null => {
    const s = String(v ?? '').trim().slice(0, max)
    return s || null
  }

  const updates: Record<string, string | null> = {}
  if ('headingFont' in body) updates.heading_font = clean(body.headingFont, 120)
  if ('bodyFont' in body) updates.body_font = clean(body.bodyFont, 120)
  if ('fontNotes' in body) updates.font_notes = clean(body.fontNotes, 600)

  const colorFields: [key: string, column: string][] = [
    ['primaryColor', 'primary_color'],
    ['secondaryColor', 'secondary_color'],
    ['accentColor', 'accent_color'],
    ['textColor', 'text_color'],
  ]
  for (const [key, column] of colorFields) {
    if (!(key in body)) continue
    const normalized = normalizeHex(body[key])
    if (normalized === undefined) {
      return NextResponse.json({ error: `"${key}" must be a hex color like #003087 or #abc (or blank to clear).` }, { status: 400 })
    }
    updates[column] = normalized
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: school } = await service
    .from('schools')
    .select('code')
    .eq('code', code)
    .in('type', ['school', 'district', 'department'])
    .maybeSingle()
  if (!school) return NextResponse.json({ error: 'Unknown school code' }, { status: 400 })

  const { error } = await service.from('schools').update(updates).eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
