import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { timingSafeEqualStr } from '@/lib/server/security'

// Key-gated brand-color edit for the review link (no login). Lets a reviewer with the
// shared ?review=KEY add or adjust a school's brand colors. Scoped to the four color
// columns so it can never touch other school metadata.
export const dynamic = 'force-dynamic'

// undefined -> invalid input; null -> clear the color; string -> normalized #rrggbb.
function normalizeHex(value: unknown): string | null | undefined {
  const t = String(value ?? '').trim()
  if (!t) return null
  const h = t.startsWith('#') ? t : `#${t}`
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? h.toLowerCase() : undefined
}

const FIELDS: [key: string, column: string][] = [
  ['primary', 'primary_color'],
  ['secondary', 'secondary_color'],
  ['accent', 'accent_color'],
  ['text', 'text_color'],
]

export async function POST(request: Request) {
  const expected = process.env.BRAND_REVIEW_KEY
  if (!expected) return NextResponse.json({ error: 'Review link is not configured' }, { status: 503 })

  const rl = await checkRateLimit(request, { scope: 'brand_review_colors', max: 30, windowMs: 60 * 1000 })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown> & { key?: string; code?: string }
  if (!timingSafeEqualStr(body.key, expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = String(body.code || '').trim()
  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })

  const updates: Record<string, string | null> = {}
  const result: Record<string, string | null> = {}
  for (const [key, column] of FIELDS) {
    if (!(key in body)) continue
    const normalized = normalizeHex(body[key])
    if (normalized === undefined) {
      return NextResponse.json({ error: `"${key}" must be a hex color like #003087 or #abc (or blank to clear).` }, { status: 400 })
    }
    updates[column] = normalized
    result[key] = normalized
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No colors provided' }, { status: 400 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: school } = await service
    .from('schools')
    .select('code')
    .eq('code', code)
    .in('type', ['school', 'district', 'department'])
    .not('active', 'is', false)
    .maybeSingle()
  if (!school) return NextResponse.json({ error: 'Unknown school code' }, { status: 400 })

  const { error } = await service.from('schools').update(updates).eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, colors: result })
}
