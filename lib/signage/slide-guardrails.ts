// AI signage slide generation: shared guardrails, prompt builder, and validator.
// Used by the /api/signage/generate-slide route. The validator is the security
// gate — model output is untrusted, so we re-check it server-side after generation.

export type SlideType = 'celebration' | 'announcement' | 'event' | 'welcome' | 'alert'
export type SlideMotion = 'none' | 'subtle' | 'lively'
export type SlideOrientation = 'landscape' | 'portrait'

export const SLIDE_TYPES: { value: SlideType; label: string }[] = [
  { value: 'celebration', label: 'Celebration / holiday' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'event', label: 'Event & countdown' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'alert', label: 'Alert' },
]

// Per-type word caps (denser types allow more; glanceable types stay tight).
export const WORD_CAPS: Record<SlideType, number> = {
  celebration: 25,
  welcome: 25,
  alert: 18,
  announcement: 45,
  event: 45,
}

const TYPE_STYLE: Record<SlideType, string> = {
  celebration: 'bold, festive, large numerals/imagery',
  announcement: 'clear who / what / when',
  event: 'title + date/time with countdown emphasis',
  welcome: 'warm greeting + name/space',
  alert: 'high-contrast, urgent, minimal',
}

export type SlideBrand = {
  locationName: string
  shortCode: string
  accent: string
  logoDataUri?: string | null // hosted logo fetched + base64-inlined (offline-safe)
}

export type SlidePromptParams = {
  prompt: string
  type: SlideType
  motion: SlideMotion
  orientation: SlideOrientation
  canvas: { w: number; h: number }
  dwellSeconds: number
  headlineOverride?: string | null
  brand: SlideBrand
}

export function wordCapForType(type: SlideType): number {
  return WORD_CAPS[type] ?? 25
}

/** Builds the system + user messages for the model. Returns HTML only. */
export function buildSlidePrompt(p: SlidePromptParams): { system: string; user: string } {
  const wordCap = wordCapForType(p.type)
  const headlineRule = p.headlineOverride
    ? `\n- The headline text must be exactly: "${p.headlineOverride}".`
    : ''
  const logoRule = p.brand.logoDataUri
    ? `\n- Include the provided logo (data URI) in the brand bar: <img src="${p.brand.logoDataUri}" alt="" />`
    : ''

  const system = [
    'You generate ONE self-contained HTML document for a digital signage slide displayed full-screen on a TV and read from across a room. Output ONLY the HTML — no explanation, no markdown fences.',
    '',
    'Hard requirements:',
    `- The slide fills a ${p.canvas.w}x${p.canvas.h} (${p.orientation}) area. Size everything in vmin/vh/vw, never fixed px.`,
    '- Headline text is at least 12% of the canvas height; no text smaller than 2%.',
    `- Use at most ${wordCap} words total and at most 3 distinct text blocks. Be sparse; this is glanceable signage, not a document.`,
    '- All text must have at least 7:1 contrast against what is behind it. If text sits over imagery or a busy background, add a solid or gradient scrim behind it.',
    '- Keep all content within a 5% safe margin on every edge.',
    `- Motion level: ${p.motion}. Animations must loop seamlessly, never flash faster than 3 times per second, and fit within a ${p.dwellSeconds}-second loop. If motion is "none", produce a static slide.`,
    '- Fully self-contained and offline-safe: inline all CSS; use ONLY system/web-safe fonts; no external scripts, stylesheets, fonts, or remote images; no network calls, no localStorage, no script that touches the parent window.',
    `- Apply the brand: include a slim brand bar with the school name "${p.brand.locationName}" and use accent color ${p.brand.accent}.${logoRule}`,
    headlineRule,
    '',
    `Style by type "${p.type}": ${TYPE_STYLE[p.type]}.`,
  ].join('\n')

  const user = `Content intent: ${p.prompt}`
  return { system, user }
}

export type ValidationResult = { ok: boolean; failures: string[] }

const PX_FONT = /font-size\s*:\s*\d*\.?\d+px/i
const EXTERNAL_URL = /(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i
const CSS_REMOTE = /url\(\s*["']?\s*(?:https?:)?\/\//i
const SCRIPT_SRC = /<script[^>]*\ssrc\s*=/i
const BANNED_JS = /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|window\.parent|window\.top|parent\.|top\.)\b/

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function wordCount(html: string): number {
  const t = visibleText(html)
  return t ? t.split(/\s+/).length : 0
}

/**
 * Server-side gate run on every generation. Checks the mechanically-verifiable
 * guardrails; contrast is enforced via the prompt + sandbox + human approval
 * (true contrast needs a render and is checked by reviewers, not here).
 */
export function validateSlideHtml(html: string, opts: { wordCap: number }): ValidationResult {
  const failures: string[] = []
  const h = (html || '').trim()

  if (!h.toLowerCase().includes('<!doctype html') && !h.toLowerCase().includes('<html')) {
    failures.push('Output is not a complete HTML document.')
  }
  if (PX_FONT.test(h)) {
    failures.push('Uses fixed px font sizes — must use vmin/vh/vw so it scales on any screen.')
  }
  const words = wordCount(h)
  if (words > opts.wordCap) {
    failures.push(`Too much text: ${words} words (max ${opts.wordCap}). Cut it down.`)
  }
  if (EXTERNAL_URL.test(h) || CSS_REMOTE.test(h)) {
    failures.push('References an external/remote resource — everything must be inlined (offline-safe).')
  }
  if (SCRIPT_SRC.test(h)) {
    failures.push('Loads an external script — not allowed.')
  }
  if (BANNED_JS.test(h)) {
    failures.push('Contains network/storage/parent-window access — not allowed in the sandbox.')
  }

  return { ok: failures.length === 0, failures }
}
