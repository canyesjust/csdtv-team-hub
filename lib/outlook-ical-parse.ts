export interface OutlookIcalEvent {
  title: string
  date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  all_day: boolean
}

function unescapeIcalText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

type Ymd = { y: number; m: number; d: number }

function parseAllDayYmd(value: string): Ymd | null {
  const v = value.trim()
  if (v.length < 8) return null
  const y = Number(v.slice(0, 4))
  const m = Number(v.slice(4, 6))
  const d = Number(v.slice(6, 8))
  if (!y || !m || !d) return null
  return { y, m, d }
}

function formatYmd({ y, m, d }: Ymd): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const dt = new Date(ymd.y, ymd.m - 1, ymd.d + days)
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() }
}

function compareYmd(a: Ymd, b: Ymd): number {
  if (a.y !== b.y) return a.y - b.y
  if (a.m !== b.m) return a.m - b.m
  return a.d - b.d
}

function parseDateTimeToLocalYmd(value: string): Ymd | null {
  if (value.length === 8) return parseAllDayYmd(value)
  const isoStr = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}${value.endsWith('Z') ? 'Z' : ''}`
  const d = new Date(isoStr)
  if (Number.isNaN(d.getTime())) return null
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
}

/** One calendar date per day the event spans (all-day DTEND is exclusive per RFC 5545). */
export function expandEventDates(dtStart: string, dtEnd: string | null, allDay: boolean): string[] {
  const start = allDay ? parseAllDayYmd(dtStart) : parseDateTimeToLocalYmd(dtStart)
  if (!start) return []

  if (!dtEnd) return [formatYmd(start)]

  const dates: string[] = []
  let cur = start

  if (allDay) {
    const endExclusive = parseAllDayYmd(dtEnd)
    if (!endExclusive || compareYmd(endExclusive, start) <= 0) return [formatYmd(start)]
    while (compareYmd(cur, endExclusive) < 0) {
      dates.push(formatYmd(cur))
      cur = addDaysYmd(cur, 1)
      if (dates.length > 366) break
    }
  } else {
    const endInclusive = parseDateTimeToLocalYmd(dtEnd)
    if (!endInclusive || compareYmd(endInclusive, start) < 0) return [formatYmd(start)]
    while (compareYmd(cur, endInclusive) <= 0) {
      dates.push(formatYmd(cur))
      cur = addDaysYmd(cur, 1)
      if (dates.length > 366) break
    }
  }

  return dates.length > 0 ? dates : [formatYmd(start)]
}

export function parseOutlookIcal(text: string): OutlookIcalEvent[] {
  const events: OutlookIcalEvent[] = []
  const blocks = text.split('BEGIN:VEVENT')

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0]
    const lines: string[] = []

    for (const raw of block.split('\n')) {
      if (raw.startsWith(' ') || raw.startsWith('\t')) {
        if (lines.length > 0) lines[lines.length - 1] += raw.slice(1)
      } else {
        lines.push(raw.replace(/\r$/, ''))
      }
    }

    const get = (key: string): string | null => {
      for (const line of lines) {
        if (line.startsWith(key + ':') || line.startsWith(key + ';')) {
          const colonIdx = line.indexOf(':')
          return colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : null
        }
      }
      return null
    }

    const summary = unescapeIcalText(get('SUMMARY') || 'Untitled')
    const dtStart = get('DTSTART')
    const dtEnd = get('DTEND')
    const location = get('LOCATION')

    if (!dtStart) continue

    const allDay = dtStart.length === 8
    let startTime: string | null = null
    let endTime: string | null = null

    if (!allDay) {
      const isoStr = `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}T${dtStart.slice(9, 11)}:${dtStart.slice(11, 13)}:${dtStart.slice(13, 15)}${dtStart.endsWith('Z') ? 'Z' : ''}`
      startTime = isoStr

      if (dtEnd) {
        const endIso = `${dtEnd.slice(0, 4)}-${dtEnd.slice(4, 6)}-${dtEnd.slice(6, 8)}T${dtEnd.slice(9, 11)}:${dtEnd.slice(11, 13)}:${dtEnd.slice(13, 15)}${dtEnd.endsWith('Z') ? 'Z' : ''}`
        endTime = endIso
      }
    }

    const dates = expandEventDates(dtStart, dtEnd, allDay)
    for (const date of dates) {
      events.push({ title: summary, date, start_time: startTime, end_time: endTime, location, all_day: allDay })
    }
  }

  return events
}
