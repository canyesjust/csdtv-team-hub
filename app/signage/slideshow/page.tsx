'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type FeedImage = {
  id: string
  caption: string | null
  public_url: string
}

const REFRESH_MS = 5 * 60 * 1000
const FADE_MS = 600

export default function SignageSlideshowPage() {
  const searchParams = useSearchParams()
  const seconds = useMemo(() => {
    const raw = parseInt(searchParams.get('seconds') ?? '10', 10)
    if (Number.isNaN(raw)) return 10
    return Math.min(120, Math.max(3, raw))
  }, [searchParams])

  const [images, setImages] = useState<FeedImage[]>([])
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/signage-submissions/feed', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { images?: FeedImage[] }
      const next = data.images ?? []
      setImages(next)
      setIndex(prev => (next.length === 0 ? 0 : Math.min(prev, next.length - 1)))
    } catch {
      /* keep current slides on failure */
    }
  }, [])

  useEffect(() => {
    void loadFeed()
    const interval = setInterval(() => void loadFeed(), REFRESH_MS)
    return () => clearInterval(interval)
  }, [loadFeed])

  useEffect(() => {
    if (images.length <= 1) return
    const timer = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % images.length)
        setVisible(true)
      }, FADE_MS)
    }, seconds * 1000)
    return () => clearInterval(timer)
  }, [images.length, seconds])

  const current = images[index]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        overflow: 'hidden',
        cursor: 'none',
        margin: 0,
      }}
    >
      {current ? (
        <img
          key={current.id}
          src={current.public_url}
          alt={current.caption || 'Signage slide'}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: visible ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '28px',
            color: 'rgba(255,255,255,0.25)',
            fontSize: '14px',
            fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.08em',
            userSelect: 'none',
          }}
        >
          CSDtv
        </div>
      )}
    </div>
  )
}
