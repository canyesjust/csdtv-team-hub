import type { CSSProperties } from 'react'

/**
 * Opaque fills for OBS browser sources.
 * Semi-transparent rgba panels let the video layer show through in OBS compositing.
 */
export const OVERLAY_PANEL_BG = '#102441'
export const OVERLAY_PANEL_BG_ALT = '#16315a'
export const OVERLAY_ACCENT = '#f5b53f'
export const OVERLAY_TEXT_PRIMARY = '#f4f7fc'
export const OVERLAY_TEXT_MUTED = '#9bb0d0'
export const OVERLAY_TEXT_SUBTLE = '#7f97bd'

/** Base panel style — solid background, full opacity, isolated stacking context. */
export function overlayPanelStyle(extra?: CSSProperties): CSSProperties {
  return {
    backgroundColor: OVERLAY_PANEL_BG,
    opacity: 1,
    isolation: 'isolate',
    ...extra,
  }
}
