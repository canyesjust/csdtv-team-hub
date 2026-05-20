'use client'

import type { PublicActiveMotion, VoteTally } from '@/lib/board-meetings/motion-types'
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

export function motionDisplayText(motion: PublicActiveMotion, maxLen = 320): string {
  const raw = motion.motion_text?.trim() || ''
  if (!raw) return ''
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw
}

function TallyRow({ tally }: { tally: VoteTally }) {
  if (tally.yea === 0 && tally.nay === 0 && tally.abstain === 0) return null
  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        paddingTop: '12px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        fontSize: '13px',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ color: '#4ade80' }}>Yea {tally.yea}</span>
      <span style={{ color: '#f87171' }}>Nay {tally.nay}</span>
      {tally.abstain > 0 ? <span style={{ color: OVERLAY_TEXT_MUTED }}>Abstain {tally.abstain}</span> : null}
      {tally.absent > 0 ? <span style={{ color: OVERLAY_TEXT_MUTED }}>Absent {tally.absent}</span> : null}
    </div>
  )
}

/** Main broadcast overlay — motion during voting (right-side panel). */
export function OverlayVoteSidePanel({
  motion,
  item,
}: {
  motion: PublicActiveMotion
  item: PublicAgendaItem | null
}) {
  const text = motionDisplayText(motion, 400)

  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        position: 'absolute',
        top: '24px',
        right: '24px',
        width: 'min(400px, calc(100vw - 48px))',
        maxHeight: 'calc(100vh - 48px)',
        overflow: 'auto',
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
        <p style={{ margin: '0 0 14px', fontSize: '12px', lineHeight: 1.35, color: OVERLAY_TEXT_SUBTLE }}>
          <span style={{ color: OVERLAY_TEXT_MUTED }}>{item.item_number}</span>
          {' · '}
          {item.title}
        </p>
      ) : null}
      {text ? (
        <p style={{ margin: '0 0 14px', fontSize: '20px', fontWeight: 600, lineHeight: 1.35 }}>{text}</p>
      ) : null}
      {(motion.moved_by_name || motion.seconded_by_name) && (
        <p style={{ margin: '0 0 14px', fontSize: '13px', color: OVERLAY_TEXT_MUTED, lineHeight: 1.4 }}>
          {motion.moved_by_name ? <>Moved by {motion.moved_by_name}</> : null}
          {motion.moved_by_name && motion.seconded_by_name ? <>, seconded by {motion.seconded_by_name}</> : null}
          {!motion.moved_by_name && motion.seconded_by_name ? <>Seconded by {motion.seconded_by_name}</> : null}
        </p>
      )}
      {motion.tally ? <TallyRow tally={motion.tally} /> : null}
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
  const text = motionDisplayText(motion, 280)
  const label = !motion.moved_by_name
    ? 'Motion being made'
    : motion.motion_type === 'substitute'
      ? 'Substitute motion'
      : 'Motion on floor'

  return (
    <div>
      {item ? <AgendaContextStrip item={item} variant="overlay" /> : null}
      <div
        className="obs-overlay-graphic"
        style={overlayPanelStyle({
          borderLeft: '4px solid #f59e0b',
          padding: '16px 20px',
          borderRadius: '4px',
          color: OVERLAY_TEXT_PRIMARY,
        })}
      >
        <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fbbf24' }}>
          {label}
          {motion.is_consent_block && motion.consent_block_label ? ` · ${motion.consent_block_label}` : ''}
        </p>
        {text ? (
          <p style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: 600, lineHeight: 1.35 }}>{text}</p>
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
