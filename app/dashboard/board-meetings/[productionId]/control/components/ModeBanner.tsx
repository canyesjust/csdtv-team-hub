'use client'

import { useEffect, useState } from 'react'

type Props = {
  mode: string
  timer?: string | null
}

export default function ModeBanner({ mode, timer }: Props) {
  const [remaining, setRemaining] = useState<string | null>(null)

  useEffect(() => {
    if (!timer) {
      setRemaining(null)
      return
    }
    const tick = () => {
      const ms = new Date(timer).getTime() - Date.now()
      if (ms <= 0) {
        setRemaining('0:00')
        return
      }
      const sec = Math.floor(ms / 1000)
      const m = Math.floor(sec / 60)
      const s = sec % 60
      setRemaining(`${m}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [timer])

  const label = mode.replace(/_/g, ' ')

  return (
    <div className="cs-mode-banner" role="status">
      <span>{label}</span>
      {remaining ? <span>{remaining}</span> : null}
    </div>
  )
}
