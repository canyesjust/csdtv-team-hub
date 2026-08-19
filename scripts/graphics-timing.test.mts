import { computeTiming, effectiveSeconds, type TimingRow } from '../lib/graphics/timing'

const R = (id: string, est: number, o: Partial<TimingRow> = {}): TimingRow =>
  ({ id, est_seconds: est, repeat_count: 0, per_unit_seconds: 0, floated: false, started_at: null, ended_at: null, ...o })

const AIR = Date.parse('2026-10-02T18:30:00Z')
const OUT = Date.parse('2026-10-02T21:45:00Z')
let fail = 0
const check = (name: string, cond: boolean, extra = '') => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '   ' + extra : ''))
  if (!cond) fail++
}

const rows = [R('a', 60), R('b', 120), R('c', 300)]
let t = computeTiming({ rows, airAt: AIR, hardOutAt: OUT, startedAt: null, airRowId: null })
check('TRT sums estimates', t.trt === 480, `trt=${t.trt}`)
check('window is PET-PST', t.window === 11700, `w=${t.window}`)
check('overUnder is TRT-W', t.overUnder === 480 - 11700)

// The identity that makes the columns readable: front[i] - back[i] is the same
// constant on every row, and it equals TRT - W.
const diffs = t.front.map((f, i) => (f - t.back[i]) / 1000)
check('front-back identical on every row', new Set(diffs.map(d => Math.round(d))).size === 1, `diffs=${diffs}`)
check('...and equals TRT-W', Math.round(diffs[0]) === Math.round(t.trt - t.window))

const floated = [R('a', 60), R('b', 120, { floated: true }), R('c', 300)]
t = computeTiming({ rows: floated, airAt: AIR, hardOutAt: OUT, startedAt: null, airRowId: null })
check('float removes its duration', t.trt === 360, `trt=${t.trt}`)
check('float still occupies an index', t.est.length === 3 && t.est[1] === 0)

check('repeating row is count x perUnit', effectiveSeconds(R('g', 0, { repeat_count: 412, per_unit_seconds: 4 })) === 1648)
check('floated repeating row is still zero', effectiveSeconds(R('g', 0, { repeat_count: 412, per_unit_seconds: 4, floated: true })) === 0)

const late = Date.parse('2026-10-02T18:32:30Z')
const live = [
  R('a', 60, { started_at: new Date(AIR).toISOString(), ended_at: new Date(late).toISOString() }),
  R('b', 120, { started_at: new Date(late).toISOString() }),
  R('c', 300),
]
t = computeTiming({ rows: live, airAt: AIR, hardOutAt: OUT, startedAt: AIR, airRowId: 'b' })
check('cursor found', t.cursor === 1)
check('front rebases to the real start', t.front[1] === late)
check('rows after the cursor follow from it', t.front[2] === late + 120_000)
check('live overUnder = T - back[cursor]', Math.round(t.overUnder) === Math.round((late - t.back[1]) / 1000))

const preair = computeTiming({ rows, airAt: AIR, hardOutAt: OUT, startedAt: null, airRowId: 'a' })
check('no start timestamp means planned math', preair.overUnder === 480 - 11700)

const heavy = [R('a', 7000), R('b', 7000)]
t = computeTiming({ rows: heavy, airAt: AIR, hardOutAt: OUT, startedAt: null, airRowId: null })
check('heavy show is positive', t.overUnder > 0, `ou=${t.overUnder}`)
check('projected end is past the hard out', t.projectedEnd > OUT)

t = computeTiming({ rows: [], airAt: AIR, hardOutAt: OUT, startedAt: null, airRowId: null })
check('empty rundown is safe', t.trt === 0 && t.front.length === 0 && Number.isFinite(t.projectedEnd))

if (fail > 0) {
  console.error(`\n${fail} FAILED`)
  process.exit(1)
}
console.log('\nALL TIMING TESTS PASS')
