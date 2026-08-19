'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GRAPHICS_EVENT_TYPES } from '@/lib/graphics/types'

type ProductionOption = {
  id: string
  production_number: number | null
  title: string
  event_date: string | null
  start_datetime: string | null
  end_datetime: string | null
  venue: string | null
  school_code: string | null
  event_type: string
  has_show: boolean
}

const EVENT_LABEL: Record<string, string> = {
  concert: 'Concert', game: 'Game', parade: 'Parade', ceremony: 'Ceremony', other: 'Other',
}
const EVENT_BLURB: Record<string, string> = {
  concert: 'Ordered spine. Piece cards, program notes, intermission.',
  game: 'Trigger bank. Jersey lookup, stat callouts, score cards.',
  parade: 'One long list. Entry lower thirds and a coming-up card.',
  ceremony: 'Names in order, mostly. Section headers and name cards.',
  other: 'No assumptions. Show open, a bug, and a stand-by card.',
}

/** New shows arrive seeded with blocks, rows and a shelf. Nobody starts empty. */
export default function NewShowButton({
  channels, schools,
}: {
  channels: { id: string; name: string }[]
  schools: { code: string; short_name: string | null; name: string | null }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [eventType, setEventType] = useState<string>('concert')
  const [schoolCode, setSchoolCode] = useState('')
  const [channelId, setChannelId] = useState('')
  const [airAt, setAirAt] = useState('')
  const [hardOutAt, setHardOutAt] = useState('')
  const [venue, setVenue] = useState('')
  const [productions, setProductions] = useState<ProductionOption[]>([])
  const [productionId, setProductionId] = useState<string | null>(null)

  const toLocal = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // The production record already knows most of this. Pulling from it beats
  // retyping the school, the date and the venue for the third time.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetch('/api/gfx/productions')
      .then(r => (r.ok ? r.json() : { productions: [] }))
      .then(body => { if (!cancelled) setProductions(body.productions || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

  const pickProduction = useCallback((p: ProductionOption | null) => {
    if (!p) { setProductionId(null); return }
    setProductionId(p.id)
    setName(p.title)
    setEventType(p.event_type)
    if (p.school_code) setSchoolCode(p.school_code)
    if (p.venue) setVenue(p.venue)
    if (p.start_datetime) setAirAt(toLocal(p.start_datetime))
    if (p.end_datetime) setHardOutAt(toLocal(p.end_datetime))
  }, [])

  const create = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/gfx/shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || `New ${EVENT_LABEL[eventType].toLowerCase()}`,
          event_type: eventType,
          school_code: schoolCode || null,
          channel_id: channelId || null,
          air_at: airAt ? new Date(airAt).toISOString() : null,
          hard_out_at: hardOutAt ? new Date(hardOutAt).toISOString() : null,
          show_date: airAt ? airAt.slice(0, 10) : null,
          venue: venue || null,
          production_id: productionId,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.id) router.push(`/gfx/show/${body.id}`)
      else setBusy(false)
    } catch { setBusy(false) }
  }

  if (!open) {
    return <button className="gfx-btn take sm" onClick={() => setOpen(true)}>＋ New show</button>
  }

  return (
    <>
      <div className="gfx-scrim on" onClick={() => setOpen(false)} />
      <aside className="gfx-drawer on">
        <div className="gfx-drawer-head">
          <b style={{ fontSize: 15 }}>New show</b>
          <span className="gfx-spacer" />
          <button className="gfx-btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
        </div>

        {productions.length > 0 && (
          <section className="gfx-dsec">
            <h5>Start from a production</h5>
            <select value={productionId ?? ''} onChange={e => {
              pickProduction(productions.find(p => p.id === e.target.value) ?? null)
            }}>
              <option value="">Not from a production…</option>
              {productions.map(p => (
                <option key={p.id} value={p.id} disabled={p.has_show}>
                  {p.production_number ? `#${p.production_number} · ` : ''}{p.title}
                  {p.event_date ? ` · ${new Date(`${p.event_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  {p.has_show ? ' · already has a show' : ''}
                </option>
              ))}
            </select>
            <p className="gfx-note" style={{ marginTop: 7 }}>
              The production record already knows the title, the school, the date and the venue. Picking one
              fills all of it in and links the two, so the as-run log lands back on the production afterwards.
            </p>
          </section>
        )}

        <section className="gfx-dsec">
          <h5>What are we covering?</h5>
          <div style={{ display: 'grid', gap: 6 }}>
            {GRAPHICS_EVENT_TYPES.map(t => (
              <button key={t} className={`gfx-btn${eventType === t ? ' on' : ''}`}
                style={{ textAlign: 'left', padding: '10px 12px' }} onClick={() => setEventType(t)}>
                <b style={{ display: 'block' }}>{EVENT_LABEL[t]}</b>
                <span className="gfx-note">{EVENT_BLURB[t]}</span>
              </button>
            ))}
          </div>
          <p className="gfx-note" style={{ marginTop: 8 }}>
            The event type decides the starter rundown, which templates are offered, and what the shelf
            starts with. All of it is editable afterwards.
          </p>
        </section>

        <section className="gfx-dsec">
          <h5>Details</h5>
          <label className="sh-label" style={{ marginTop: 0 }}>Name</label>
          <input value={name} placeholder={`New ${EVENT_LABEL[eventType].toLowerCase()}`}
            onChange={e => setName(e.target.value)} />
          <label className="sh-label">School</label>
          <select value={schoolCode} onChange={e => setSchoolCode(e.target.value)}>
            <option value="">Choose a school…</option>
            {schools.map(s => <option key={s.code} value={s.code}>{s.short_name || s.name || s.code}</option>)}
          </select>
          <label className="sh-label">Output channel</label>
          <select value={channelId} onChange={e => setChannelId(e.target.value)}>
            <option value="">Assign later…</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="sh-label">Venue</label>
          <input value={venue} placeholder="Where is it" onChange={e => setVenue(e.target.value)} />
          <div className="sh-g2">
            <div>
              <label className="sh-label">On air</label>
              <input type="datetime-local" value={airAt} onChange={e => setAirAt(e.target.value)} />
            </div>
            <div>
              <label className="sh-label">Hard out</label>
              <input type="datetime-local" value={hardOutAt} onChange={e => setHardOutAt(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="gfx-dsec">
          <button className="gfx-btn take" style={{ width: '100%', minHeight: 44 }} disabled={busy} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create the show'}
          </button>
        </section>
      </aside>
    </>
  )
}
