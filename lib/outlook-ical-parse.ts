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
    let date: string
    let startTime: string | null = null
    let endTime: string | null = null

    if (allDay) {
      date = `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}`
    } else {
      const isoStr = `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}T${dtStart.slice(9, 11)}:${dtStart.slice(11, 13)}:${dtStart.slice(13, 15)}${dtStart.endsWith('Z') ? 'Z' : ''}`
      const d = new Date(isoStr)
      date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
