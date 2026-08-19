/**
 * Rundown timing.
 *
 * Four numbers, computed continuously. `est[i]` is a row's estimated duration,
 * PST the program start, PET the hard out, W = PET - PST the window. Floated
 * rows contribute zero to every sum.
 *
 *   TRT       = sum of est
 *   overUnder = TRT - W          positive is heavy, negative is light
 *   front[i]  = PST + sum est[k<i]
 *   back[i]   = PET - sum est[k>=i]
 *
 * There is an identity worth knowing because it explains the column layout:
 * front[i] - back[i] equals TRT - W for every row, the same constant. So a
 * producer reads the show's health off any row, and back time is not extra
 * information before air, it is front time shifted.
 *
 * It becomes independently useful the moment the cursor is live. Once a row
 * actually starts at wall clock T, overUnder becomes T - back[cursor], and rows
 * after the cursor re-base off the real clock while back times stay pinned to
 * the hard out. One formula covers the whole show, because pre-air it collapses
 * back to TRT - W.
 */

export type TimingRow = {
  id: string
  est_seconds: number
  repeat_count: number
  per_unit_seconds: number
  floated: boolean
  started_at: string | null
  ended_at: string | null
}

export type TimingResult = {
  /** Effective duration per row, in input order. Floated rows are 0. */
  est: number[]
  /** Total running time, seconds. */
  trt: number
  /** Window, seconds. */
  window: number
  /** Positive is heavy, negative is light. */
  overUnder: number
  /** Epoch ms per row. */
  front: number[]
  back: number[]
  projectedEnd: number
  /** Index of the on-air row, or -1. */
  cursor: number
}

/** A repeating row is count times per-unit, which is how a name block works. */
export function effectiveSeconds(row: TimingRow): number {
  if (row.floated) return 0
  if (row.repeat_count > 0) return row.repeat_count * row.per_unit_seconds
  return row.est_seconds
}

export function computeTiming(args: {
  rows: TimingRow[]
  /** Scheduled air time, epoch ms. */
  airAt: number
  /** Hard out, epoch ms. */
  hardOutAt: number
  /** When the show actually started, epoch ms, if it has. */
  startedAt: number | null
  /** Id of the on-air row, if any. */
  airRowId: string | null
}): TimingResult {
  const { rows, hardOutAt, airRowId } = args
  const pst = args.startedAt ?? args.airAt
  const n = rows.length
  const est = rows.map(effectiveSeconds)
  const trt = est.reduce((a, b) => a + b, 0)
  const windowSec = (hardOutAt - pst) / 1000

  const front: number[] = new Array(n)
  const back: number[] = new Array(n)

  let acc = 0
  for (let i = 0; i < n; i++) {
    front[i] = pst + acc * 1000
    acc += est[i]
  }
  let racc = 0
  for (let i = n - 1; i >= 0; i--) {
    racc += est[i]
    back[i] = hardOutAt - racc * 1000
  }

  const cursor = airRowId ? rows.findIndex(r => r.id === airRowId) : -1
  const cursorStarted = cursor >= 0 ? rows[cursor].started_at : null

  if (cursor >= 0 && cursorStarted) {
    let t = Date.parse(cursorStarted)
    for (let i = cursor; i < n; i++) {
      front[i] = t
      t += est[i] * 1000
    }
  }

  const overUnder =
    cursor >= 0 && cursorStarted
      ? (Date.parse(cursorStarted) - back[cursor]) / 1000
      : trt - windowSec

  const projectedEnd = n > 0 ? front[n - 1] + est[n - 1] * 1000 : pst

  return { est, trt, window: windowSec, overUnder, front, back, projectedEnd, cursor }
}

/** Seconds a script takes to read aloud. 150 wpm is the usual broadcast rate. */
export function readSeconds(script: string | null | undefined, wpm = 150): number {
  const words = String(script || '').trim().split(/\s+/).filter(Boolean).length
  if (words === 0) return 0
  return Math.round((words / wpm) * 60)
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  const sign = s < 0 ? '-' : ''
  const abs = Math.abs(s)
  const h = Math.floor(abs / 3600)
  const m = Math.floor(abs / 60) % 60
  const sec = abs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return sign + (h > 0 ? `${h}:${pad(m)}` : `${Math.floor(abs / 60)}`) + `:${pad(sec)}`
}

/** 12-hour clock. Nobody on a student crew should be reading 18:30. */
export function formatClock(epochMs: number, withSeconds = false): string {
  const d = new Date(epochMs)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
  })
}
