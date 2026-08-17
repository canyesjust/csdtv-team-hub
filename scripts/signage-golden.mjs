// Golden-master render harness for the AbleSign baked HTML.
// Renders renderScreenDocument() from a fixed in-memory feed (no Supabase, no
// network) across every layout, so we can diff the baked output byte-for-byte
// before/after a refactor. Usage:
//   npx tsx scripts/signage-golden.mjs snapshot   # write golden files
//   npx tsx scripts/signage-golden.mjs check      # diff current vs golden
import fs from 'node:fs'
import path from 'node:path'
import { renderScreenDocument } from '../lib/signage/build-screen-html.ts'
import { CASES } from './signage-fixtures.mjs'

// Freeze the clock so the render is deterministic. The zoned2 layout bakes
// today's date into the markup (build-screen-html.ts -> dateStr), so without
// this the snapshot goes stale the day after it's taken and `check` fails
// forever on a date string nobody changed. Same trick as _react-render-entry.jsx.
// This instant is the one the committed goldens were taken at — Thursday, July 30.
const FIXED = new Date('2026-07-30T15:30:00-06:00').getTime()
const RealDate = Date
class FrozenDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [FIXED])) }
  static now() { return FIXED }
}
globalThis.Date = FrozenDate

const OUT = path.join(process.cwd(), '.signage-golden')

const mode = process.argv[2] || 'check'
fs.mkdirSync(OUT, { recursive: true })

let fail = 0
for (const [name, feed] of CASES) {
  const html = renderScreenDocument(feed)
  const file = path.join(OUT, `${name}.html`)
  if (mode === 'snapshot') {
    fs.writeFileSync(file, html)
    console.log(`snapshot ${name} (${Buffer.byteLength(html)} bytes)`)
  } else {
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    if (prev === null) { console.log(`NO GOLDEN for ${name} — run snapshot first`); fail++; continue }
    if (prev === html) { console.log(`OK    ${name}`) }
    else {
      fail++
      const a = prev.split('\n'), b = html.split('\n')
      console.log(`DIFF  ${name} (was ${prev.length} now ${html.length} chars)`)
      let shown = 0
      for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
        if (a[i] !== b[i]) { shown++; console.log(`  L${i + 1} OLD ${JSON.stringify((a[i] || '').slice(0, 120))}`); console.log(`  L${i + 1} NEW ${JSON.stringify((b[i] || '').slice(0, 120))}`) }
      }
    }
  }
}
process.exit(fail && mode === 'check' ? 1 : 0)
