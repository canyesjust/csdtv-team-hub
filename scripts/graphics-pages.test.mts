import { autoPages, blockLetter, pagesToWrite } from '../lib/graphics/pages.ts'
import { parseDuration } from '../lib/graphics/timing.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

check('first block is A', blockLetter(0), 'A')
check('sixth block is F', blockLetter(5), 'F')
check('twenty seventh rolls to AA', blockLetter(26), 'AA')
check('and AB', blockLetter(27), 'AB')

const blocks = [
  { id: 'pre', sort_order: 10 },
  { id: 'half1', sort_order: 20 },
  { id: 'close', sort_order: 30 },
]
const rows = [
  { id: 'r1', block_id: 'pre', sort_order: 10 },
  { id: 'r2', block_id: 'pre', sort_order: 20 },
  { id: 'r3', block_id: 'half1', sort_order: 30 },
  { id: 'r4', block_id: 'close', sort_order: 40 },
]
check('numbers run per block', autoPages(blocks, rows), { r1: 'A1', r2: 'A2', r3: 'B1', r4: 'C1' })

// Inserting between two rows must not leave a gap or a duplicate.
const inserted = [...rows, { id: 'r5', block_id: 'pre', sort_order: 15 }]
check('an inserted row renumbers the rest', autoPages(blocks, inserted).r5, 'A2')
check('and pushes the old A2 down', autoPages(blocks, inserted).r2, 'A3')

// A row with no block still has to be callable out loud.
const orphaned = [...rows, { id: 'r9', block_id: null, sort_order: 99 }]
check('an unassigned row gets the next letter', autoPages(blocks, orphaned).r9, 'D1')
const danglingBlock = [{ id: 'gone', sort_order: 5 } , ...blocks]
check('block order drives the letter, not row order', autoPages(danglingBlock, rows).r1, 'B1')

check('no blocks at all', autoPages([], [{ id: 'x', block_id: null, sort_order: 1 }]), { x: 'A1' })
check('no rows at all', autoPages(blocks, []), {})

// Only what is actually wrong gets written, so a renumber on a clean show is
// zero database writes rather than one per row.
const stored = [
  { id: 'r1', block_id: 'pre', sort_order: 10, page: 'A1' },
  { id: 'r2', block_id: 'pre', sort_order: 20, page: 'A9' },
  { id: 'r3', block_id: 'half1', sort_order: 30, page: '' },
]
check('writes only the wrong ones', pagesToWrite(blocks, stored), [{ id: 'r2', page: 'A2' }, { id: 'r3', page: 'B1' }])
check('a clean show writes nothing', pagesToWrite(blocks, [{ id: 'r1', block_id: 'pre', sort_order: 10, page: 'A1' }]), [])

// --- durations typed into the grid -------------------------------------------
check('bare seconds', parseDuration('90'), 90)
check('minutes and seconds', parseDuration('1:30'), 90)
check('hours', parseDuration('1:02:05'), 3725)
check('leading colon', parseDuration(':45'), 45)
check('empty is zero', parseDuration(''), 0)
check('garbage is zero, not NaN', parseDuration('abc'), 0)
check('negative is not possible', parseDuration('-30'), 0)
check('a day is the ceiling', parseDuration('99:00:00'), 86400)

console.log(failures === 0 ? '\nALL PAGE TESTS PASS' : `\n${failures} PAGE TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)
