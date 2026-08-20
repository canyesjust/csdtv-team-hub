import { pickLogo, scoreLogo, buildMarkArt, type LogoRow } from '../lib/graphics/marks.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

const row = (over: Partial<LogoRow>): LogoRow => ({
  school_code: '711', category: 'Official', name: 'Logo', format: 'png',
  storage_path: 'p.png', sort_order: 0, is_cover: false, flagged_for_deletion: false,
  ...over,
})

// Print assets must never reach a browser source.
check('eps is unusable', scoreLogo(row({ format: 'eps' }), 'badge'), -1)
check('docx is unusable', scoreLogo(row({ format: 'docx' }), 'badge'), -1)
check('a flagged file is unusable', scoreLogo(row({ flagged_for_deletion: true }), 'badge'), -1)

// Transparency is the whole game over a camera.
const png = row({ storage_path: 'a.png', format: 'png' })
const jpg = row({ storage_path: 'b.jpg', format: 'jpg' })
check('png beats jpg', pickLogo([jpg, png], 'badge')?.storage_path, 'a.png')
const svg = row({ storage_path: 'c.svg', format: 'svg' })
check('svg beats png', pickLogo([png, svg], 'badge')?.storage_path, 'c.svg')

// Intent decides the category, not the file order.
const official = row({ storage_path: 'off.png', category: 'Official' })
const wordmark = row({ storage_path: 'word.png', category: 'Wordmark' })
check('a badge wants the crest', pickLogo([wordmark, official], 'badge')?.storage_path, 'off.png')
check('a wordmark wants the wordmark', pickLogo([official, wordmark], 'wordmark')?.storage_path, 'word.png')

// Every panel we draw is dark, so a white variant is the one that works.
const white = row({ storage_path: 'w.png', name: 'Primary White' })
const black = row({ storage_path: 'k.png', name: 'Primary Black' })
check('white beats black on a dark panel', pickLogo([black, white], 'badge')?.storage_path, 'w.png')
const print = row({ storage_path: 'pr.png', name: 'FullColor White Print' })
check('a print variant loses to a screen one', pickLogo([print, white], 'badge')?.storage_path, 'w.png')
const doodle = row({ storage_path: 'd.png', name: 'AIDoodledCC', category: 'Other' })
check('junk art loses to anything real', pickLogo([doodle, official], 'badge')?.storage_path, 'off.png')

check('a cover file wins a tie',
  pickLogo([row({ storage_path: 'x.png' }), row({ storage_path: 'y.png', is_cover: true })], 'badge')?.storage_path, 'y.png')

// No usable art is a real answer, not a broken image on air.
check('nothing usable is null', pickLogo([row({ format: 'eps' })], 'badge'), null)
check('an empty list is null', pickLogo([], 'badge'), null)

const art = buildMarkArt(
  [
    row({ school_code: '711', storage_path: '711/a.png', category: 'Official' }),
    row({ school_code: '711', storage_path: '711/b.png', category: 'Wordmark' }),
    row({ school_code: '702', storage_path: '702/c.png', category: 'Official' }),
    row({ school_code: '404', storage_path: '404/d.eps', format: 'eps' }),
  ],
  p => `https://cdn/${p}`,
)
check('one entry per school', Object.keys(art).sort(), ['404', '702', '711'])
check('badge and wordmark differ', art['711'], { badge: 'https://cdn/711/a.png', wordmark: 'https://cdn/711/b.png' })
check('a school with only print art gets nulls', art['404'], { badge: null, wordmark: null })
check('one file serves both intents when it is all there is',
  art['702'], { badge: 'https://cdn/702/c.png', wordmark: 'https://cdn/702/c.png' })

console.log(failures === 0 ? '\nALL MARK TESTS PASS' : `\n${failures} MARK TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)
