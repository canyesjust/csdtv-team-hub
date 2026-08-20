'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import JerseyPad from './JerseyPad'
import SetupDrawer from './SetupDrawer'
import { useShowState } from '@/lib/graphics/use-show-sync'
import StagePreview from '@/app/gfx/components/StagePreview'
import ImageField from '@/app/gfx/components/ImageField'
import type { MarkContext } from '@/app/gfx/components/LogoMark'
import { themeCssVars } from '@/lib/graphics/theme'
import { templateById, templatesForEvent, LOGO_CHOICES, blankData } from '@/lib/graphics/templates'
import { GRAPHICS_LAYER_LABELS, GRAPHICS_LAYERS } from '@/lib/graphics/types'
import type { ShowBundle, ShelfItem } from '@/lib/graphics/show-data'
import type { GraphicPayload, GraphicsLayer } from '@/lib/graphics/types'
import './board.css'

type SchoolOption = {
  code: string; short_name: string | null; name: string | null
  primary_color: string | null; secondary_color: string | null; accent_color: string | null
}
type ChannelOption = { id: string; slug: string; name: string; output_token: string }

const UNGROUPED = 'Cards'

/**
 * The board.
 *
 * No running order, no clock, no pages. A bank of cards you hit, which is what
 * a game actually is and what the parade panel got right. Everything expensive
 * is shared with the rundown: the renderer, the layer policy, the theme, the
 * outputs, the packages. Only the control surface differs, because the control
 * surface is the cheap part.
 */
