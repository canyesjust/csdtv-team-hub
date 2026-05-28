export const ALL_SCHOOL_YEARS = 'all'

/** Default productions filter: current school year + next (prep before July 1 rollover). */
export const PLANNING_SCHOOL_YEARS = 'planning'

/** School year starts July 1 — events in Jul–Dec use that calendar year as the start year. */
export const SCHOOL_YEAR_ROLLOVER_MONTH = 6

export function schoolYearKeyForDate(dateInput: string | Date): string | null {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return null
  const startYear =
    d.getMonth() >= SCHOOL_YEAR_ROLLOVER_MONTH ? d.getFullYear() : d.getFullYear() - 1
  return `${startYear}-${startYear + 1}`
}

export function currentSchoolYearKey(now: Date = new Date()): string {
  return schoolYearKeyForDate(now) || `${now.getFullYear()}-${now.getFullYear() + 1}`
}

function normalizeStoredSchoolYear(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^\d{4}-\d{4}$/.test(trimmed)) return trimmed
  if (/^\d{4}$/.test(trimmed)) {
    const end = Number(trimmed)
    return `${end - 1}-${end}`
  }
  return null
}

/** School year for filtering — uses event date when set (synced school_year is often the *next* year for spring graduations). */
export function resolvedSchoolYearKey(input: { school_year?: string | null; start_datetime?: string | null }): string | null {
  if (input.start_datetime) {
    const fromDate = schoolYearKeyForDate(input.start_datetime)
    if (fromDate) return fromDate
  }
  return normalizeStoredSchoolYear(input.school_year)
}

function schoolYearStartYear(key: string): number | null {
  const m = /^(\d{4})-/.exec(key)
  return m ? Number(m[1]) : null
}

function isActivePipelineStatus(status: string | null | undefined): boolean {
  const s = status || ''
  return (
    s === 'In Progress' ||
    s === 'Approved/Scheduled' ||
    s === 'Idea/Request' ||
    s === 'Complete Requested'
  )
}

function isFinishedStatus(status: string | null | undefined): boolean {
  const s = status || ''
  return s === 'Complete' || s === 'Abandoned'
}

/** Drop completed/abandoned productions that only belong to school years before the current one. */
export function excludeOldFinishedProduction(
  input: { school_year?: string | null; start_datetime?: string | null; status?: string | null },
  now: Date = new Date(),
): boolean {
  if (!isFinishedStatus(input.status)) return true
  const curStart = schoolYearStartYear(currentSchoolYearKey(now))
  if (curStart === null) return true
  const years = schoolYearsForProduction(input)
  if (years.length === 0) return true
  const onlyBeforeCurrent = years.every(y => {
    const start = schoolYearStartYear(y)
    return start !== null && start < curStart
  })
  return !onlyBeforeCurrent
}

export function matchesSchoolYearFilter(
  input: { school_year?: string | null; start_datetime?: string | null; status?: string | null },
  selectedFilter: string,
  now: Date = new Date(),
): boolean {
  if (!excludeOldFinishedProduction(input, now)) return false
  if (selectedFilter === ALL_SCHOOL_YEARS) return true
  if (selectedFilter === PLANNING_SCHOOL_YEARS) {
    const current = currentSchoolYearKey(now)
    const next = nextSchoolYearKey(now)
    const years = schoolYearsForProduction(input)
    if (years.some(y => y === current || y === next)) return true
    if (isActivePipelineStatus(input.status)) return true
    return false
  }
  return schoolYearsForProduction(input).includes(selectedFilter)
}

/** @deprecated Use matchesSchoolYearFilter */
export function inSelectedSchoolYear(
  input: { school_year?: string | null; start_datetime?: string | null; status?: string | null },
  selectedSchoolYear: string,
): boolean {
  return matchesSchoolYearFilter(input, selectedSchoolYear)
}

/** Production is tagged for next school year only (divider in pipeline). */
export function isNextSchoolYearOnlyProduction(
  input: { school_year?: string | null; start_datetime?: string | null },
  now: Date = new Date(),
): boolean {
  const current = currentSchoolYearKey(now)
  const next = nextSchoolYearKey(now)
  const years = schoolYearsForProduction(input)
  return years.includes(next) && !years.includes(current)
}

export function planningSchoolYearDividerLabel(now: Date = new Date()): string {
  return `Upcoming · ${nextSchoolYearKey(now)}`
}

export function planningSchoolYearFilterLabel(now: Date = new Date()): string {
  return `This year + planning ahead (${currentSchoolYearKey(now)} · ${nextSchoolYearKey(now)})`
}

function shiftSchoolYearKey(key: string, delta: number): string {
  const m = /^(\d{4})-(\d{4})$/.exec(key)
  if (!m) return key
  const start = Number(m[1]) + delta
  return `${start}-${start + 1}`
}

export function previousSchoolYearKey(now: Date = new Date()): string {
  return shiftSchoolYearKey(currentSchoolYearKey(now), -1)
}

export function nextSchoolYearKey(now: Date = new Date()): string {
  return shiftSchoolYearKey(currentSchoolYearKey(now), 1)
}

/** All school year labels that apply to a production (event date + synced field). */
export function schoolYearsForProduction(input: {
  school_year?: string | null
  start_datetime?: string | null
}): string[] {
  const keys = new Set<string>()
  const resolved = resolvedSchoolYearKey(input)
  if (resolved) keys.add(resolved)
  const stored = normalizeStoredSchoolYear(input.school_year)
  if (stored) keys.add(stored)
  return [...keys]
}

/** Dropdown options: prior / current / next year, plus any year present in data. */
export function buildSchoolYearFilterOptions(
  productions: Iterable<{ school_year?: string | null; start_datetime?: string | null }>,
  now: Date = new Date(),
): string[] {
  const keys = new Set<string>([
    previousSchoolYearKey(now),
    currentSchoolYearKey(now),
    nextSchoolYearKey(now),
  ])
  for (const p of productions) {
    for (const y of schoolYearsForProduction(p)) keys.add(y)
  }
  return Array.from(keys).sort((a, b) => b.localeCompare(a))
}
