'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Output surfaces are rendered by OBS and must stay transparent and chrome-free. */
const BARE_SUFFIXES = ['/out', '/prompter', '/audio']

function isBareSurface(pathname: string | null): boolean {
  if (!pathname) return false
  return BARE_SUFFIXES.some(suffix => pathname.endsWith(suffix))
}

/**
 * The hub's root layout pins `light` on <html> and paints a light background.
 * The graphics app is a separate surface, so it takes the document over while
 * mounted and hands it back on unmount.
 *
 * Two shapes come out of here:
 *   - the app shell, dark and full bleed, for anything a person drives
 *   - a bare transparent passthrough for the OBS browser sources
 */
export default function GfxRootMount({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const bare = isBareSurface(pathname)

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const hadLight = html.classList.contains('light')
    html.classList.remove('light')
    html.classList.add('dark')

    const background = bare ? 'transparent' : '#070b13'
    for (const el of [html, body]) {
      el.style.setProperty('background', background, 'important')
      el.style.setProperty('background-color', background, 'important')
      el.style.setProperty('background-image', 'none', 'important')
    }
    body.style.setProperty('margin', '0', 'important')
    body.style.setProperty('padding', '0', 'important')
    body.style.setProperty('overflow', 'hidden', 'important')

    return () => {
      html.classList.remove('dark')
      if (hadLight) html.classList.add('light')
      for (const el of [html, body]) {
        el.style.removeProperty('background')
        el.style.removeProperty('background-color')
        el.style.removeProperty('background-image')
      }
      body.style.removeProperty('margin')
      body.style.removeProperty('padding')
      body.style.removeProperty('overflow')
    }
  }, [bare])

  if (bare) return <div className="gfx-bare">{children}</div>
  return <div className="gfx-root">{children}</div>
}
