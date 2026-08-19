import { currentIndex, stepTarget, type NavRow } from '../lib/graphics/panel-nav.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

const row = (id: string, started: string | null, ended: string | null): NavRow =>
  ({ id, started_at: started, ended_at: ended })

const T = '2026-08-19T18:00:00.000Z'

// A show that has not started: nothing is open in the as-run.
const cold = [row('a', null, null), row('b', null, null), row('c', null, null)]
check('nothing on air', currentIndex(cold), -1)
check('next starts the show', stepTarget(cold, 1)?.id, 'a')
check('prev with nothing on air does nothing', stepTarget(cold, -1), null)

// Mid show: b is open, a is closed.
const mid = [row('a', T, T), row('b', T, null), row('c', null, null)]
check('finds the open row', currentIndex(mid), 1)
check('next advances', stepTarget(mid, 1)?.id, 'c')
check('prev steps back', stepTarget(mid, -1)?.id, 'a')

// Last row on air: next has nowhere to go, which must be a clean null rather
// than a wrap to the top. Wrapping a live rundown would retake the show open.
const last = [row('a', T, T), row('b', T, T), row('c', T, null)]
check('end of the rundown', stepTarget(last, 1), null)
check('prev still works at the end', stepTarget(last, -1)?.id, 'b')

// First row on air: prev must not wrap to the bottom either.
const first = [row('a', T, null), row('b', null, null)]
check('top of the rundown', stepTarget(first, -1), null)

check('an empty rundown is safe', stepTarget([], 1), null)
check('an empty rundown has no cursor', currentIndex([]), -1)

// A row that started and ended is not on air, even if it is the newest one.
const closed = [row('a', T, T), row('b', T, T)]
check('all closed reads as nothing on air', currentIndex(closed), -1)
check('next after a full pass restarts at the top', stepTarget(closed, 1)?.id, 'a')

console.log(failures === 0 ? '\nALL PANEL TESTS PASS' : `\n${failures} PANEL TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)
