import { parseRosterCsv, sanitizePlayers, findByJersey } from '../lib/graphics/rosters'

let fail = 0
const check = (n: string, c: boolean, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '   ' + e : ''))
  if (!c) fail++
}

// MaxPreps export shape, which is what a coach can actually produce without
// being asked to reformat anything.
const maxpreps = `iscaptain,jersey,firstname,lastname,position1,position2,bio,classyear
1,11,Marcus,Hall,Running back,,,Senior
0,23,Lucia,Ortiz,Cornerback,,,Senior
0,3,Ava,Whitmore,Quarterback,,,Junior`

let p = parseRosterCsv(maxpreps)
check('parses a MaxPreps export', p.length === 3, `got ${p.length}`)
check('jersey lands', p[0].jersey === '11', p[0].jersey)
check('first and last are joined', p[0].name === 'Marcus Hall', p[0].name)
check('position lands', p[0].pos === 'Running back', p[0].pos)
check('class year lands', p[0].cls === 'Senior', p[0].cls)

p = parseRosterCsv(`jersey,name,class,position\n7,Tanner Boyd,Junior,Forward`)
check('handles a plain name column', p[0].name === 'Tanner Boyd' && p[0].pos === 'Forward')

p = parseRosterCsv(`11,Marcus Hall,Senior,RB\n23,Lucia Ortiz,Senior,CB`)
check('headerless falls back to position', p.length === 2 && p[1].name === 'Lucia Ortiz')

p = parseRosterCsv(`jersey,name,class,position\n"11","Hall, Marcus","Senior","RB"`)
check('strips surrounding quotes', p[0].jersey === '11', JSON.stringify(p[0]))

p = sanitizePlayers([{ jersey: '1'.repeat(50), name: 'x'.repeat(500), cls: 5, pos: null }, {}, null, 'nope'])
check('bounds the jersey', p[0].jersey.length === 4)
check('bounds the name', p[0].name.length === 80)
check('coerces non-strings to empty', p[0].cls === '' && p[0].pos === '')
check('drops empty entries', p.length === 1, `len ${p.length}`)
check('caps the list at 200',
  sanitizePlayers(Array.from({ length: 500 }, (_, i) => ({ jersey: String(i), name: 'a' }))).length === 200)
check('a non-array is empty', sanitizePlayers('nope').length === 0)

const roster = parseRosterCsv(maxpreps)
check('finds by jersey', findByJersey(roster, '23')?.name === 'Lucia Ortiz')
check('misses cleanly', findByJersey(roster, '99') === null)
check('number and string agree', findByJersey(roster, String(11))?.name === 'Marcus Hall')
check('empty csv is safe', parseRosterCsv('').length === 0)

if (fail > 0) {
  console.error(`\n${fail} FAILED`)
  process.exit(1)
}
console.log('\nALL ROSTER TESTS PASS')
