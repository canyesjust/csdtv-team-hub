// Generates lib/signage/screen-inline-css.generated.ts as a verbatim, inlined
// copy of the signage screen stylesheet. The CSS file is the single source of
// truth; the generated string feeds the self-contained AbleSign HTML web app
// (which has no external stylesheet). Runs automatically on predev/prebuild so
// the two copies can never drift.
import fs from 'node:fs'
import path from 'node:path'

const CSS_PATH = 'app/signage/screen/[code]/signage-screen.css'
const OUT_PATH = 'lib/signage/screen-inline-css.generated.ts'

const css = fs.readFileSync(CSS_PATH, 'utf8')

const header =
  `// AUTO-GENERATED — verbatim copy of ${CSS_PATH}.\n` +
  `// The CSS file is the single source of truth; this inlined copy feeds the\n` +
  `// self-contained AbleSign HTML web app. Do NOT edit by hand.\n` +
  `// Regenerate with:  npm run gen:css   (also runs on predev/prebuild).\n\n`

const body = `export const SCREEN_INLINE_CSS = ${JSON.stringify(css)}\n`

const next = header + body
const prev = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : ''

if (prev !== next) {
  fs.writeFileSync(OUT_PATH, next)
  console.log(`[gen-signage-css] wrote ${OUT_PATH} (${Buffer.byteLength(css)} bytes of CSS)`)
} else {
  console.log('[gen-signage-css] up to date')
}
