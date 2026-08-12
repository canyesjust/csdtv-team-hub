/**
 * Minimal RFC 5545 ICS parser for the calendar suite's sync job.
 * Scope: standard VEVENT fields (UID, SUMMARY, DTSTART, DTEND, LOCATION,
 * DESCRIPTION, STATUS) plus RRULE *presence* (for series grouping). Does not
 * expand recurrence rules — most published school-calendar feeds already
 * emit one VEVENT per occurrence sharing a UID, which this handles via
 * recurrenceGroupId. If a feed instead relies on raw RRULE expansion, only
 * the first/master occurrence will come through; revisit if that turns out
 * to matter for real feeds.
 */

export type ParsedIcsEvent = {
  uid: string
  title: string
  start: Date
  end: Date | null
  location: string | null
  description: string | null
  cancelled: boolean
  isRecurring: boolean
}

function unescapeIcalText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/** Unfold RFC 5545 continuation lines (a line starting with a space or tab continues the previous line). */
function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').split('\n')
  const lines: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else if (line.trim() !== '') {
      lines.push(line)
    }
  }
  return lines
}

/** Convert a local wall-clock time in `timeZone` to the correct UTC instant, DST-aware, no external deps. */
function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcGuess))
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const hour = map.hour === '24' ? '0' : map.hour
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(hour), Number(map.minute), Number(map.second))
  const diff = asUtc - utcGuess
  return new Date(utcGuess - diff)
}

type PropLine = { name: string; params: Record<string, string>; value: string }

function parseLine(line: string): PropLine | null {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return null
  const head = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  const [name, ...paramParts] = head.split(';')
  const params: Record<string, string> = {}
  for (const p of paramParts) {
    const eq = p.indexOf('=')
    if (eq === -1) continue
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1)
  }
  return { name: name.toUpperCase(), params, value }
}

/** Default timezone for floating (no TZID, no Z) date-times in district feeds. */
const DEFAULT_TZ = 'America/Denver'

function parseDateTimeValue(prop: PropLine): Date | null {
  const v = prop.value.trim()
  const isDateOnly = prop.params.VALUE === 'DATE' || (v.length === 8 && !v.includes('T'))
  if (isDateOnly) {
    const y = Number(v.slice(0, 4)), mo = Number(v.slice(4, 6)), d = Number(v.slice(6, 8))
    if (!y || !mo || !d) return null
    return zonedTimeToUtc(y, mo, d, 0, 0, 0, DEFAULT_TZ)
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return null
  const [, yy, mo, dd, hh, mi, ss, z] = m
  if (z === 'Z') {
    return new Date(Date.UTC(Number(yy), Number(mo) - 1, Number(dd), Number(hh), Number(mi), Number(ss)))
  }
  const tzid = prop.params.TZID
  const tz = tzid && tzid.includes('/') ? tzid : DEFAULT_TZ
  try {
    return zonedTimeToUtc(Number(yy), Number(mo), Number(dd), Number(hh), Number(mi), Number(ss), tz)
  } catch {
    return zonedTimeToUtc(Number(yy), Number(mo), Number(dd), Number(hh), Number(mi), Number(ss), DEFAULT_TZ)
  }
}

export function parseIcsEvents(icsText: string): ParsedIcsEvent[] {
  const lines = unfoldLines(icsText)
  const events: ParsedIcsEvent[] = []
  let cur: Record<string, PropLine[]> | null = null

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = {}
      continue
    }
    if (line.startsWith('END:VEVENT')) {
      if (cur) {
        const get = (name: string) => cur![name]?.[0]
        const uidProp = get('UID')
        const summaryProp = get('SUMMARY')
        const dtstartProp = get('DTSTART')
        const dtendProp = get('DTEND')
        const start = dtstartProp ? parseDateTimeValue(dtstartProp) : null
        if (start && (uidProp || summaryProp)) {
          const end = dtendProp ? parseDateTimeValue(dtendProp) : null
          const statusProp = get('STATUS')
          events.push({
            uid: uidProp ? uidProp.value.trim() : `no-uid-${summaryProp!.value}-${dtstartProp!.value}`,
            title: summaryProp ? unescapeIcalText(summaryProp.value) : 'Untitled event',
            start,
            end,
            location: get('LOCATION') ? unescapeIcalText(get('LOCATION')!.value) || null : null,
            description: get('DESCRIPTION') ? unescapeIcalText(get('DESCRIPTION')!.value) || null : null,
            cancelled: !!statusProp && statusProp.value.trim().toUpperCase() === 'CANCELLED',
            isRecurring: !!cur['RRULE'],
          })
        }
      }
      cur = null
      continue
    }
    if (!cur) continue
    const prop = parseLine(line)
    if (!prop) continue
    if (!cur[prop.name]) cur[prop.name] = []
    cur[prop.name].push(prop)
  }

  return events
}

/** Deterministic (not cryptographic) UUID-shaped id from an arbitrary string, for grouping recurring series. */
export function stableUuidFromString(input: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = (h1 ^ (h1 >>> 16)) >>> 0
  h2 = (h2 ^ (h2 >>> 16)) >>> 0
  const hex = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
  const full = (hex + hex).slice(0, 32)
  return `${full.slice(0, 8)}-${full.slice(8, 12)}-4${full.slice(13, 16)}-a${full.slice(17, 20)}-${full.slice(20, 32)}`
}
