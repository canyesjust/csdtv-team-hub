/**
 * Pure rundown navigation for hardware panels. No server imports, so the
 * arithmetic a NEXT key depends on is unit-testable.
 */
export type NavRow = {
  id: string
  started_at: string | null
  ended_at: string | null
}

/** The row currently open in the as-run, which is what "on air" means here. */
export function currentIndex(rows: NavRow[]): number {
  return rows.findIndex(r => r.started_at && !r.ended_at)
}

/**
 * What a next or previous key lands on. Nothing on air means the first press
 * starts the show rather than doing nothing, which is what a student expects
 * from a key labelled NEXT. Previous with nothing on air does nothing, because
 * there is no sensible row to go back to.
 */
export function stepTarget<T extends NavRow>(rows: T[], step: 1 | -1): T | null {
  if (rows.length === 0) return null
  const at = currentIndex(rows)
  if (at < 0) return step > 0 ? rows[0] : null
  return rows[at + step] ?? null
}
