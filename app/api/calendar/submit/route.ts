import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { checkRateLimit } from '@/lib/server/rate-limit'

export const dynamic = 'force-dynamic'

const CATEGORIES = ['athletics', 'arts', 'academics', 'closures'] as const
type Category = (typeof CATEGORIES)[number]

const EMAIL_RE = /^[^\s@]+@canyonsdistrict\.org$/i

type SubmitBody = {
  school_id?: string
  category?: string
  title?: string
  start_time?: string
  end_time?: string | null
  location?: string | null
  description?: string | null
  submitted_by_name?: string
  submitted_by_email?: string
}

function isValidCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
}

/**
 * Public submission endpoint for the district calendar. Anyone with a
 * @canyonsdistrict.org email can propose an event; it lands in the staff
 * review queue as status='needs_review', origin='submitted' -- nothing goes
 * live without a human approving it at /dashboard/calendar/review.
 */
export async function POST(request: Request) {
  const rate = await checkRateLimit(request, { scope: 'calendar_submit', max: 5, windowMs: 15 * 60 * 1000 })
  if (rate.limited) {
    return NextResponse.json({ error: 'Too many submissions from this connection. Try again later.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } })
  }

  let body: SubmitBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const title = (body.title || '').trim().slice(0, 200)
  const schoolId = (body.school_id || '').trim()
  const category = body.category
  const startTime = (body.start_time || '').trim()
  const endTime = body.end_time ? String(body.end_time).trim() : ''
  const location = (body.location || '').trim().slice(0, 300)
  const description = (body.description || '').trim().slice(0, 2000)
  const submitterName = (body.submitted_by_name || '').trim().slice(0, 120)
  const submitterEmail = (body.submitted_by_email || '').trim().toLowerCase()

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!schoolId) return NextResponse.json({ error: 'School is required' }, { status: 400 })
  if (!isValidCategory(category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  const startDate = new Date(startTime)
  if (!startTime || isNaN(startDate.getTime())) return NextResponse.json({ error: 'A valid start date/time is required' }, { status: 400 })
  let endIso: string | null = null
  if (endTime) {
    const endDate = new Date(endTime)
    if (isNaN(endDate.getTime())) return NextResponse.json({ error: 'End date/time is invalid' }, { status: 400 })
    endIso = endDate.toISOString()
  }
  if (!submitterName) return NextResponse.json({ error: 'Your name is required' }, { status: 400 })
  if (!EMAIL_RE.test(submitterEmail)) return NextResponse.json({ error: 'A @canyonsdistrict.org email address is required' }, { status: 400 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: school, error: schoolError } = await service
    .from('schools')
    .select('id')
    .eq('id', schoolId)
    .eq('active', true)
    .maybeSingle()
  if (schoolError) return NextResponse.json({ error: schoolError.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'Unknown school' }, { status: 400 })

  const { error: insertError } = await service.from('calendar_school_events').insert({
    school_id: schoolId,
    origin: 'submitted',
    category,
    title,
    start_time: startDate.toISOString(),
    end_time: endIso,
    location: location || null,
    description: description || null,
    is_streaming: false,
    status: 'needs_review',
    submitted_by_name: submitterName,
    submitted_by_email: submitterEmail,
  })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
