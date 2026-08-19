/**
 * Minimal RFC 5545 ICS parser for the calendar suite's sync job.
 * Extracts every VEVENT field this app has a use for today (UID, SUMMARY,
 * DTSTART/DTEND, LOCATION, DESCRIPTION, STATUS, ORGANIZER, TRANSP, SEQUENCE,
 * URL, RRULE, RECURRENCE-ID, CATEGORIES, CLASS, CREATED/LAST-MODIFIED, and
 * whether it's an all-day entry) plus the complete raw VEVENT block verbatim
 * as a fallback, so nothing is silently dropped even for properties not
 * listed above.
 *
 * Does not expand RRULE recurrence rules — if a feed relies on raw RRULE
 * expansion (a single VEVENT saying "every Tuesday until June" instead of
 * one VEVENT per occurrence), only the first/master occurrence comes
 * through; revisit if that turns out to matter for real feeds (the raw
 * RRULE text is captured either way). Most published school-calendar feeds
 * instead emit one full VEVENT per occurrence, all sharing the same UID and
 * usually without RRULE or RECURRENCE-ID on any of them at all -- this
 * parser returns every one of those VEVENTs as its own ParsedIcsEvent
 * (nothing here collapses same-UID events); it's calendar-sync.ts's job to
 * decide how same-UID occurrences map to distinct rows, using RECURRENCE-ID
 * when present and DTSTART otherwise to tell them apart.
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
  isAllDay: boolean
  organizerName: string | null
  organizerEmail: string | null
  /** OPAQUE (busy) / TRANSPARENT (free) per RFC 5545 TRANSP -- most school
   * feeds don't set this, in which case it's null (unknown), not a guess. */
  busyStatus: 'busy' | 'free' | null
  /** Bumped by the source calendar tool on every edit -- a more reliable
   * "did this change" signal than diffing individual fields, for sources
   * that set it consistently. */
  sequence: number | null
  url: string | null
  /** Raw RRULE value, if present (recurrence rules aren't expanded by this
   * parser -- see the module doc comment -- but the raw rule is kept so
   * nothing is silently discarded). */
  rrule: string | null
  /** The source's own CATEGORIES value, kept separate from whatever
   * category this app assigns the event. */
  sourceCategories: string | null
  sourceClass: string | null
  createdAt: Date | null
  lastModifiedAt: Date | null
  /** RECURRENCE-ID, when present: identifies which single occurrence of a
   * recurring series this VEVENT overrides (a moved time, a cancellation,
   * etc.), distinguishing it from a genuinely separate event that happens to
   * share the same UID. Also doubles, along with DTSTART, as the signal
   * calendar-sync.ts uses to tell apart multiple VEVENTs that share one UID
   * without any RECURRENCE-ID at all -- the more common way school calendar
   * tools publish a recurring series (one VEVENT per occurrence, no RRULE,
   * no RECURRENCE-ID, just repeated UIDs with different DTSTARTs). */
  recurrenceId: Date | null
  /** The complete raw VEVENT block exactly as received, BEGIN:VEVENT through
   * END:VEVENT. Archival -- covers every property this parser doesn't
   * explicitly extract (ATTACH, CONTACT, GEO, X-* extensions, etc.) so no
   * source data is ever silently thrown away, even if today's UI has no use
   * for it yet. */
  rawText: string
}

/** A single left-to-right scan, not chained regex replaces. Chained
 * replaces are order-dependent: whichever pattern runs first "claims"
 * characters the later patterns might have needed, so a literal backslash
 * immediately followed by "n" (encoded on the wire as \\n -- an escaped
 * backslash, then a plain, unrelated "n") got corrupted regardless of which
 * order the four replaces ran in. Scanning once, left to right, and only
 * ever consuming a backslash together with the one character after it
 * handles every case correctly, including runs of escaped backslashes. */
function unescapeIcalText(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[i + 1]
      if (next === 'n' || next === 'N') { out += '\n'; i++; continue }
      if (next === ',') { out += ','; i++; continue }
      if (next === ';') { out += ';'; i++; continue }
      if (next === '\\') { out += '\\'; i++; continue }
      // Not a recognized RFC 5545 escape -- pass the backslash through
      // rather than silently eating it for a source that isn't perfectly
      // spec-compliant.
      out += ch
      continue
    }
    out += ch
  }
  return out
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

/** Windows/Outlook exports TZID using Windows time-zone display names (e.g.
 * "Eastern Standard Time") rather than IANA zone IDs ("America/New_York"),
 * and some sources send a bare "UTC" or "GMT" -- valid IANA-adjacent names
 * that just don't contain a "/". Intl.DateTimeFormat only resolves real IANA
 * names, so an unmapped Windows name throws and correctly falls through to
 * DEFAULT_TZ below -- but a bare "UTC"/"GMT" or an unmapped Windows name
 * both used to get diverted to DEFAULT_TZ *before* ever being tried, via a
 * `tzid.includes('/')` check that rejected anything without a slash. That
 * silently shifted every timed event on the feed by the gap between the
 * source's real zone and Mountain time, with no error anywhere. Not
 * exhaustive -- covers the common continental US names Outlook emits; add
 * more here if a specific feed needs one that's missing. */
