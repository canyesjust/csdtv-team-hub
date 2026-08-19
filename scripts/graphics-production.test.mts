import {
  guessEventType, guessSchoolCode, guessVenue, normalizeSchoolCode, productionDate, isGraphicsCandidate,
  type ProductionSummary,
} from '../lib/graphics/production-map.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

const p = (over: Partial<ProductionSummary>): ProductionSummary => ({
  id: 'x', production_number: 1, title: '', status: null,
  event_date: null, start_datetime: null, end_datetime: null,
  location: null, event_location: null, filming_location: null,
  school_department: null, internal_type_label: null, video_shoot_type: null,
  ...over,
})

const SCHOOLS = [
  { code: '407', name: 'Draper Park Middle', short_name: 'Draper Park' },
  { code: '711', name: 'Corner Canyon High', short_name: 'Corner Canyon' },
  { code: '051', name: 'Canyons District Office', short_name: null },
  { code: '011', name: 'Board of Education', short_name: null },
]

// --- event type, against real titles out of the productions table -----------
check('a band concert', guessEventType(p({ title: 'Fall Band and Orchestra Concert' })), 'concert')
check('a marching band showcase', guessEventType(p({ title: 'Canyons District Marching Band Showcase' })), 'concert')
check('a football game', guessEventType(p({ title: 'Corner Canyon vs Alta Football' })), 'game')
check('graduation', guessEventType(p({ title: '2027 Graduation' })), 'ceremony')
check('a parade', guessEventType(p({ title: 'Draper Days Parade' })), 'parade')
check('a recording falls through to other', guessEventType(p({ title: 'Para Training Recording', internal_type_label: 'Record' })), 'other')
// Ceremony wins over concert when both words are present, because the names are
// the spine of the show and the music is incidental.
check('an awards concert is a ceremony', guessEventType(p({ title: 'Choir Awards Night' })), 'ceremony')

// --- what belongs in the picker at all --------------------------------------
check('board meetings are excluded', isGraphicsCandidate(p({ internal_type_label: 'Board Meeting' })), false)
check('photo shoots are excluded', isGraphicsCandidate(p({ internal_type_label: 'Photos' })), false)
check('livestreams are in', isGraphicsCandidate(p({ internal_type_label: 'Livestream' })), true)
check('an unlabelled production is in', isGraphicsCandidate(p({})), true)

// --- school codes. The district drops leading zeros, schools.code does not ---
check('a three digit code', normalizeSchoolCode('407'), '407')
check('a two digit code pads', normalizeSchoolCode('51'), '051')
check('a single digit pads', normalizeSchoolCode('1'), '001')
check('a padded four digit strips', normalizeSchoolCode('0407'), '407')
check('text is not a code', normalizeSchoolCode('Draper Park'), null)
check('empty is not a code', normalizeSchoolCode(null), null)

check('filming location wins', guessSchoolCode(p({ filming_location: '407', school_department: '021' }), SCHOOLS), '407')
check('department is the fallback', guessSchoolCode(p({ school_department: '711' }), SCHOOLS), '711')
check('an unpadded department resolves', guessSchoolCode(p({ school_department: '51' }), SCHOOLS), '051')
check('an unknown code is null', guessSchoolCode(p({ filming_location: '999' }), SCHOOLS), null)
check('a named department still matches', guessSchoolCode(p({ school_department: 'corner canyon athletics' }), SCHOOLS), '711')

// --- venue -------------------------------------------------------------------
check('typed venue wins', guessVenue(p({ event_location: 'Main Auditorium', filming_location: '407' }), SCHOOLS), 'Main Auditorium')
check('a code resolves to the school', guessVenue(p({ filming_location: '407' }), SCHOOLS), 'Draper Park Middle')
check('a numeric event_location is not a venue', guessVenue(p({ event_location: '407' }), SCHOOLS), 'Draper Park Middle')
check('nothing to go on', guessVenue(p({}), SCHOOLS), null)

// --- the date. Every record has start_datetime and none has event_date, which
// is exactly the bug that made the picker render empty.
check('start_datetime is the date', productionDate(p({ start_datetime: '2026-10-02T00:00:00+00' })), '2026-10-02T00:00:00+00')
check('event_date is the fallback', productionDate(p({ event_date: '2026-10-02' })), '2026-10-02T12:00:00.000Z')
check('neither is null', productionDate(p({})), null)

console.log(failures === 0 ? '\nALL PRODUCTION MAP TESTS PASS' : `\n${failures} PRODUCTION MAP TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)
