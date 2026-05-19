'use client'

import MotionScreenFrame from '../components/MotionScreenFrame'
import OpenForDiscussionState from './OpenForDiscussionState'
import type { MotionScreenStateProps } from '../motion-screen-types'

export default function DraftingState(props: MotionScreenStateProps) {
  const { bundle, busy, onAction } = props
  const disabled = !bundle.can_control || !bundle.is_live || busy
  const currentItem = bundle.current_agenda_item

  if (props.active) {
    return <OpenForDiscussionState {...props} active={props.active} />
  }

  return (
    <MotionScreenFrame {...props} active={null}>
      <div className="cs-card">
        <p className="cs-eyebrow">Open a motion</p>
        {currentItem ? (
          <p style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text-primary)' }}>{currentItem.title}</p>
        ) : (
          <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-muted)' }}>
            Advance to an action item on the control surface first.
          </p>
        )}
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-primary"
          disabled={disabled || !currentItem}
          onClick={() => {
            if (!currentItem) return
            void onAction('open', {
              motion_type: 'main',
              agenda_item_id: currentItem.id,
              motion_text: `Move to approve ${currentItem.title}`,
            })
          }}
        >
          Open main motion
        </button>
        {bundle.consent_is_lead && bundle.consent_range ? (
          <button
            type="button"
            className="cs-touchbtn"
            style={{ marginTop: 8, width: '100%' }}
            disabled={disabled}
            onClick={() => {
              if (!currentItem?.consent_block) return
              void onAction('open', {
                motion_type: 'main',
                consent_block: currentItem.consent_block,
                motion_text: 'Move to approve the consent agenda as presented',
              })
            }}
          >
            Open consent motion ({bundle.consent_range})
          </button>
        ) : null}
      </div>
    </MotionScreenFrame>
  )
}
