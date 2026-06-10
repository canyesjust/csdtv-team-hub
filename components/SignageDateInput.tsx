'use client'

import { useCallback } from 'react'

export function localDateString(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type SignageDateInputProps = {
  value: string
  onChange: (value: string) => void
  style?: React.CSSProperties
  /** Fill with today when focused/clicked while empty (use on start dates). */
  defaultToToday?: boolean
  min?: string
  max?: string
  /** Pass through for dark dashboard themes so native date controls stay readable. */
  colorScheme?: 'light' | 'dark'
}

export default function SignageDateInput({
  value,
  onChange,
  style,
  defaultToToday = false,
  min,
  max,
  colorScheme,
}: SignageDateInputProps) {
  const openPicker = useCallback(
    (el: HTMLInputElement) => {
      if (defaultToToday && !value) {
        onChange(localDateString())
      }
      try {
        el.showPicker?.()
      } catch {
        /* showPicker unsupported or requires user gesture elsewhere */
      }
    },
    [defaultToToday, value, onChange],
  )

  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value)}
      onFocus={e => openPicker(e.currentTarget)}
      onClick={e => openPicker(e.currentTarget)}
      style={{
        minHeight: 40,
        cursor: 'pointer',
        colorScheme,
        ...style,
      }}
    />
  )
}
