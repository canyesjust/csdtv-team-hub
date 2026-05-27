export interface ScheduleOfficeClosedDay {
  id: string
  date: string
  label: string | null
}

export function officeClosedOnDate(
  dateStr: string,
  closedDays: ScheduleOfficeClosedDay[],
): ScheduleOfficeClosedDay | null {
  return closedDays.find(d => d.date === dateStr) ?? null
}

/** Signage / calendar footer line for an office closure. */
export function formatOfficeClosedSignageLine(
  closed: ScheduleOfficeClosedDay | null,
): string | null {
  if (!closed) return null
  const label = closed.label?.trim()
  return label ? label : 'Office closed'
}
