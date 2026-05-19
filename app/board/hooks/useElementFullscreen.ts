'use client'

import { useCallback, useEffect, useState } from 'react'

export function useElementFullscreen() {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported(typeof document !== 'undefined' && document.fullscreenEnabled)
  }, [])

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!element && document.fullscreenElement === element)
    }
    document.addEventListener('fullscreenchange', onChange)
    onChange()
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [element])

  const enter = useCallback(async () => {
    if (!element || !document.fullscreenEnabled) return false
    try {
      await element.requestFullscreen()
      return true
    } catch {
      return false
    }
  }, [element])

  const exit = useCallback(async () => {
    if (!document.fullscreenElement) return
    try {
      await document.exitFullscreen()
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(async () => {
    if (isFullscreen) {
      await exit()
      return true
    }
    return enter()
  }, [enter, exit, isFullscreen])

  return {
    setContainer: setElement,
    isFullscreen,
    supported,
    enter,
    exit,
    toggle,
  }
}
