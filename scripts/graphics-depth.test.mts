import {
  capabilitiesFor, defaultDepthFor, depthChangeNote, isGraphicsDepth, GRAPHICS_DEPTHS,
} from '../lib/graphics/depth.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

// The four jobs from the concept, each landing on the surface that fits it.
check('a game is a bank of triggers', defaultDepthFor('game'), 'board')
check('a parade is one long list', defaultDepthFor('parade'), 'list')
check('a graduation is names in order', defaultDepthFor('ceremony'), 'list')
check('a concert is a spine', defaultDepthFor('concert'), 'rundown')
check('anything else starts simple', defaultDepthFor('other'), 'board')
check('an unknown type starts simple', defaultDepthFor('wedding'), 'board')

// A board must not drag rundown machinery along behind it. This is the whole
// point: no clock, no pages, no script on a Friday game.
const board = capabilitiesFor('board')
check('a board has no rundown', board.rundown, false)
check('a board has no clock', board.timing, false)
check('a board has no script', board.script, false)
check('a board has no blocks', board.blocks, false)
check('a board is the card bank', board.board, true)
check('a board cannot export chapters', board.chapters, false)

const list = capabilitiesFor('list')
check('a list advances', list.rundown, true)
check('a list has no clock', list.timing, false)
check('a list has no script', list.script, false)
check('a list still exports chapters', list.chapters, true)

const full = capabilitiesFor('rundown')
check('a rundown has everything', [full.rundown, full.timing, full.blocks, full.script, full.roles], [true, true, true, true, true])

check('an unknown depth falls back to the full thing', capabilitiesFor('nonsense' as never).rundown, true)
check('depth values are validated', isGraphicsDepth('board'), true)
check('and junk is refused', isGraphicsDepth('deep'), false)

// Anything a depth switch destroys would make the choice unsafe to get wrong,
// so it destroys nothing and says so.
check('same depth says nothing', depthChangeNote('board', 'board', 4), null)
check('dropping to a board reassures about the rows',
  depthChangeNote('rundown', 'board', 12),
  'The 12 rows stay saved. They come back if you switch to a list or a rundown again.')
check('one row reads properly',
  depthChangeNote('rundown', 'board', 1),
  'The 1 row stays saved. They come back if you switch to a list or a rundown again.')
check('an empty rundown dropping to a board says nothing', depthChangeNote('rundown', 'board', 0), null)
check('growing from a board mentions the shelf',
  depthChangeNote('board', 'rundown', 0),
  'Your cards stay on the shelf. Add rows for anything that belongs in a running order.')

check('every depth has capabilities', GRAPHICS_DEPTHS.every(d => Boolean(capabilitiesFor(d))), true)

console.log(failures === 0 ? '\nALL DEPTH TESTS PASS' : `\n${failures} DEPTH TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)
