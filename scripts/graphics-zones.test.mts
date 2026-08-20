import {
  zoneRect, overlaps, lowerThirdCollides, tickerCollides, cornerCollides,
  safeLowerPosition, zoneWarning, isBugZone, BUG_ZONES,
} from '../lib/graphics/zones.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

check('nothing reserved has no rectangle', zoneRect('none'), null)
check('every zone is valid', BUG_ZONES.every(z => z === 'none' || zoneRect(z) !== null), true)
check('junk is not a zone', isBugZone('middle'), false)

check('boxes that touch do not overlap',
  overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false)
check('boxes that cross do overlap',
  overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 }), true)

// A low lower third lives in the bottom band, which is exactly where a corner
// score bug goes. This is the collision the whole module exists to catch.
check('a low band hits a bottom left bug', lowerThirdCollides('bl', 'left-low'), true)
check('a low band hits a bottom right bug', lowerThirdCollides('br', 'right-low'), true)
check('a low band hits the bottom strip', lowerThirdCollides('bottom', 'left-low'), true)
check('raising it clears the bottom strip', lowerThirdCollides('bottom', 'left-high'), false)
check('raising it clears a bottom corner', lowerThirdCollides('bl', 'left-high'), false)
check('a top bug never touches a lower third', lowerThirdCollides('top', 'left-low'), false)
check('nothing reserved never collides', lowerThirdCollides('none', 'left-low'), false)

check('the bottom strip covers the ticker', tickerCollides('bottom'), true)
check('a bottom corner covers the ticker', tickerCollides('br'), true)
check('a top bug leaves the ticker alone', tickerCollides('top'), false)

check('the corner bug clashes with a top right bug', cornerCollides('tr'), true)
check('and with the top strip', cornerCollides('top'), true)
check('but not with a bottom one', cornerCollides('bl'), false)

// Staying low is preferred, because a raised band over a camera is a
// compromise and should only happen when it has to.
check('no zone leaves the preference alone', safeLowerPosition('none', 'left-low'), 'left-low')
check('a top bug leaves it low', safeLowerPosition('top', 'left-low'), 'left-low')
check('a bottom strip raises it', safeLowerPosition('bottom', 'left-low'), 'left-high')
check('a bottom left bug raises the left band', safeLowerPosition('bl', 'left-low'), 'left-high')
check('and keeps the side it was on', safeLowerPosition('br', 'right-low'), 'right-high')

check('a clear graphic says nothing', zoneWarning('none', 'lower', 'left-low'), null)
check('a clash on a lower third explains itself',
  zoneWarning('bottom', 'lower', 'left-low'),
  'This sits under the score bug (full width, bottom). Raise it or move it to the other side.')
check('a ticker clash is an either-or',
  zoneWarning('bottom', 'ticker'),
  'The score bug (full width, bottom) covers the ticker. Only one of them can be up.')
check('a full screen is never warned about', zoneWarning('bottom', 'full'), null)

console.log(failures === 0 ? '\nALL ZONE TESTS PASS' : `\n${failures} ZONE TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)
