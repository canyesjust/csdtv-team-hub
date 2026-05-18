import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { parseOutlookIcal } from '@/lib/outlook-ical-parse'

const ICAL_URL = process.env.OUTLOOK_ICAL_URL || ''

export async function GET(request: Request) {
  if (!ICAL_URL) return NextResponse.json({ error: 'Calendar not configured' }, { status: 500 })

  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(ICAL_URL, { next: { revalidate: 300 } })
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 502 })
    const text = await res.text()
    const events = parseOutlookIcal(text)
    return NextResponse.json({ events })
  } catch (err) {
    return NextResponse.json({ error: 'Calendar sync failed' }, { status: 500 })
  }
}
