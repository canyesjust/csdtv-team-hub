// Golden-master harness for the React screen page (ScreenClient).
// Bundles ScreenClient with esbuild (CSS + hls.js stubbed), renders each fixture
// to static markup, and diffs before/after a refactor. This captures the INITIAL
// render only (effects don't run), which is exactly what we need to prove a
// presentational refactor didn't change the DOM. Pair with signage-golden.mjs
// (baked HTML). Usage:
//   node scripts/signage-react-golden.mjs snapshot
//   node scripts/signage-react-golden.mjs check
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const OUT = path.join(process.cwd(), '.signage-golden', 'react')
const ENTRY = 'scripts/_react-render-entry.jsx'
const BUNDLE = path.join(process.cwd(), '.signage-golden', '_react-render.cjs')

async function renderAll() {
  fs.mkdirSync(path.dirname(BUNDLE), { recursive: true })
  await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true, platform: 'node', format: 'cjs', outfile: BUNDLE,
    loader: { '.css': 'empty' }, jsx: 'automatic', logLevel: 'silent',
    plugins: [{
      name: 'stub-hls',
      setup(b) {
        b.onResolve({ filter: /^hls\.js$/ }, () => ({ path: 'hls-stub', namespace: 'stub' }))
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'module.exports = class Hls { static isSupported(){return false} };', loader: 'js',
        }))
      },
    }],
    absWorkingDir: process.cwd(),
  })
  delete require.cache[BUNDLE]
  // The entry writes JSON to stdout; re-run it in a child to capture cleanly.
  const { execFileSync } = require('node:child_process')
  const raw = execFileSync(process.execPath, [BUNDLE], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(raw)
}

const mode = process.argv[2] || 'check'
fs.mkdirSync(OUT, { recursive: true })

const rendered = await renderAll()
let fail = 0
for (const name of Object.keys(rendered)) {
  const html = rendered[name]
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
        if (a[i] !== b[i]) { shown++; console.log(`  L${i + 1} OLD ${JSON.stringify((a[i] || '').slice(0, 140))}`); console.log(`  L${i + 1} NEW ${JSON.stringify((b[i] || '').slice(0, 140))}`) }
      }
    }
  }
}
process.exit(fail && mode === 'check' ? 1 : 0)
