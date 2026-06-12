'use client'

import { useEffect, useState } from 'react'
import MotionScreenClient from '@/app/control/[productionId]/motion/MotionScreenClient'
import type { MotionScreenBundle } from '@/lib/board-meetings/motion-types'

/**
 * Loads the motion bundle and renders the full motion/vote workflow inline inside
 * the console (no separate page). Re-keys on the current agenda item so it reloads
 * cleanly when a new item is taken on air.
 */
export default function MotionInline({ productionId }: { productionId: string }) {
  const [bundle, setBundle] = useState<MotionScreenBundle | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/board-meetings/${productionId}/motion/bundle`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d: MotionScreenBundle) => { if (!cancelled) setBundle(d) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [productionId])

  if (failed) return <div style={{ fontSize: 13, color: '#9fb2d0' }}>Could not load motion controls. Refresh to retry.</div>
  if (!bundle) return <div style={{ fontSize: 13, color: '#9fb2d0' }}>Loading motion controls…</div>
  return <MotionScreenClient productionId={productionId} initialBundle={bundle} inline />
}
