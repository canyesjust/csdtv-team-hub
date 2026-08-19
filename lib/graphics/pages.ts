/**
 * Page numbering. A rundown page is a block letter and a position: A1, A2, B1.
 * It is how the director calls a row out loud, so it has to follow the running
 * order automatically. Nobody should be typing A7 by hand after a reorder.
 */
export type PageBlock = { id: string; sort_order: number }
export type PageRow = { id: string; block_id: string | null; sort_order: number; is_break?: boolean }

/** A, B, ... Z, AA, AB. Twenty-six blocks is already an absurd show. */
export function blockLetter(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/**
 * Page for every row, keyed by row id.
 *
 * Rows sit under their block in running order. Rows with no block fall into a
 * trailing group of their own rather than vanishing, because an unassigned row
 * still has to be callable.
 */
export function autoPages(blocks: PageBlock[], rows: PageRow[]): Record<string, string> {
  const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order)
  const letterFor = new Map<string, string>()
  ordered.forEach((b, i) => letterFor.set(b.id, blockLetter(i)))
  const orphanLetter = blockLetter(ordered.length)

  const counters = new Map<string, number>()
  const out: Record<string, string> = {}

  for (const row of [...rows].sort((a, b) => a.sort_order - b.sort_order)) {
    const letter = (row.block_id && letterFor.get(row.block_id)) || orphanLetter
    const next = (counters.get(letter) ?? 0) + 1
    counters.set(letter, next)
    out[row.id] = `${letter}${next}`
  }
  return out
}

/** Only the rows whose stored page is wrong, so a renumber writes the minimum. */
export function pagesToWrite(
  blocks: PageBlock[],
  rows: (PageRow & { page: string })[],
): { id: string; page: string }[] {
  const wanted = autoPages(blocks, rows)
  return rows
    .filter(r => wanted[r.id] && wanted[r.id] !== r.page)
    .map(r => ({ id: r.id, page: wanted[r.id] }))
}
