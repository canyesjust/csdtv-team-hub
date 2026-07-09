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
