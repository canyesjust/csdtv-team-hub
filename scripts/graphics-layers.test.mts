import { resolveTake, defaultOutSeconds, layerOf } from '../lib/graphics/layers'
import type { GraphicPayload } from '../lib/graphics/types'

const G = (tid: string): GraphicPayload => ({ tid, data: {} })
let fail = 0
const check = (name: string, cond: boolean, extra = '') => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '   ' + extra : ''))
  if (!cond) fail++
}

// The exact bug this policy exists to fix: show open is a full-screen slate,
// the next row is a corner sponsor bug. The slate must come down.
let r = resolveTake({ current: [{ layer: 'full', source: 'row' }], incoming: G('sponsor_bug'), holdFull: false })
check('slate clears when the next row is a corner graphic', r.clear.includes('full'), `clear=${r.clear}`)
check('...and the bug goes to the corner layer', r.put?.layer === 'corner')

r = resolveTake({ current: [{ layer: 'full', source: 'row' }], incoming: G('message'), holdFull: false })
check('full replacing full does not clear first', !r.clear.includes('full'))
check('...it just replaces', r.put?.layer === 'full')

r = resolveTake({ current: [{ layer: 'full', source: 'row' }, { layer: 'lower', source: 'row' }], incoming: null, holdFull: false })
check('a graphic-less row clears both story layers', r.clear.includes('full') && r.clear.includes('lower'))
check('...and puts nothing', r.put === null)

// Shelf graphics survive every take. This is the whole division of labour
// between what the director drives and what the graphics operator owns.
r = resolveTake({
  current: [{ layer: 'corner', source: 'shelf' }, { layer: 'ticker', source: 'shelf' }, { layer: 'lower', source: 'shelf' }],
  incoming: G('concert_piece'), holdFull: false,
})
check('shelf corner survives a take', !r.clear.includes('corner'))
check('shelf ticker survives a take', !r.clear.includes('ticker'))
check('even a shelf lower third survives a take', !r.clear.includes('lower'), `clear=${r.clear}`)

r = resolveTake({ current: [{ layer: 'full', source: 'row' }], incoming: G('person_lt'), holdFull: true })
check('hold keeps the previous full screen', r.clear.length === 0)
check('...and still fires the new lower third', r.put?.layer === 'lower')

r = resolveTake({ current: [{ layer: 'corner', source: 'row' }], incoming: G('message'), holdFull: false })
check('corner is not a row-owned layer', !r.clear.includes('corner'))

check('row lower third gets an auto-out', defaultOutSeconds('lower', 'row', 'person_lt') === 12)
check('shelf lower third does not', defaultOutSeconds('lower', 'shelf', 'person_lt') === 0)
check('full screen never auto-outs', defaultOutSeconds('full', 'row', 'message') === 0)
check('parade entry has no auto-out by design', defaultOutSeconds('lower', 'row', 'parade_entry') === 0)

check('unknown template resolves to no layer', layerOf({ tid: 'nope', data: {} }) === null)
r = resolveTake({ current: [{ layer: 'full', source: 'row' }], incoming: { tid: 'nope', data: {} }, holdFull: false })
check('an unknown incoming graphic still clears the slate', r.clear.includes('full'))
check('...and puts nothing', r.put === null)

if (fail > 0) {
  console.error(`\n${fail} FAILED`)
  process.exit(1)
}
console.log('\nALL LAYER POLICY TESTS PASS')
