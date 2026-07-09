// Freeze the clock so the initial render is deterministic (ScreenClient reads
// `new Date()` for the clock, weather day/night, and date strings). Without this
// the rendered markup changes every second and can't be byte-diffed.
const FIXED = new Date('2026-07-08T15:30:00-06:00').getTime()
const RealDate = Date
class FrozenDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [FIXED])) }
  static now() { return FIXED }
}
globalThis.Date = FrozenDate

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ScreenClient from '../app/signage/screen/[code]/ScreenClient.tsx'
import { CASES } from './signage-fixtures.mjs'

const out = {}
for (const [name, feed] of CASES) {
  out[name] = renderToStaticMarkup(
    React.createElement(ScreenClient, { code: feed.screen.code, initialFeed: feed, imageSeconds: 10 }),
  )
}
process.stdout.write(JSON.stringify(out))
