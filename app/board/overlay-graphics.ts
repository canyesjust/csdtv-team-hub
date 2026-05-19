import type { CSSProperties } from 'react'

/**
 * Opaque fills for OBS browser sources.
 * Semi-transparent rgba panels let the video layer show through in OBS compositing.
 */
export const OVERLAY_PANEL_BG = '#0a0f1e'
export const OVERLAY_PANEL_BG_ALT = '#0f172a'
export const OVERLAY_TEXT_PRIMARY = '#f0f4ff'
export const OVERLAY_TEXT_MUTED = '#94a3b8'
export const OVERLAY_TEXT_SUBTLE = '#8899bb'

/** Base panel style — solid background, full opacity, isolated stacking context. */
export function overlayPanelStyle(extra?: CSSProperties): CSSProperties {
  return {
    backgroundColor: OVERLAY_PANEL_BG,
    opacity: 1,
    isolation: 'isolate',
    ...extra,
  }
}
