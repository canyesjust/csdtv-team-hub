export const ALL_SCHOOL_YEARS = 'all'

export function schoolYearKeyForDate(dateInput: string | Date): string | null {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return null
  const startYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
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

export function resolvedSchoolYearKey(input: { school_year?: string | null; start_datetime?: string | null }): string | null {
  const fromStored = normalizeStoredSchoolYear(input.school_year)
  if (fromStored) return fromStored
  if (input.start_datetime) return schoolYearKeyForDate(input.start_datetime)
  return null
}

export function inSelectedSchoolYear(
  input: { school_year?: string | null; start_datetime?: string | null },
  selectedSchoolYear: string
): boolean {
  if (selectedSchoolYear === ALL_SCHOOL_YEARS) return true
  return resolvedSchoolYearKey(input) === selectedSchoolYear
}