export default function BoardClient({
  bundle: initialBundle, channels, schools: schoolOptions,
}: {
  bundle: ShowBundle
  channels: ChannelOption[]
  schools: SchoolOption[]
}) {
  const { bundle, refresh: pullState } = useShowState(initialBundle.show.id, initialBundle)
  const { show, shelf, air, theme, schools, rosters } = bundle

  const [selId, setSelId] = useState<string | null>(shelf[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, Partial<ShelfItem>>>({})
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const ctx: MarkContext = useMemo(
    () => ({
      schoolCode: show.school_code, awayCode: show.away_code, schools,
      marks: bundle.marks,
      sponsorMarks: Object.fromEntries(show.sponsors.map(sp => [sp.name, sp.logo_url ?? null])),
    }),
    [show.school_code, show.away_code, schools, bundle.marks, show.sponsors],
  )

  const merged = useMemo<ShelfItem[]>(
    () => shelf.map(s => (draft[s.id] ? { ...s, ...draft[s.id] } : s)),
    [shelf, draft],
  )
  const selected = merged.find(s => s.id === selId) ?? null

  const call = useCallback(async (path: string, init: RequestInit) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === 'string' ? body.error : 'That did not work')
        return false
      }
      return true
    } catch {
      setError('Could not reach the server')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const refresh = useCallback(() => { void pullState(true) }, [pullState])

  /** What is up, by layer, so a card knows whether it is on. */
  const onAir = useMemo(() => {
    const map = new Map<GraphicsLayer, string>()
    for (const entry of air) map.set(entry.layer, entry.graphic.tid + JSON.stringify(entry.graphic.data))
    return map
  }, [air])

  const isUp = useCallback((item: ShelfItem) => {
    if (!item.graphic) return false
    const template = templateById(item.graphic.tid)
    if (!template) return false
    return onAir.get(template.layer) === item.graphic.tid + JSON.stringify(item.graphic.data)
  }, [onAir])

  /** One key, one card. Hitting it again takes it out. */
  const hit = useCallback(async (item: ShelfItem) => {
    if (!item.graphic) return
    const template = templateById(item.graphic.tid)
    if (!template) return
    if (isUp(item)) {
      await call(`/api/gfx/shows/${show.id}/air`, {
        method: 'POST', body: JSON.stringify({ action: 'clear', layer: template.layer }),
      })
    } else {
      await call(`/api/gfx/shows/${show.id}/air`, {
        method: 'POST', body: JSON.stringify({ action: 'put', graphic: item.graphic }),
      })
    }
    refresh()
  }, [call, show.id, isUp, refresh])

  const clearAll = useCallback(async () => {
    await call(`/api/gfx/shows/${show.id}/air`, { method: 'POST', body: JSON.stringify({ action: 'clear_all' }) })
    refresh()
  }, [call, show.id, refresh])

  const clearLayer = useCallback(async (layer: GraphicsLayer) => {
    await call(`/api/gfx/shows/${show.id}/air`, { method: 'POST', body: JSON.stringify({ action: 'clear', layer }) })
    refresh()
  }, [call, show.id, refresh])

  const addCard = useCallback(async (tid: string, group: string | null) => {
    const template = templateById(tid)
    if (!template) return
    const ok = await call(`/api/gfx/shows/${show.id}/shelf`, {
      method: 'POST',
      body: JSON.stringify({
        label: template.name, group_label: group,
        graphic: { tid, data: blankData(template) },
      }),
    })
    if (ok) { refresh(); setEditOpen(true) }
  }, [call, show.id, refresh])

  const patchCard = useCallback((itemId: string, patch: Partial<ShelfItem>) => {
    setDraft(d => ({ ...d, [itemId]: { ...d[itemId], ...patch } }))
    clearTimeout(saveTimers.current[itemId])
    saveTimers.current[itemId] = setTimeout(() => {
      void fetch(`/api/gfx/shows/${show.id}/shelf/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => null)
    }, 600)
  }, [show.id])

  const deleteCard = useCallback(async (itemId: string) => {
    const ok = await call(`/api/gfx/shows/${show.id}/shelf/${itemId}`, { method: 'DELETE' })
    if (ok) { if (selId === itemId) setSelId(null); refresh() }
  }, [call, show.id, selId, refresh])

  const patchShow = useCallback(async (patch: Record<string, unknown>) => {
    const ok = await call(`/api/gfx/shows/${show.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (ok) refresh()
  }, [call, show.id, refresh])

  const fireGraphic = useCallback(async (graphic: GraphicPayload) => {
    await call(`/api/gfx/shows/${show.id}/air`, { method: 'POST', body: JSON.stringify({ action: 'put', graphic }) })
    refresh()
  }, [call, show.id, refresh])

  /** Cards in the groups someone put them in, in the order they added them. */
  const groups = useMemo(() => {
    const out = new Map<string, ShelfItem[]>()
    for (const item of merged) {
      const key = (item.group_label || '').trim() || UNGROUPED
      const list = out.get(key)
      if (list) list.push(item)
      else out.set(key, [item])
    }
    return [...out.entries()]
  }, [merged])

  const live = show.state === 'live'
  const selectedTemplate = selected?.graphic ? templateById(selected.graphic.tid) : null

  const setCardField = (field: string, value: string) => {
    if (!selected?.graphic) return
    patchCard(selected.id, {
      graphic: { ...selected.graphic, data: { ...selected.graphic.data, [field]: value } },
    })
  }

  return (
    <div className="sh" style={themeCssVars(theme) as React.CSSProperties}>
      <div className="gfx-bar">
        <div className="brand">CSDtv<small>Board</small></div>
        <a href="/gfx" className="gfx-btn sm ghost" style={{ textDecoration: 'none' }}>← Shows</a>
        <b style={{ fontSize: 13.5 }}>{show.name}</b>
        <span className="gfx-spacer" />
        {error && <span style={{ color: '#ff9ba4', fontSize: 11.5 }}>{error}</span>}
        <span className={`gfx-chip ${live ? 'onair' : 'idle'}`}>{live ? 'On air' : show.state}</span>
        <button className="gfx-btn sm ghost" onClick={() => setEditOpen(v => !v)}>
          {editOpen ? 'Done editing' : 'Edit cards'}
        </button>
        <button className="gfx-btn sm ghost" onClick={() => setDrawerOpen(true)}>⚙ Setup</button>
      </div>

      <div className={`sh-work${busy ? ' on' : ''}`} />

      <SetupDrawer
        bundle={bundle} schools={schoolOptions} channels={channels}
        open={drawerOpen} onClose={() => setDrawerOpen(false)}
        onPatch={patchShow} onRefresh={refresh}
      />

      <div className="bd-body">
        <div className="bd-main">
          {groups.length === 0 ? (
            <div className="gfx-empty">
              Nothing on the board yet.
              <div className="gfx-note" style={{ marginTop: 8 }}>
                Hit <b>Edit cards</b> and add the graphics you want on the night. No order, no clock.
              </div>
            </div>
          ) : groups.map(([group, items]) => (
            <section key={group} className="bd-group">
              <h3>{group}<span className="gfx-note">{items.length}</span></h3>
              <div className="bd-grid">
                {items.map(item => {
                  const template = item.graphic ? templateById(item.graphic.tid) : null
                  const up = isUp(item)
                  return (
                    <button key={item.id}
                      className={`bd-card${up ? ' up' : ''}${item.id === selId ? ' sel' : ''}`}
                      onClick={() => { setSelId(item.id); void hit(item) }}>
                      <span className="bd-thumb">
                        {item.graphic && <StagePreview single={item.graphic} ctx={ctx} />}
                      </span>
                      <span className="bd-meta">
                        <span className="bd-name">{item.label}</span>
                        <span className="bd-sub">{template ? GRAPHICS_LAYER_LABELS[template.layer] : 'no graphic'}</span>
                      </span>
                      {up && <span className="bd-onair">ON</span>}
                    </button>
                  )
                })}
                {editOpen && (
                  <div className="bd-add">
                    <select defaultValue="" onChange={e => {
                      if (e.target.value) void addCard(e.target.value, group === UNGROUPED ? null : group)
                      e.target.value = ''
                    }}>
                      <option value="">＋ Add a card…</option>
                      {templatesForEvent(show.event_type).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </section>
          ))}

          {editOpen && groups.length > 0 && (
            <div className="bd-newgroup">
              <select defaultValue="" onChange={e => {
                const group = window.prompt('Group name', 'New group')
                if (group && e.target.value) void addCard(e.target.value, group)
                e.target.value = ''
              }}>
                <option value="">＋ New group…</option>
                {templatesForEvent(show.event_type).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="sh-side">
          <div className="sh-pvwrap">
            <div className="sh-mon pgm"><span className="lab">PROGRAM</span>
              <StagePreview air={air} ctx={ctx} animate />
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
              <button className="gfx-btn sm live" onClick={() => void clearAll()}>Clear all</button>
              {GRAPHICS_LAYERS.filter(l => air.some(a => a.layer === l)).map(l => (
                <button key={l} className="gfx-btn sm ghost" onClick={() => void clearLayer(l)}>
                  Out {GRAPHICS_LAYER_LABELS[l].toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {show.event_type === 'game' && (
            <section className="sh-sect">
              <h4>Jersey lookup<span className="r">one pad, both teams</span></h4>
              <div className="sh-in">
                <JerseyPad
                  home={rosters.home}
                  away={rosters.away}
                  homeSchool={schoolOptions.find(s => s.code === show.school_code)}
                  awaySchool={schoolOptions.find(s => s.code === show.away_code)}
                  disabled={false}
                  onTake={graphic => void fireGraphic(graphic)}
                />
              </div>
            </section>
          )}

          {editOpen && selected && (
            <section className="sh-sect">
              <h4>{selected.label}<span className="r">{selectedTemplate?.name ?? 'no graphic'}</span></h4>
              <div className="sh-in">
                <label className="sh-label" style={{ marginTop: 0 }}>Card name</label>
                <input value={selected.label} onChange={e => patchCard(selected.id, { label: e.target.value })} />
                <label className="sh-label">Group</label>
                <input value={selected.group_label ?? ''} placeholder="Sponsors, Score, Breaks…"
                  onChange={e => patchCard(selected.id, { group_label: e.target.value })} />

                {selectedTemplate && selected.graphic && selectedTemplate.fields.map(field => (
                  <div key={field.id}>
                    <label className="sh-label">{field.label}</label>
                    {field.type === 'logo' ? (
                      <div className="sh-seg">
                        {LOGO_CHOICES.map(choice => (
                          <button key={choice.value}
                            className={`gfx-btn ${selected.graphic!.data[field.id] === choice.value ? 'on' : ''}`}
                            onClick={() => setCardField(field.id, choice.value)}>{choice.label}</button>
                        ))}
                      </div>
                    ) : field.type === 'choice' ? (
                      <div className="sh-seg">
                        {(field.options || []).map(choice => {
                          const value = selected.graphic!.data[field.id] || field.placeholder || ''
                          return (
                            <button key={choice.value}
                              className={`gfx-btn ${value === choice.value ? 'on' : ''}`}
                              onClick={() => setCardField(field.id, choice.value)}>{choice.label}</button>
                          )
                        })}
                      </div>
                    ) : field.type === 'image' ? (
                    <ImageField value={selected.graphic!.data[field.id] || ''} onChange={v => setCardField(field.id, v)} />
                  ) : field.type === 'textarea' ? (
                      <textarea style={{ minHeight: 48 }} value={selected.graphic!.data[field.id] || ''}
                        onChange={e => setCardField(field.id, e.target.value)} />
                    ) : (
                      <input value={selected.graphic!.data[field.id] || ''}
                        onChange={e => setCardField(field.id, e.target.value)} />
                    )}
                  </div>
                ))}

                <button className="gfx-btn sm ghost" style={{ marginTop: 12, color: '#ff9ba4', borderColor: 'var(--gx-live)' }}
                  onClick={() => void deleteCard(selected.id)}>Delete this card</button>
              </div>
            </section>
          )}

          {!editOpen && (
            <section className="sh-sect">
              <div className="sh-in">
                <p className="gfx-note">
                  Hit a card to put it up. Hit it again to take it out. Nothing here is on a clock and nothing
                  has to happen in order.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
