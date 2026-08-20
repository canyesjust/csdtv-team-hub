'use client'

import { useEffect, useState } from 'react'
import { deriveTheme, themeCssVars } from '@/lib/graphics/theme'
import { GRAPHICS_EVENT_TYPES, GRAPHICS_SHOW_STATES } from '@/lib/graphics/types'
import { GRAPHICS_DEPTHS, DEPTH_LABEL, DEPTH_BLURB, depthChangeNote } from '@/lib/graphics/depth'
import { BUG_ZONES, BUG_ZONE_LABEL } from '@/lib/graphics/zones'
import { templateById } from '@/lib/graphics/templates'
import type { ShowBundle } from '@/lib/graphics/show-data'

type SchoolOption = { code: string; short_name: string | null; name: string | null; primary_color: string | null; secondary_color: string | null; accent_color: string | null }
type PackageOption = { id: string; name: string; event_type: string; template_ids: string[]; uses: number }
type RosterOption = { id: string; name: string; school_code: string | null; sport: string | null; season: string | null; players: unknown[] }
type ProductionOption = { id: string; production_number: number | null; title: string; starts_at: string | null; has_show: boolean }

/** Everything you touch once per show, in one place, off the main screen. */
export default function SetupDrawer({
  bundle, schools, channels, open, onClose, onPatch, onRefresh,
}: {
  bundle: ShowBundle
  schools: SchoolOption[]
  channels: { id: string; slug: string; name: string; output_token: string }[]
  open: boolean
  onClose: () => void
  onPatch: (patch: Record<string, unknown>) => void
  onRefresh: () => void
}) {
  const { show, rows } = bundle
  const [name, setName] = useState(show.name)
  const channel = channels.find(c => c.id === (show.channel?.id ?? ''))
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const usedTemplates = [...new Set(rows.filter(r => r.graphic).map(r => r.graphic!.tid))]
  const draftCount = rows.filter(r => !r.approved).length

  const [packages, setPackages] = useState<PackageOption[]>([])
  const [rosters, setRosters] = useState<RosterOption[]>([])
  const [productions, setProductions] = useState<ProductionOption[]>([])
  const [libLoaded, setLibLoaded] = useState(false)
  const [pkgBusy, setPkgBusy] = useState(false)
  const [pkgNote, setPkgNote] = useState<string | null>(null)

  // The library only matters once the drawer is open, so it is not on the
  // critical path of loading a show.
  useEffect(() => {
    if (!open || libLoaded) return
    let alive = true
    void (async () => {
      const [pkg, ros, prod] = await Promise.all([
        fetch(`/api/gfx/packages?event_type=${show.event_type}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/gfx/rosters').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/gfx/productions').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])
      if (!alive) return
      setPackages(pkg?.packages || [])
      setRosters(ros?.rosters || [])
      setProductions(prod?.productions || [])
      setLibLoaded(true)
    })()
    return () => { alive = false }
  }, [open, libLoaded, show.event_type])

  const postPackage = async (body: Record<string, unknown>, done: string) => {
    setPkgBusy(true)
    setPkgNote(null)
    const res = await fetch(`/api/gfx/shows/${show.id}/package`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    setPkgBusy(false)
    if (!res || !res.ok) { setPkgNote('That did not go through.'); return }
    setPkgNote(done)
    setLibLoaded(false)
    onRefresh()
  }

  const applyPackage = (id: string) =>
    postPackage({ action: 'apply', package_id: id }, 'Applied. The shelf and the logo choices came over. Nothing in the running order moved.')

  const savePackage = () => {
    const name = window.prompt('Name this package', `${show.name} look`)
    if (!name) return
    void postPackage({ action: 'save', name }, `Saved as “${name}”.`)
  }

  const rosterFor = (code: string | null) =>
    rosters.filter(r => !r.school_code || !code || r.school_code === code)

  const toLocalInput = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <>
      <div className={`gfx-scrim${open ? ' on' : ''}`} onClick={onClose} />
      <aside className={`gfx-drawer${open ? ' on' : ''}`}>
        <div className="gfx-drawer-head">
          <b style={{ fontSize: 15 }}>Show setup</b>
          <span className="gfx-spacer" />
          <button className="gfx-btn sm ghost" onClick={onClose}>Done</button>
        </div>

        <section className="gfx-dsec">
          <h5>Details</h5>
          <label className="sh-label" style={{ marginTop: 0 }}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={() => onPatch({ name })} />
          <div className="sh-g2">
            <div>
              <label className="sh-label">On air</label>
              <input type="datetime-local" defaultValue={toLocalInput(show.air_at)}
                onChange={e => e.target.value && onPatch({ air_at: new Date(e.target.value).toISOString() })} />
            </div>
            <div>
              <label className="sh-label">Hard out</label>
              <input type="datetime-local" defaultValue={toLocalInput(show.hard_out_at)}
                onChange={e => e.target.value && onPatch({ hard_out_at: new Date(e.target.value).toISOString() })} />
            </div>
          </div>
          <div className="sh-g2">
            <div>
              <label className="sh-label">Event type</label>
              <select defaultValue={show.event_type} onChange={e => onPatch({ event_type: e.target.value })}>
                {GRAPHICS_EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="sh-label">State</label>
              <select defaultValue={show.state} onChange={e => onPatch({ state: e.target.value })}>
                {GRAPHICS_SHOW_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <p className="gfx-note" style={{ marginTop: 7 }}>
            Anything but <b>live</b> puts a rehearsal flag in the corner of the output, so a student can run the
            whole show on the real machine and nobody wonders whether it went out.
          </p>
        </section>

        <section className="gfx-dsec">
          <h5>How much structure?</h5>
          <div style={{ display: 'grid', gap: 6 }}>
            {GRAPHICS_DEPTHS.map(d => (
              <button key={d} className={`gfx-btn${show.depth === d ? ' on' : ''}`}
                style={{ textAlign: 'left', padding: '9px 11px' }}
                onClick={() => onPatch({ depth: d })}>
                <b style={{ display: 'block' }}>{DEPTH_LABEL[d]}</b>
                <span className="gfx-note">{DEPTH_BLURB[d]}</span>
              </button>
            ))}
          </div>
          {GRAPHICS_DEPTHS.filter(d => d !== show.depth).map(d => {
            const note = depthChangeNote(show.depth, d, rows.length)
            return note ? <p key={d} className="gfx-note" style={{ marginTop: 7 }}><b>{DEPTH_LABEL[d]}:</b> {note}</p> : null
          })}
          <p className="gfx-note" style={{ marginTop: 7 }}>
            Change this whenever. Rows and cards both survive, so a game that turns into a hosted broadcast
            halfway through the season costs one click.
          </p>
        </section>

        <section className="gfx-dsec">
          <h5>Score bug</h5>
          <p className="gfx-note" style={{ marginBottom: 7 }}>
            The score comes from your own service and keys over the top of us. We never draw it. Telling us
            where it sits is what keeps our lower thirds out from under it.
          </p>
          <select value={show.bug_zone} onChange={e => onPatch({ bug_zone: e.target.value })}>
            {BUG_ZONES.map(z => <option key={z} value={z}>{BUG_ZONE_LABEL[z]}</option>)}
          </select>
          {show.bug_zone !== 'none' && (
            <p className="gfx-note" style={{ marginTop: 7 }}>
              It shows as a dashed box in the preview and behind <code>?safe=1</code> on the output, so a
              student can see the space while they build rather than discovering it on air.
            </p>
          )}
        </section>

        <section className="gfx-dsec">
          <h5>Production</h5>
          {!libLoaded ? (
            <p className="gfx-note">Loading the schedule…</p>
          ) : (
            <>
              <select value={show.production_id ?? ''}
                onChange={e => onPatch({ production_id: e.target.value || null })}>
                <option value="">Not linked to a production</option>
                {productions.map(p => (
                  <option key={p.id} value={p.id} disabled={p.has_show && p.id !== show.production_id}>
                    {p.production_number ? `#${p.production_number} \u00b7 ` : ''}{p.title}
                    {p.starts_at ? ` \u00b7 ${new Date(p.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    {p.has_show && p.id !== show.production_id ? ' \u00b7 already has a show' : ''}
                  </option>
                ))}
              </select>
              {show.production_id && (
                <p className="gfx-note" style={{ marginTop: 7 }}>
                  Linked. Nothing on this show is overwritten by the link, so the times and the school stay
                  exactly as you set them.
                </p>
              )}
            </>
          )}
          <p className="gfx-note" style={{ marginTop: 7 }}>
            You can link a show to a production at any point, before or after you build the rundown. Starting
            from a production just saves the retyping.
          </p>
        </section>

        <section className="gfx-dsec">
          <h5>School and colours</h5>
          <div className="gfx-swatches">
            {schools.map(s => {
              const on = show.school_code === s.code
              return (
                <button key={s.code} className={`gfx-sw${on ? ' on' : ''}`} onClick={() => onPatch({ school_code: s.code })}>
                  <i style={{ background: s.primary_color || '#333' }} />
                  <i style={{ background: s.secondary_color || '#333' }} />
                  <i style={{ background: s.accent_color || '#333' }} />
                  {s.short_name || s.name || s.code}
                </button>
              )
            })}
          </div>
          {show.event_type === 'game' && (
            <>
              <label className="sh-label">Away school</label>
              <div className="gfx-swatches">
                {schools.map(s => (
                  <button key={s.code} className={`gfx-sw${show.away_code === s.code ? ' on' : ''}`}
                    onClick={() => onPatch({ away_code: s.code })}>
                    <i style={{ background: s.primary_color || '#333' }} />
                    {s.short_name || s.code}
                  </button>
                ))}
              </div>
            </>
          )}
          {show.school_code && (
            <div style={{ marginTop: 10, ...themeCssVars(deriveTheme(schools.find(s => s.code === show.school_code))) } as React.CSSProperties}>
              <label className="sh-label" style={{ marginTop: 0 }}>Derived on air</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {(['--gx-g1', '--gx-g2', '--gx-g3', '--gx-panel'] as const).map(v => (
                  <span key={v} style={{ width: 26, height: 26, borderRadius: 6, background: `var(${v})`, border: '1px solid rgba(255,255,255,.2)' }} />
                ))}
                <span className="gfx-note" style={{ marginLeft: 6 }}>bar 1, bar 2, accent, panel</span>
              </div>
              <p className="gfx-note" style={{ marginTop: 7 }}>
                Brand colours come from the <code>schools</code> table and get derived, because raw values are
                often too dark to read as an accent on a dark panel.
              </p>
            </div>
          )}
        </section>

        <section className="gfx-dsec">
          <h5>Ready check</h5>
          {usedTemplates.length === 0 ? (
            <p className="gfx-note">No graphics in the rundown yet.</p>
          ) : usedTemplates.map(tid => (
            <div key={tid} className="gfx-chk ok"><b>✓</b><span style={{ flex: 1 }}>{templateById(tid)?.name ?? tid}</span></div>
          ))}
          <div className={`gfx-chk ${draftCount ? 'no' : 'ok'}`}>
            <b>{draftCount ? '✕' : '✓'}</b>
            <span style={{ flex: 1 }}>Every row approved</span>
            <span className="gfx-note">{draftCount ? `${draftCount} draft` : 'all approved'}</span>
          </div>
          <div className={`gfx-chk ${show.channel ? 'ok' : 'no'}`}>
            <b>{show.channel ? '✓' : '✕'}</b>
            <span style={{ flex: 1 }}>Output assigned</span>
            <span className="gfx-note">{show.channel?.name ?? 'none'}</span>
          </div>
        </section>

        <section className="gfx-dsec">
          <h5>Sponsors</h5>
          {show.sponsors.length === 0 ? (
            <p className="gfx-note">
              None on this show. District sponsors are attached when a show is created; add them in the
              Library and they carry into the next one.
            </p>
          ) : show.sponsors.map(sponsor => (
            <div key={sponsor.id || sponsor.name} className="sh-lrow" style={{ cursor: 'pointer' }}
              onClick={() => onPatch({
                sponsors: show.sponsors.map(s =>
                  (s.id || s.name) === (sponsor.id || sponsor.name) ? { ...s, on: !s.on } : s),
              })}>
              <span style={{ color: sponsor.on ? '#5fd08a' : '#3a4256', fontWeight: 800 }}>
                {sponsor.on ? '\u2611' : '\u2610'}
              </span>
              <span style={{ flex: 1 }}>
                {sponsor.name}
                <div className="gfx-note">{sponsor.scope === 'district' ? 'district · carries over' : sponsor.scope}</div>
              </span>
            </div>
          ))}
          <p className="gfx-note" style={{ marginTop: 7 }}>
            The bug, the rotation slate, the intermission strip and the side panel all read this one list.
          </p>
        </section>

        <section className="gfx-dsec">
          <h5>Graphics package</h5>
          {!libLoaded ? (
            <p className="gfx-note">Loading the saved looks…</p>
          ) : packages.length === 0 ? (
            <p className="gfx-note">
              Nothing saved for a {show.event_type} yet. Build this show the way you want it and save it,
              then next Friday starts from here instead of from an empty grid.
            </p>
          ) : packages.map(pkg => {
            const on = show.package_id === pkg.id
            return (
              <div key={pkg.id} className="sh-lrow">
                <span style={{ flex: 1 }}>
                  {pkg.name}
                  <div className="gfx-note">
                    {pkg.template_ids.length} template{pkg.template_ids.length === 1 ? '' : 's'}
                    {pkg.uses > 0 ? ` · used ${pkg.uses}×` : ' · never used'}
                  </div>
                </span>
                <button className={`gfx-btn sm ${on ? 'on' : 'ghost'}`} disabled={pkgBusy}
                  onClick={() => void applyPackage(pkg.id)}>{on ? 'Re-apply' : 'Apply'}</button>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
            <button className="gfx-btn sm ghost" disabled={pkgBusy} onClick={savePackage}>Save this show as a package</button>
          </div>
          {pkgNote && <p className="gfx-note" style={{ marginTop: 7, color: '#9fe0b6' }}>{pkgNote}</p>}
          <p className="gfx-note" style={{ marginTop: 7 }}>
            A package carries the templates, the logo choice on each one and the shelf. It never touches the
            running order or anything you typed, so applying one on Friday afternoon is safe.
          </p>
        </section>

        {show.event_type === 'game' && (
          <section className="gfx-dsec">
            <h5>Rosters</h5>
            {!libLoaded ? (
              <p className="gfx-note">Loading…</p>
            ) : rosters.length === 0 ? (
              <p className="gfx-note">
                None saved. Paste a coach&rsquo;s CSV into the Rosters tab in the Library and it lands here.
              </p>
            ) : (
              <>
                {([
                  { key: 'home_roster_id' as const, label: 'Home', code: show.school_code, value: show.home_roster_id },
                  { key: 'away_roster_id' as const, label: 'Away', code: show.away_code, value: show.away_roster_id },
                ]).map(side => (
                  <div key={side.key}>
                    <label className="sh-label">{side.label}</label>
                    <select value={side.value ?? ''} onChange={e => onPatch({ [side.key]: e.target.value || null })}>
                      <option value="">None</option>
                      {rosterFor(side.code).map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}{r.season ? ` · ${r.season}` : ''} ({Array.isArray(r.players) ? r.players.length : 0})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <p className="gfx-note" style={{ marginTop: 7 }}>
                  Both sides feed the jersey pad. Type a number once and it resolves on each roster, so nobody
                  has to remember which team a 23 belongs to.
                </p>
              </>
            )}
          </section>
        )}

        <section className="gfx-dsec">
          <h5>Output</h5>
          <div className="sh-seg">
            {channels.map(c => (
              <button key={c.id} className={`gfx-btn ${show.channel?.id === c.id ? 'on' : ''}`}
                onClick={() => onPatch({ channel_id: c.id })}>{c.name}</button>
            ))}
          </div>
          {channel && (
            <>
              <label className="sh-label">Graphics browser source</label>
              <code className="gfx-url">{origin}/gfx/{channel.slug}/out?k={channel.output_token}</code>
              <label className="sh-label">Prompter</label>
              <code className="gfx-url">{origin}/gfx/{channel.slug}/prompter?k={channel.output_token}</code>
              <p className="gfx-note" style={{ marginTop: 7 }}>
                Set once per machine and never re-pasted. Assign a different show to this channel and the page
                already open in OBS follows it.
              </p>
            </>
          )}
        </section>
      </aside>
    </>
  )
}
