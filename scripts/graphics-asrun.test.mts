import { chapterStamp } from '../lib/graphics/as-run'

let fail = 0
const check = (n: string, c: boolean, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '   ' + e : ''))
  if (!c) fail++
}

// YouTube wants m:ss before the first hour and h:mm:ss after it, and it ignores
// a chapter list whose first entry is not 0:00.
check('zero is 0:00', chapterStamp(0) === '0:00', chapterStamp(0))
check('under a minute pads seconds', chapterStamp(7) === '0:07', chapterStamp(7))
check('minutes do not pad', chapterStamp(134) === '2:14', chapterStamp(134))
check('exactly an hour rolls over', chapterStamp(3600) === '1:00:00', chapterStamp(3600))
check('past an hour pads minutes', chapterStamp(3725) === '1:02:05', chapterStamp(3725))
check('long shows keep counting', chapterStamp(11_045) === '3:04:05', chapterStamp(11_045))
check('rounds rather than truncates', chapterStamp(59.6) === '1:00', chapterStamp(59.6))
check('negative clamps to zero', chapterStamp(-30) === '0:00', chapterStamp(-30))

if (fail > 0) {
  console.error(`\n${fail} FAILED`)
  process.exit(1)
}
console.log('\nALL AS-RUN TESTS PASS')
