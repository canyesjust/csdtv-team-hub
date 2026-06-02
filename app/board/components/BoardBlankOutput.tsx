/** Default public output when nothing is intentionally on air. */

const FULLSCREEN_BG = '#04080f'

export function BoardBlankFullscreen() {
  return <div style={{ minHeight: '100vh', background: FULLSCREEN_BG }} aria-hidden />
}

export function BoardBlankOverlay() {
  return null
}
