'use client'

import { useEffect } from 'react'

/** Forces html/body transparent for OBS — beats themed body !important rules. */
export default function OverlayTransparentMount({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const { documentElement: html, body } = document
    for (const el of [html, body]) {
      el.style.setProperty('background', 'transparent', 'important')
      el.style.setProperty('background-color', 'transparent', 'important')
      el.style.setProperty('background-image', 'none', 'important')
    }
    body.style.setProperty('margin', '0', 'important')
    body.style.setProperty('padding', '0', 'important')
    body.style.setProperty('overflow', 'hidden', 'important')

    return () => {
      for (const el of [html, body]) {
        el.style.removeProperty('background')
        el.style.removeProperty('background-color')
        el.style.removeProperty('background-image')
      }
      body.style.removeProperty('margin')
      body.style.removeProperty('padding')
      body.style.removeProperty('overflow')
    }
  }, [])

  return <>{children}</>
}
