'use client'

import { useEffect } from 'react'

const CLASS = 'board-overlay-transparent'

/** Forces html/body transparent for OBS browser sources (overrides theme body background). */
export default function OverlayTransparentShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add(CLASS)
    document.body.classList.add(CLASS)
    return () => {
      document.documentElement.classList.remove(CLASS)
      document.body.classList.remove(CLASS)
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {children}
    </div>
  )
}
