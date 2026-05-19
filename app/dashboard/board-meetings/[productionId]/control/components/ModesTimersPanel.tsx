'use client'

import type { ControlBundle } from '@/lib/board-meetings/types'

type Props = {
  canControl: boolean
  state: ControlBundle['broadcast_state']
  timer: ControlBundle['active_timer']
  templates?: ControlBundle['timer_templates']
  onAction: (action: string, body?: unknown) => Promise<void>
}

export default function ModesTimersPanel({ canControl, state, timer, templates, onAction }: Props) {
  return (
    <>
      <div className="control-btn-row" style={{ marginBottom: 12 }}>
        <button type="button" className="cs-touchbtn" disabled={!canControl} onClick={() => onAction('recess', { message: 'Recess' })}>Recess</button>
        <button type="button" className="cs-touchbtn" disabled={!canControl} onClick={() => onAction('technical-difficulties')}>Tech diff</button>
        <button type="button" className="cs-touchbtn" disabled={!canControl} onClick={() => onAction('clear-mode')}>Clear mode</button>
      </div>
      {(templates || []).length > 0 && (
        <div className="control-btn-row" style={{ marginBottom: 12 }}>
          {(templates || []).map(t => (
            <button key={t.id} type="button" className="cs-touchbtn" disabled={!canControl} onClick={() => onAction('start-timer', { template_id: t.id })}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      {state?.mode_message ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>{state.mode_message}</p>
      ) : null}
      {timer ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>Timer: {timer.label}</p>
      ) : null}
      <div className="control-btn-row">
        <button type="button" className="cs-touchbtn" disabled={!canControl || !timer} onClick={() => onAction('end-timer')}>End timer</button>
        <button type="button" className="cs-touchbtn" disabled={!canControl || !timer} onClick={() => onAction('cancel-timer')}>Cancel timer</button>
      </div>
    </>
  )
}
