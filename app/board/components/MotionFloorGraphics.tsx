'use client'

import type { CSSProperties } from 'react'
import type { PublicActiveMotion } from '@/lib/board-meetings/motion-types'
import type { PublicAgendaItem } from '@/lib/board-meetings/public-output-state'
import {
  overlayPanelStyle,
  OVERLAY_TEXT_MUTED,
  OVERLAY_TEXT_PRIMARY,
  OVERLAY_TEXT_SUBTLE,
} from '@/app/board/overlay-graphics'

/** Compact agenda line when a motion is on the floor. */
export function AgendaContextStrip({
  item,
  variant = 'overlay',
}: {
  item: Pick<PublicAgendaItem, 'item_number' | 'title' | 'section_title'>
  variant?: 'overlay' | 'dais'
}) {
  if (variant === 'dais') {
    return (
      <div style={{ marginBottom: '18px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>
          Agenda item
        </p>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, lineHeight: 1.35, color: '#94a3b8' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', color: '#38bdf8', marginRight: '10px' }}>{item.item_number}</span>
          {item.title}
        </p>
      </div>
    )
  }

  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        padding: '10px 14px',
        borderRadius: '4px',
        color: OVERLAY_TEXT_PRIMARY,
        marginBottom: '10px',
        borderLeft: '3px solid #475569',
      })}
    >
      <p style={{ margin: '0 0 2px', fontSize: '11px', color: OVERLAY_TEXT_SUBTLE, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {item.section_title} · {item.item_number}
      </p>
      <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, lineHeight: 1.3, color: OVERLAY_TEXT_MUTED }}>{item.title}</p>
    </div>
  )
}

export type MotionTextPreset =
  | 'overlay-panel'
  | 'overlay-card'
  | 'overlay-result'
  | 'dais'
  | 'dais-hero'
  | 'live-compact'

const MOTION_TEXT_PRESETS: Record<
  MotionTextPreset,
  { maxLines: number; minPx: number; vw: number; maxPx: number; weight: number }
> = {
  'overlay-panel': { maxLines: 6, minPx: 14, vw: 1.9, maxPx: 20, weight: 600 },
  'overlay-card': { maxLines: 5, minPx: 15, vw: 2.1, maxPx: 22, weight: 600 },
  'overlay-result': { maxLines: 3, minPx: 13, vw: 1.7, maxPx: 17, weight: 500 },
  dais: { maxLines: 5, minPx: 17, vw: 2.1, maxPx: 26, weight: 500 },
  'dais-hero': { maxLines: 4, minPx: 20, vw: 2.6, maxPx: 34, weight: 600 },
  'live-compact': { maxLines: 4, minPx: 12, vw: 1.5, maxPx: 14, weight: 500 },
}

function scaledMaxPx(len: number, maxPx: number, minPx: number): number {
  if (len > 360) return Math.max(minPx, maxPx - 8)
  if (len > 220) return Math.max(minPx, maxPx - 5)
  if (len > 120) return Math.max(minPx, maxPx - 2)
  return maxPx
}

/** Full motion wording — layout clamps/wraps in the graphic. */
export function fitMotionText(source: string | Pick<PublicActiveMotion, 'motion_text'>): string {
  const raw = typeof source === 'string' ? source : source.motion_text
  return raw?.trim() || ''
}

/** @deprecated Use fitMotionText — kept for call sites that still import the old name. */
export function motionDisplayText(motion: PublicActiveMotion, _maxLen = 320): string {
  return fitMotionText(motion)
}

export function motionTextFitStyle(text: string, preset: MotionTextPreset): CSSProperties {
  const p = MOTION_TEXT_PRESETS[preset]
  const maxPx = scaledMaxPx(text.length, p.maxPx, p.minPx)
  return {
    margin: 0,
    fontSize: `clamp(${p.minPx}px, ${p.vw}vw, ${maxPx}px)`,
    lineHeight: 1.35,
    fontWeight: p.weight,
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: p.maxLines,
    overflow: 'hidden',
    maxWidth: '100%',
  }
}

/** Main broadcast overlay — motion during voting (right-side panel). */
export function OverlayVoteSidePanel({
  motion,
  item,
}: {
  motion: PublicActiveMotion
  item: PublicAgendaItem | null
}) {
  const text = fitMotionText(motion)

  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        position: 'absolute',
        top: '24px',
        right: '24px',
        width: 'min(400px, calc(100vw - 48px))',
        maxHeight: 'calc(100vh - 48px)',
        overflow: 'hidden',
        padding: '18px 20px',
        borderRadius: '8px',
        color: OVERLAY_TEXT_PRIMARY,
        border: '1px solid rgba(96, 165, 250, 0.45)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        zIndex: 15,
      })}
    >
      <p style={{ margin: '0 0 12px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#93c5fd' }}>
        Voting open
        {motion.is_consent_block && motion.consent_block_label ? ` · ${motion.consent_block_label}` : ''}
      </p>
      {item ? (
        <p
          style={{
            margin: '0 0 14px',
            fontSize: '12px',
            lineHeight: 1.35,
            color: OVERLAY_TEXT_SUBTLE,
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}
        >
          <span style={{ color: OVERLAY_TEXT_MUTED }}>{item.item_number}</span>
          {' · '}
          {item.title}
        </p>
      ) : null}
      {text ? (
        <p style={{ ...motionTextFitStyle(text, 'overlay-panel'), margin: '0 0 14px' }}>{text}</p>
      ) : null}
      {(motion.moved_by_name || motion.seconded_by_name) && (
        <p style={{ margin: 0, fontSize: '13px', color: OVERLAY_TEXT_MUTED, lineHeight: 1.4 }}>
          {motion.moved_by_name ? <>Moved by {motion.moved_by_name}</> : null}
          {motion.moved_by_name && motion.seconded_by_name ? <>, seconded by {motion.seconded_by_name}</> : null}
          {!motion.moved_by_name && motion.seconded_by_name ? <>Seconded by {motion.seconded_by_name}</> : null}
        </p>
      )}
    </div>
  )
}

/** Main broadcast overlay — motion on floor (discussion / drafting on air). */
export function OverlayMotionCard({
  motion,
  item,
}: {
  motion: PublicActiveMotion
  item: PublicAgendaItem | null
}) {
  const text = fitMotionText(motion)
  const label = !motion.moved_by_name
    ? 'Motion being made'
    : motion.motion_type === 'substitute'
      ? 'Substitute motion'
      : 'Motion on floor'

  return (
    <div style={{ maxWidth: 'min(720px, calc(100vw - 48px))' }}>
      {item ? <AgendaContextStrip item={item} variant="overlay" /> : null}
      <div
        className="obs-overlay-graphic"
        style={overlayPanelStyle({
          borderLeft: '4px solid #f59e0b',
          padding: '16px 20px',
          borderRadius: '4px',
          color: OVERLAY_TEXT_PRIMARY,
          overflow: 'hidden',
        })}
      >
        <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fbbf24' }}>
          {label}
          {motion.is_consent_block && motion.consent_block_label ? ` · ${motion.consent_block_label}` : ''}
        </p>
        {text ? (
          <p style={{ ...motionTextFitStyle(text, 'overlay-card'), margin: '0 0 10px' }}>{text}</p>
        ) : null}
        {motion.moved_by_name ? (
          <p style={{ margin: 0, fontSize: '14px', color: OVERLAY_TEXT_MUTED }}>
            {motion.moved_by_name}
            {motion.seconded_by_name ? `, seconded by ${motion.seconded_by_name}` : ''}
          </p>
        ) : null}
      </div>
    </div>
  )
}
