/** Role check for the calendar suite's shared review queue (feeds, event approval). Mirrors lib/equipment-access.ts. */
export function canManageCalendarQueue(calendarApprover: boolean | null | undefined): boolean {
  return calendarApprover === true
}
