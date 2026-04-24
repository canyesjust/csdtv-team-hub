import { NextResponse } from 'next/server'

const ICAL_URL = 'https://outlook.office365.com/owa/calendar/91a1ea912f6b4c92b28addb797e8525b@canyonsdistrict.org/b3bb8905419f4595848ca620dfcb54bb12541316991211874848/calendar.ics'

interface CalEvent {
  title: string
  date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  all_day: boolean
}

function parseIcal(text: string): CalEvent[] {
  const events: CalEvent[] = []
  const blocks = text.split('BEGIN:VEVENT')

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0]
    const lines: string[] = []

    // Handle line folding (lines starting with space/tab are continuations)
    for (const raw of block.split('\n')) {
      if (raw.startsWith(' ') || raw.startsWith('\t')) {
        if (lines.length > 0) lines[lines.length - 1] += raw.slice(1)
      } else {
        lines.push(raw.replace(/\r$/, ''))
      }
    }

    const get = (key: string): string | null => {
      for (const line of lines) {
        // Match key with or without parameters (e.g., DTSTART;TZID=... or DTSTART:...)
        if (line.startsWith(key + ':') || line.startsWith(key + ';')) {
          const colonIdx = line.indexOf(':')
          return colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : null
        }
      }
      return null
    }

    const summary = get('SUMMARY') || 'Untitled'
    const dtStart = get('DTSTART')
    const dtEnd = get('DTEND')
    const location = get('LOCATION')

    if (!dtStart) continue

    // Parse dates - could be DATE (all day) or DATETIME
    const allDay = dtStart.length === 8 // YYYYMMDD format
    let date: string
    let startTime: string | null = null
    let endTime: string | null = null

    if (allDay) {
      date = `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}`
    } else {
      // Parse to ISO string — let the client convert to local time
      const isoStr = `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}T${dtStart.slice(9, 11)}:${dtStart.slice(11, 13)}:${dtStart.slice(13, 15)}${dtStart.endsWith('Z') ? 'Z' : ''}`
      const d = new Date(isoStr)
      date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // Store as ISO string — client will format
      startTime = isoStr

      if (dtEnd) {
        const endIso = `${dtEnd.slice(0, 4)}-${dtEnd.slice(4, 6)}-${dtEnd.slice(6, 8)}T${dtEnd.slice(9, 11)}:${dtEnd.slice(11, 13)}:${dtEnd.slice(13, 15)}${dtEnd.endsWith('Z') ? 'Z' : ''}`
        endTime = endIso
      }
    }

    events.push({ title: summary, date, start_time: startTime, end_time: endTime, location, all_day: allDay })
  }

  return events
}

export async function GET() {
  try {
    const res = await fetch(ICAL_URL, { next: { revalidate: 300 } }) // Cache 5 min
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 502 })
    const text = await res.text()
    const events = parseIcal(text)
    return NextResponse.json({ events })
  } catch (err) {
    return NextResponse.json({ error: 'Calendar sync failed' }, { status: 500 })
  }
}
