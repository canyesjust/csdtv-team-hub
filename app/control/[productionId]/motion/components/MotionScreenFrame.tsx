'use client'

import MotionContextBar from './MotionContextBar'
import type { MotionScreenStateProps } from '../motion-screen-types'
import { uiMotionStatus } from '../motion-screen-types'

export default function MotionScreenFrame({
  bundle,
  busy,
  error,
  onMinimize,
  active,
  children,
}: MotionScreenStateProps & { children: React.ReactNode }) {
  const currentItem = bundle.current_agenda_item
  const itemLabel = currentItem ? `${currentItem.item_number} ${currentItem.title}` : null
  const statusLabel = uiMotionStatus(bundle, active).replace(/_/g, ' ')

  return (
    <>
      <header className="ms-topbar">
        <h1 className="ms-topbar__title">Motion &amp; vote</h1>
        <div className="ms-topbar__actions">
          <button type="button" className="cs-touchbtn" onClick={onMinimize} disabled={busy}>
            Minimize
          </button>
        </div>
      </header>

      {error ? (
        <p className="control-banner" style={{ margin: '8px 12px 0' }} role="alert">
          {error}
        </p>
      ) : null}

      <MotionContextBar
        productionId={bundle.meeting.production_id}
        itemLabel={itemLabel}
        statusLabel={statusLabel}
      />

      <div className="ms-body">{children}</div>
    </>
  )
}
