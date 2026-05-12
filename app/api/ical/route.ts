import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { parseOutlookIcal } from '@/lib/outlook-ical-parse'

const ICAL_URL = process.env.OUTLOOK_ICAL_URL || ''

export async function GET(request: Request) {
  if (!ICAL_URL) return NextResponse.json({ error: 'Calendar not configured' }, { status: 500 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
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
