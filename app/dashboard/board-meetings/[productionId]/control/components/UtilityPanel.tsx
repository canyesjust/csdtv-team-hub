'use client'

import { ReactNode, useState } from 'react'

type Props = {
  title: string
  summary?: string
  icon?: string
  forceOpen?: boolean
  children: ReactNode
}

export default function UtilityPanel({ title, summary, forceOpen, children }: Props) {
  const [open, setOpen] = useState(!!forceOpen)
  const isOpen = forceOpen || open

  return (
    <div className="cs-utility-panel">
      <button
        type="button"
        className="cs-utility-panel__head"
        aria-expanded={isOpen}
        onClick={() => setOpen(v => !v)}
      >
        <span className="cs-utility-panel__title">{title}</span>
        <span className="cs-utility-panel__meta">
          {!isOpen && summary ? <span className="cs-utility-panel__summary">{summary}</span> : null}
          <span aria-hidden>{isOpen ? '▲' : '▼'}</span>
        </span>
      </button>
      {isOpen ? <div className="cs-utility-panel__body">{children}</div> : null}
    </div>
  )
}
