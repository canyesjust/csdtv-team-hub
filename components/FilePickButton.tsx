'use client'

import { useId, useState } from 'react'

export type FilePickButtonProps = {
  accept?: string
  disabled?: boolean
  label?: string
  changeLabel?: string
  variant?: 'primary' | 'secondary'
  fullWidth?: boolean
  showFileName?: boolean
  capture?: boolean | 'user' | 'environment'
  onChange: (file: File | null) => void
  inputRef?: React.Ref<HTMLInputElement>
}

function assignRef(node: HTMLInputElement | null, ref?: React.Ref<HTMLInputElement>) {
  if (!ref) return
  if (typeof ref === 'function') ref(node)
  else ref.current = node
}

export default function FilePickButton({
  accept,
  disabled = false,
  label = 'Choose file',
  changeLabel = 'Change file',
  variant = 'primary',
  fullWidth = false,
  showFileName = true,
  capture,
  onChange,
  inputRef,
}: FilePickButtonProps) {
  const id = useId()
  const [fileName, setFileName] = useState<string | null>(null)

  const isPrimary = variant === 'primary'
  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '44px',
    padding: '10px 18px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'inherit',
    lineHeight: 1.2,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.65 : 1,
    width: fullWidth ? '100%' : 'auto',
    boxSizing: 'border-box',
    textAlign: 'center',
    ...(isPrimary
      ? {
          background: '#1e6cb5',
          color: '#fff',
          border: 'none',
        }
      : {
          background: 'var(--surface-2, #f8f9fc)',
          color: 'var(--text-primary, #1a1f36)',
          border: '0.5px solid var(--border-subtle, rgba(0,0,0,0.08))',
        }),
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: fullWidth ? 'stretch' : 'flex-start',
        width: fullWidth ? '100%' : 'auto',
      }}
    >
      <label
        htmlFor={id}
        style={{
          display: fullWidth ? 'block' : 'inline-block',
          cursor: disabled ? 'not-allowed' : 'pointer',
          width: fullWidth ? '100%' : 'auto',
        }}
      >
        <input
          id={id}
          ref={node => assignRef(node, inputRef)}
          type="file"
          accept={accept}
          capture={capture}
          disabled={disabled}
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0] ?? null
            setFileName(file?.name ?? null)
            onChange(file)
          }}
        />
        <span style={buttonStyle}>{fileName ? changeLabel : label}</span>
      </label>
      {showFileName && fileName && (
        <span
          style={{
            fontSize: '13px',
            color: 'var(--text-muted, #6b7280)',
            wordBreak: 'break-all' as const,
            lineHeight: 1.4,
          }}
        >
          {fileName}
        </span>
      )}
    </div>
  )
}
