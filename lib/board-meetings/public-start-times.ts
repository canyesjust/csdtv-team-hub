// Operator-entered start times for the public "Watch Board Meetings Live" page.
// Stored on board_meetings.public_start_times as plain wall-clock labels (no
// timezone conversion) so the display exactly matches what the operator typed —
// meetings are always local (America/Denver) and these are display-only.
//
// Shape: { meeting: "HH:MM" | null, sections: { "<section_number>": "HH:MM" } }
// Times are 24-hour "HH:MM". `meeting` is the overall start; `sections` maps an
// agenda section_number to that section's time-certain start.

export type PublicStartTimes = {
  meeting: string | null
  sections: Record<string, string>
}

export const EMPTY_PUBLIC_START_TIMES: PublicStartTimes = { meeting: null, sections: {} }

// Guardrail: no real agenda has anywhere near this many sections. Bounds the
// stored payload so a malformed/oversized body can't bloat the row.
const MAX_SECTIONS = 40

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** Accept "H:MM" or "HH:MM" (00:00–23:59); normalize to zero-padded "HH:MM". */
function cleanHHMM(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = value.trim().match(HHMM)
  if (!m) return null
  const h = String(Number(m[1])).padStart(2, '0')
  return `${h}:${m[2]}`
}

/**
 * Validate and normalize untrusted input (from the PATCH body or a DB row) into a
 * safe PublicStartTimes. Drops anything malformed; never throws.
 */
export function normalizePublicStartTimes(raw: unknown): PublicStartTimes {
  if (!raw || typeof raw !== 'object') return { meeting: null, sections: {} }
  const obj = raw as Record<string, unknown>

  const meeting = cleanHHMM(obj.meeting)

  const sections: Record<string, string> = {}
  const rawSections = obj.sections
  if (rawSections && typeof rawSections === 'object') {
    let count = 0
    for (const [key, val] of Object.entries(rawSections as Record<string, unknown>)) {
      if (count >= MAX_SECTIONS) break
      // Section keys are agenda section numbers — integer strings only.
      if (!/^\d{1,4}$/.test(key)) continue
      const hhmm = cleanHHMM(val)
      if (!hhmm) continue
      sections[String(Number(key))] = hhmm
      count++
    }
  }

  return { meeting, sections }
}

/** "17:00" → "5:00 p.m." (matches the public page's a.m./p.m. label style). */
export function formatStartLabel(hhmm: string | null | undefined): string | null {
  const clean = cleanHHMM(hhmm)
  if (!clean) return null
  const [h, mm] = clean.split(':')
  const hour = Number(h)
  const period = hour < 12 ? 'a.m.' : 'p.m.'
  const h12 = hour % 12 || 12
  return `${h12}:${mm} ${period}`
}

/** Earliest section time as "HH:MM", or null when no sections have times. */
export function earliestSectionTime(pst: PublicStartTimes): string | null {
  let best: string | null = null
  let bestMinutes = Infinity
  for (const hhmm of Object.values(pst.sections)) {
    const [h, m] = hhmm.split(':').map(Number)
    const minutes = h * 60 + m
    if (minutes < bestMinutes) {
      bestMinutes = minutes
      best = hhmm
    }
  }
  return best
}