const WINDOWS_TZ_TO_IANA: Record<string, string> = {
  UTC: 'Etc/UTC',
  GMT: 'Etc/UTC',
  'GMT Standard Time': 'Europe/London',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
}

/** Resolves a TZID param to a zone name worth trying with Intl. Previously
 * this only trusted a TZID if it already contained a "/", which rejected
 * "UTC", "GMT", and every Windows-style name before they ever got a chance
 * to resolve. Now every TZID is at least attempted (mapped first if it's a
 * known Windows name) -- an IANA name Intl doesn't recognize still safely
 * falls back to DEFAULT_TZ via the try/catch at the call site, exactly as
 * before, it just no longer happens for names that were valid all along. */
function resolveTzid(tzid: string | undefined): string {
  if (!tzid) return DEFAULT_TZ
  return WINDOWS_TZ_TO_IANA[tzid] || tzid
}

function isDateOnlyValue(prop: PropLine): boolean {
  const v = prop.value.trim()
  return prop.params.VALUE === 'DATE' || (v.length === 8 && !v.includes('T'))
}

function parseOrganizer(prop: PropLine | undefined): { name: string | null; email: string | null } {
  if (!prop) return { name: null, email: null }
  const name = prop.params.CN ? unescapeIcalText(prop.params.CN) : null
  const raw = prop.value.trim()
  const email = raw.toLowerCase().startsWith('mailto:') ? raw.slice(7) : raw
  return { name, email: email || null }
}

function parseDateTimeValue(prop: PropLine): Date | null {
  const v = prop.value.trim()
  if (isDateOnlyValue(prop)) {
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
  const tz = resolveTzid(prop.params.TZID)
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
  let curRawLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = {}
      curRawLines = [line]
      continue
    }
    if (line.startsWith('END:VEVENT')) {
      curRawLines.push(line)
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
          const organizer = parseOrganizer(get('ORGANIZER'))
          const transpProp = get('TRANSP')
          const transpValue = transpProp ? transpProp.value.trim().toUpperCase() : null
          const sequenceProp = get('SEQUENCE')
          const parsedSequence = sequenceProp ? Number.parseInt(sequenceProp.value.trim(), 10) : NaN
          const urlProp = get('URL')
          const rruleProp = get('RRULE')
          const categoriesProp = get('CATEGORIES')
          const classProp = get('CLASS')
          const createdProp = get('CREATED')
          const modifiedProp = get('LAST-MODIFIED')
          const recurrenceIdProp = get('RECURRENCE-ID')
          events.push({
            uid: uidProp ? uidProp.value.trim() : `no-uid-${summaryProp!.value}-${dtstartProp!.value}`,
            title: summaryProp ? unescapeIcalText(summaryProp.value) : 'Untitled event',
            start,
            end,
            location: get('LOCATION') ? unescapeIcalText(get('LOCATION')!.value) || null : null,
            description: get('DESCRIPTION') ? unescapeIcalText(get('DESCRIPTION')!.value) || null : null,
            cancelled: !!statusProp && statusProp.value.trim().toUpperCase() === 'CANCELLED',
            isRecurring: !!cur['RRULE'],
            isAllDay: isDateOnlyValue(dtstartProp!),
            organizerName: organizer.name,
            organizerEmail: organizer.email,
            busyStatus: transpValue === 'OPAQUE' ? 'busy' : transpValue === 'TRANSPARENT' ? 'free' : null,
            sequence: Number.isNaN(parsedSequence) ? null : parsedSequence,
            url: urlProp ? urlProp.value.trim() || null : null,
            rrule: rruleProp ? rruleProp.value.trim() || null : null,
            sourceCategories: categoriesProp ? unescapeIcalText(categoriesProp.value) || null : null,
            sourceClass: classProp ? classProp.value.trim() || null : null,
            createdAt: createdProp ? parseDateTimeValue(createdProp) : null,
            lastModifiedAt: modifiedProp ? parseDateTimeValue(modifiedProp) : null,
            recurrenceId: recurrenceIdProp ? parseDateTimeValue(recurrenceIdProp) : null,
            // Reconstructed from unfolded lines, not the original folded
            // bytes -- same content, one property per line instead of
            // possibly wrapped across 75-char continuation lines.
            rawText: curRawLines.join('\n'),
          })
        }
      }
      cur = null
      curRawLines = []
      continue
    }
    if (!cur) continue
    curRawLines.push(line)
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
