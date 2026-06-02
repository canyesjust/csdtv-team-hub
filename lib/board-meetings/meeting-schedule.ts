/** Parse district schedule strings (ISO or legacy space-separated). */
export function parseProductionInstant(iso: string): Date {
  const raw = iso.includes('T') ? iso : iso.replace(' ', 'T')
  return new Date(raw)
}

/** Whole calendar days from local today (0 = today, -1 = yesterday). */
export function daysFromToday(scheduleIso: string | null): number | null {
  if (!scheduleIso) return null
  const event = parseProductionInstant(scheduleIso)
  if (Number.isNaN(event.getTime())) return null
  const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate())
  const today = new Date()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((eventDay.getTime() - todayDay.getTime()) / 86400000)
}

/**
 * Stays "upcoming" through the event day and the full calendar day after;
 * moves to past starting two calendar days after the event.
 */
export function isBoardMeetingPast(scheduleIso: string | null): boolean {
  const days = daysFromToday(scheduleIso)
  if (days === null) return false
  return days < -1
}

export function formatScheduleInstant(iso: string): { dateLabel: string; timeLabel: string | null } {
  const dt = parseProductionInstant(iso)
  const dateLabel = dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const hasTime = iso.includes('T') || /\d{1,2}:\d{2}/.test(iso)
  const timeLabel = hasTime ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
  return { dateLabel, timeLabel }
}
