'use client'

import { useEffect, useRef, useState } from 'react'
import GraphicRenderer from './GraphicRenderer'
import type { MarkContext } from './LogoMark'
import { sortAirForRender } from '@/lib/graphics/layers'
import type { AirEntry, GraphicPayload } from '@/lib/graphics/types'
import './graphics.css'

/**
 * A scaled 1920x1080 stage for the preview and program monitors.
 *
 * `animate` is false for preview and for any re-mount. A re-mount is not a
 * take, so restoring the resting state is correct; replaying the entrance every
 * time the panel re-renders reads as a glitch.
 */
export default function StagePreview({
  air, single, ctx, animate = false, className = '', replay = false,
}: {
  air?: AirEntry[]
  single?: GraphicPayload | null
  ctx: MarkContext
  animate?: boolean
  className?: string
  /** Show a play button. Motion you cannot watch is motion nobody can fix. */
  replay?: boolean
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.2)
  /** Bumping this remounts the graphics, which is what replays the entrance. */
  const [take, setTake] = useState(0)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const fit = () => {
      const { width, height } = box.getBoundingClientRect()
      if (width > 0 && height > 0) setScale(Math.min(width / 1920, height / 1080))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  const entries = single
    ? [{ layer: 'full', graphic: single, source: 'shelf', out_seconds: 0, taken_at: '' } as AirEntry]
    : sortAirForRender(air || [])

  return (
    <div ref={boxRef} className={`sh-screen ${className}`}>
      <div
        className={`gx-stage${animate || take > 0 ? '' : ' gx-nomotion'}`}
        style={{ transform: `scale(${scale})` }}
      >
        {entries.map(entry => (
          <GraphicRenderer
            key={`${entry.layer}:${entry.graphic.tid}:${entry.taken_at}:${take}`}
            graphic={entry.graphic}
            ctx={ctx}
          />
        ))}
      </div>
      {replay && entries.length > 0 && (
        <button className="sh-replay" title="Play the animation"
          onClick={e => { e.stopPropagation(); setTake(t => t + 1) }}>▶</button>
      )}
    </div>
  )
}
