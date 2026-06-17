import { NextResponse } from 'next/server'
import { parseOutlookIcal } from '@/lib/outlook-ical-parse'
import { SIGNAGE_ICAL_CACHE_HEADERS } from '@/lib/signage/public-api-cache'

const ICAL_URL = process.env.OUTLOOK_ICAL_URL || ''

export const dynamic = 'force-dynamic'

/**
 * Parsed Outlook/room calendar for production signage (`/signage`).
 * No browser session — the wall cannot call `/api/ical` (auth-only).
 * Does not expose `OUTLOOK_ICAL_URL`; server fetches the feed.
 */
export async function GET() {
  if (!ICAL_URL) {
    return NextResponse.json(
      { events: [] as ReturnType<typeof parseOutlookIcal> },
      { headers: SIGNAGE_ICAL_CACHE_HEADERS },
    )
  }

  try {
    const res = await fetch(ICAL_URL, { next: { revalidate: 300 } })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 502 })
    }
    const text = await res.text()
    const events = parseOutlookIcal(text)
    return NextResponse.json({ events }, { headers: SIGNAGE_ICAL_CACHE_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Calendar sync failed' }, { status: 500 })
  }
}
