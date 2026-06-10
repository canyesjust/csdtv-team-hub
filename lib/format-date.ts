// Consistent date formatting across the app.
//
// Why this exists: dates were being formatted ad hoc with toLocaleDateString()
// in dozens of places, producing inconsistent output. These helpers give one
// house style and, importantly, handle date-only strings ("2026-06-09") without
// the UTC-to-local shift that makes them render a day early.
//
// House style (en-US):
//   formatDate('2026-06-09')        -> "Jun 9, 2026"
//   formatDateTime('2026-06-09T...')-> "Jun 9, 2026, 3:42 PM"
//   formatTime('2026-06-09T15:42')  -> "3:42 PM"
//   formatWeekday('2026-06-09')     -> "Tue, Jun 9"
//   formatRelative(...)             -> "2 days ago" / "in 3 hours" / "just now"
//   toDateInputValue(date)          -> "2026-06-09" (for <input type="date">)

export type DateInput = string | number | Date | null | undefined

const LOCALE = 'en-US'
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse any supported input into a Date, or null if invalid/empty.
 * Date-only strings ("YYYY-MM-DD") are parsed as LOCAL midnight so they don't
 * shift across timezones.
 */
export function toDate(input: DateInput): Date | null {
  if (input == null || input === '') return null
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  if (typeof input === 'number') {
    const d = new Date(input)
    return isNaN(d.getTime()) ? null : d
  }
  const str = String(input).trim()
  if (DATE_ONLY_RE.test(str)) {
    const [y, m, d] = str.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const parsed = new Date(str)
  return isNaN(parsed.getTime()) ? null : parsed
}

function fmt(input: DateInput, options: Intl.DateTimeFormatOptions, fallback: string): string {
  const d = toDate(input)
  if (!d) return fallback
  return new Intl.DateTimeFormat(LOCALE, options).format(d)
}

/** "Jun 9, 2026" */
export function formatDate(input: DateInput, fallback = ''): string {
  return fmt(input, { month: 'short', day: 'numeric', year: 'numeric' }, fallback)
}

/** "Jun 9, 2026, 3:42 PM" */
export function formatDateTime(input: DateInput, fallback = ''): string {
  return fmt(
    input,
    { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
    fallback
  )
}

/** "3:42 PM" */
export function formatTime(input: DateInput, fallback = ''): string {
  return fmt(input, { hour: 'numeric', minute: '2-digit' }, fallback)
}

/** "Tue, Jun 9" (no year) */
export function formatWeekday(input: DateInput, fallback = ''): string {
  return fmt(input, { weekday: 'short', month: 'short', day: 'numeric' }, fallback)
}

/** "Tuesday, June 9, 2026" (long form, for headers) */
export function formatDateLong(input: DateInput, fallback = ''): string {
  return fmt(
    input,
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    fallback
  )
}

const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['week', 1000 * 60 * 60 * 24 * 7],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
]

/**
 * "2 days ago", "in 3 hours", "just now".
 * Positive offsets are future, negative are past, relative to `now`.
 */
export function formatRelative(input: DateInput, fallback = '', now: Date = new Date()): string {
  const d = toDate(input)
  if (!d) return fallback
  const diff = d.getTime() - now.getTime()
  const abs = Math.abs(diff)
  if (abs < 1000 * 45) return 'just now'
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
  for (const [unit, ms] of REL_UNITS) {
    if (abs >= ms || unit === 'minute') {
      return rtf.format(Math.round(diff / ms), unit)
    }
  }
  return fallback
}

/** "2026-06-09" in LOCAL time, suitable for <input type="date"> values. */
export function toDateInputValue(input: DateInput): string {
  const d = toDate(input)
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
