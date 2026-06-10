'use client'

// AsyncButton: a <button> that runs an async onClick, disables itself while the
// action is in flight, and shows an inline spinner so the user gets feedback.
// Keeps the app's inline-style convention: pass `style` exactly as you would a
// normal button. Falls back to its children's text color for the spinner.
//
// Usage:
//   <AsyncButton onClick={async () => { await save() }} style={primaryBtn}>
//     Save
//   </AsyncButton>

import { useState, type CSSProperties, type ReactNode, type MouseEvent } from 'react'

export function Spinner({
  size = 16,
  color = 'currentColor',
  thickness = 2,
}: {
  size?: number
  color?: string
  thickness?: number
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `${thickness}px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'csdtv-spin 0.6s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

type AsyncButtonProps = {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  children: ReactNode
  /** Inline styles, merged after the layout defaults so you can override freely. */
  style?: CSSProperties
  disabled?: boolean
  /** Optional label shown in place of children while pending (e.g. "Saving..."). */
  pendingLabel?: ReactNode
  type?: 'button' | 'submit'
  title?: string
  spinnerColor?: string
  'aria-label'?: string
}

export function AsyncButton({
  onClick,
  children,
  style,
  disabled,
  pendingLabel,
  type = 'button',
  title,
  spinnerColor,
  'aria-label': ariaLabel,
}: AsyncButtonProps) {
  const [pending, setPending] = useState(false)

  const handle = async (e: MouseEvent<HTMLButtonElement>) => {
    if (pending || disabled) return
    try {
      setPending(true)
      await onClick(e)
    } finally {
      setPending(false)
    }
  }

  const isDisabled = disabled || pending

  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending}
      onClick={handle}
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontFamily: 'inherit',
        transition:
          'filter var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard)',
        ...style,
      }}
    >
      {pending && <Spinner size={15} color={spinnerColor} />}
      <span style={{ opacity: pending ? 0.85 : 1, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        {pending && pendingLabel ? pendingLabel : children}
      </span>
    </button>
  )
}

export default AsyncButton
