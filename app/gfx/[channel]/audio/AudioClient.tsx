'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import './audio.css'

type Playing = {
  slot: 'oneshot' | 'bed'
  url: string
  gain_db: number
  loop: boolean
  started_at: string
  duration_seconds: number | null
  name: string
}

const gainToVolume = (db: number) => Math.max(0, Math.min(1, Math.pow(10, db / 20)))

export default function AudioClient({
  channelSlug, channelName, token,
}: {
  channelSlug: string; channelName: string; token: string
}) {
  const [playing, setPlaying] = useState<Playing[]>([])
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const players = useRef<Record<string, { audio: HTMLAudioElement; startedAt: string }>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/gfx/${channelSlug}/audio?k=${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (!res.ok) { setError('Could not read the channel'); return }
      setError(null)
      const body = (await res.json()) as { playing: Playing[] }
      setPlaying(body.playing || [])
    } catch { setError('Offline. Retrying.') }
  }, [channelSlug, token])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const supabase = createClient()
    const ch = supabase.channel(`gfx-output:${channelSlug}`)
      .on('broadcast', { event: 'gfx' }, () => void load())
      .subscribe()
    const poll = setInterval(() => void load(), 3000)
    return () => { clearTimeout(first); clearInterval(poll); supabase.removeChannel(ch) }
  }, [channelSlug, load])

  /**
   * Diff the slots. A cue is identified by its started_at, so re-firing the
   * same clip restarts it and a poll returning the same state does not.
   */
  useEffect(() => {
    if (!unlocked) return
    const wanted = new Map(playing.map(p => [p.slot, p]))

    for (const [slot, entry] of Object.entries(players.current)) {
      const next = wanted.get(slot as 'oneshot' | 'bed')
      if (!next || next.started_at !== entry.startedAt) {
        entry.audio.pause()
        entry.audio.src = ''
        delete players.current[slot]
      }
    }

    for (const cue of playing) {
      const existing = players.current[cue.slot]
      if (existing && existing.startedAt === cue.started_at) {
        existing.audio.volume = gainToVolume(cue.gain_db)
        continue
      }
      const audio = new Audio(cue.url)
      audio.loop = cue.loop
      audio.volume = gainToVolume(cue.gain_db)
      // Resume mid-clip when the source is refreshed during playback.
      const elapsed = (Date.now() - Date.parse(cue.started_at)) / 1000
      if (elapsed > 1 && cue.duration_seconds && elapsed < cue.duration_seconds) {
        audio.currentTime = elapsed
      }
      void audio.play().catch(() => setUnlocked(false))
      players.current[cue.slot] = { audio, startedAt: cue.started_at }
    }
  }, [playing, unlocked])

  useEffect(() => {
    const current = players.current
    return () => {
      for (const entry of Object.values(current)) { entry.audio.pause(); entry.audio.src = '' }
    }
  }, [])

  return (
    <div className="au-root">
      {!unlocked ? (
        <button className="au-unlock" onClick={() => { setUnlocked(true); void load() }}>
          <b>Enable sound</b>
          <span>
            Browsers block audio until someone clicks. Do this once per machine when you set up
            the source, and OBS keeps it unlocked.
          </span>
        </button>
      ) : (
        <div className="au-status">
          <div className="au-head">
            <span className="au-dot" /> Audio ready · {channelName}
          </div>
          {error && <div className="au-err">{error}</div>}
          {playing.length === 0 ? (
            <div className="au-idle">Nothing playing.</div>
          ) : (
            playing.map(cue => (
              <div key={cue.slot} className="au-cue">
                <b>{cue.slot === 'bed' ? 'Bed' : 'One shot'}</b>
                <span>{cue.name}</span>
                <span className="au-gain">{cue.gain_db > 0 ? '+' : ''}{cue.gain_db} dB</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
