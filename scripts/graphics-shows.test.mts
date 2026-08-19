import { bucketFor, groupShows, daysFrom, localDay } from '../app/gfx/shows-grouping.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

const TODAY = '2026-08-19'

check('today', bucketFor({ state: 'draft', show_date: '2026-08-19' }, TODAY), 'today')
check('tomorrow', bucketFor({ state: 'draft', show_date: '2026-08-20' }, TODAY), 'tomorrow')
check('inside the week', bucketFor({ state: 'draft', show_date: '2026-08-26' }, TODAY), 'week')
check('just past the week', bucketFor({ state: 'draft', show_date: '2026-08-27' }, TODAY), 'later')
check('yesterday is done', bucketFor({ state: 'draft', show_date: '2026-08-18' }, TODAY), 'past')
check('no date', bucketFor({ state: 'draft', show_date: null }, TODAY), 'undated')

// A show that ran past midnight is still the show you are running.
check('live pins to the top', bucketFor({ state: 'live', show_date: '2026-08-18' }, TODAY), 'live')
check('live with no date still pins', bucketFor({ state: 'live', show_date: null }, TODAY), 'live')
check('a done show is not live', bucketFor({ state: 'done', show_date: '2026-08-19' }, TODAY), 'today')

check('day maths forward', daysFrom(TODAY, '2026-08-22'), 3)
check('day maths back', daysFrom(TODAY, '2026-08-16'), -3)
check('across a month boundary', daysFrom('2026-08-31', '2026-09-01'), 1)
// Denver is on daylight time in August, so a UTC-day comparison would be wrong
// here by one day for anything after 6pm local. Crossing to standard time in
// November must still be exactly one day apart.
check('across the DST boundary', daysFrom('2026-11-01', '2026-11-02'), 1)
check('a bad date is zero, not NaN', daysFrom(TODAY, 'not-a-date'), 0)

const shows = [
  { id: 'past-old', state: 'done', show_date: '2026-08-10' },
  { id: 'later', state: 'draft', show_date: '2026-09-30' },
  { id: 'today-a', state: 'draft', show_date: '2026-08-19' },
  { id: 'live', state: 'live', show_date: '2026-08-18' },
  { id: 'past-new', state: 'done', show_date: '2026-08-17' },
  { id: 'week', state: 'draft', show_date: '2026-08-24' },
]
const groups = groupShows(shows, TODAY)
check('bucket order', groups.map(g => g.bucket), ['live', 'today', 'week', 'later', 'past'])
check('empty buckets are dropped', groups.some(g => g.shows.length === 0), false)
check('past is newest first', groups.find(g => g.bucket === 'past')?.shows.map(s => s.id), ['past-new', 'past-old'])
check('nothing is lost', groups.reduce((n, g) => n + g.shows.length, 0), shows.length)
check('an empty list has no groups', groupShows([], TODAY), [])

// A fixed instant: 2026-08-20T01:30Z is still the evening of the 19th in Denver.
check('late UTC is still the local day before', localDay(new Date('2026-08-20T01:30:00Z')), '2026-08-19')
check('morning is the same day', localDay(new Date('2026-08-19T16:00:00Z')), '2026-08-19')

console.log(failures === 0 ? '\nALL SHOWS LIST TESTS PASS' : `\n${failures} SHOWS LIST TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)
