'use client'

import { useEffect, useState } from 'react'

// Embed mode (?embed=1) is for iframing the brand library on another site (e.g. the
// district website). It hides the standalone-site chrome and, importantly, drops the
// page's min-height and reports the real content height to the parent so the iframe can
// auto-size instead of showing an inner scrollbar.
//
// Like the review key, it is detected after mount (to avoid a hydration mismatch) and
// persisted for the tab so it survives navigation between the gallery and school pages.
export function useBrandEmbed(): boolean {
  const [embed, setEmbed] = useState(false)

  useEffect(() => {
    let on = false
    try {
      on = new URLSearchParams(window.location.search).get('embed') === '1'
      if (on) sessionStorage.setItem('brandEmbed', '1')
      else if (sessionStorage.getItem('brandEmbed') === '1') on = true
    } catch { /* sessionStorage unavailable */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmbed(on)
  }, [])

  useEffect(() => {
    if (!embed) return
    const post = () => {
      const height = Math.ceil(document.documentElement.scrollHeight)
      try { window.parent?.postMessage({ type: 'csdtv-brand-embed-height', height }, '*') } catch { /* not framed */ }
    }
    post()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => post())
      ro.observe(document.body)
    }
    window.addEventListener('resize', post)
    window.addEventListener('load', post)
    // Late reflows (images, fonts) can change height after the observers settle.
    const t = window.setTimeout(post, 600)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', post)
      window.removeEventListener('load', post)
      window.clearTimeout(t)
    }
  }, [embed])

  return embed
}

/** Build a `?review=…&embed=1` suffix for internal brand links, preserving state. */
export function brandQuery(reviewKey: string | null, embed: boolean): string {
  const q = new URLSearchParams()
  if (reviewKey) q.set('review', reviewKey)
  if (embed) q.set('embed', '1')
  const s = q.toString()
  return s ? `?${s}` : ''
}
