'use client'

import { useEffect, useState } from 'react'
import type { PublicActiveQr } from '@/lib/board-meetings/public-output-state'

/** Local countdown so overlay QR hides exactly when its timer expires (without waiting for poll). */
export function useActivePublicQr(qr: PublicActiveQr | null | undefined): PublicActiveQr | null {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!qr?.url || (qr.remaining_seconds ?? 0) <= 0) {
      setRemaining(0)
      return
    }

    const endAt = Date.now() + qr.remaining_seconds * 1000
    const tick = () => setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [qr?.url, qr?.label, qr?.remaining_seconds])

  if (!qr?.url || remaining <= 0) return null
  return { ...qr, remaining_seconds: remaining }
}
