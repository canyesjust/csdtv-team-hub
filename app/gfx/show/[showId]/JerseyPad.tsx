'use client'

import { useMemo, useState } from 'react'
import { findByJersey, type Player } from '@/lib/graphics/rosters'
import { deriveTheme } from '@/lib/graphics/theme'
import type { GraphicPayload } from '@/lib/graphics/types'

type SchoolBrand = {
  code: string; short_name: string | null; name: string | null
  primary_color: string | null; secondary_color: string | null; accent_color: string | null
}

/**
 * One keypad, both teams.
 *
 * A team toggle is one more thing to be wrong about at the moment you have the
 * least attention, and both teams have a 23. So type the number once and see
 * who it is on each roster, then tap the side you meant.
 */
export default function JerseyPad({
  home, away, homeSchool, awaySchool, onTake, disabled,
}: {
  home: Player[]
  away: Player[]
  homeSchool: SchoolBrand | undefined
  awaySchool: SchoolBrand | undefined
  onTake: (graphic: GraphicPayload) => void
  disabled?: boolean
}) {
  const [jersey, setJersey] = useState('')

  const homeHit = useMemo(() => (jersey ? findByJersey(home, jersey) : null), [home, jersey])
  const awayHit = useMemo(() => (jersey ? findByJersey(away, jersey) : null), [away, jersey])

  const press = (key: string) => {
    if (key === 'del') setJersey(j => j.slice(0, -1))
    else if (key === 'clr') setJersey('')
    else setJersey(j => (j + key).slice(0, 2))
  }

  const take = (player: Player | null, side: 'home' | 'away') => {
    if (!player) return
    const school = side === 'home' ? homeSchool : awaySchool
    onTake({
      tid: 'player_lt',
      data: {
        jersey: player.jersey,
        name: player.name,
        cls: player.cls,
        position: player.pos,
        pos: 'left-low',
        team: school?.short_name || school?.name || '',
        stat: '',
        logo: side === 'home' ? 'school' : 'away',
      },
    })
    setJersey('')
  }

  const card = (player: Player | null, school: SchoolBrand | undefined, side: 'home' | 'away') => {
    const accent = deriveTheme(school).g1
    return (
      <div className="jp-card" style={{ ['--jp' as string]: accent }}>
        <div className="jp-team">{school?.short_name || school?.name || (side === 'home' ? 'Home' : 'Away')}</div>
        <div className="jp-name">{player?.name || '—'}</div>
        <div className="jp-meta">{player ? [player.cls, player.pos].filter(Boolean).join(' · ') : ''}</div>
        <button className={`gfx-btn ${player ? 'take' : ''}`} disabled={!player || disabled}
          onClick={() => take(player, side)}>TAKE</button>
      </div>
    )
  }

  return (
    <div>
      <div className="jp-display">{jersey || '—'}</div>
      <div className="jp-two">{card(homeHit, homeSchool, 'home')}{card(awayHit, awaySchool, 'away')}</div>
      <div className="jp-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <button key={n} className="gfx-btn" onClick={() => press(String(n))}>{n}</button>
        ))}
        <button className="gfx-btn ghost" onClick={() => press('del')}>⌫</button>
        <button className="gfx-btn" onClick={() => press('0')}>0</button>
        <button className="gfx-btn ghost" onClick={() => press('clr')}>CLR</button>
      </div>
      {home.length === 0 && away.length === 0 && (
        <p className="gfx-note" style={{ marginTop: 8 }}>
          No rosters loaded on this show. Load them in setup and the pad fills itself in.
        </p>
      )}
    </div>
  )
}
