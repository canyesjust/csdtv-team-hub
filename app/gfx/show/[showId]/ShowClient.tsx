'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SetupDrawer from './SetupDrawer'
import JerseyPad from './JerseyPad'
import { useShowState } from '@/lib/graphics/use-show-sync'
import { autoPages } from '@/lib/graphics/pages'
import StagePreview from '@/app/gfx/components/StagePreview'
import type { MarkContext } from '@/app/gfx/components/LogoMark'
import { themeCssVars } from '@/lib/graphics/theme'
import { computeTiming, formatClock, formatDuration, parseDuration, readSeconds } from '@/lib/graphics/timing'
import { templateById, templatesForEvent, LOGO_CHOICES, blankData } from '@/lib/graphics/templates'
import { GRAPHICS_LAYER_LABELS } from '@/lib/graphics/types'
import type { ShowBundle, ShowRow } from '@/lib/graphics/show-data'
import type { GraphicPayload, GraphicsLayer } from '@/lib/graphics/types'

type Mode = 'build' | 'run' | 'review'
type Role = 'director' | 'graphics' | 'audio' | 'camera' | 'talent'

const ROLE_COLUMNS: Record<Role, string[]> = {
  director: ['pg', 'slug', 'form', 'video', 'camera', 'gfx', 'est', 'front', 'back', 'ok'],
  graphics: ['pg', 'slug', 'gfx', 'gdetail', 'est', 'front'],
  audio: ['pg', 'slug', 'form', 'audio', 'talent', 'est', 'front'],
  camera: ['pg', 'slug', 'form', 'camera', 'talent', 'est'],
  talent: ['pg', 'slug', 'script'],
}
const COLUMN_LABEL: Record<string, string> = {
  pg: 'Pg', slug: 'Slug', form: 'Form', video: 'Video', camera: 'Cam', gfx: 'Graphic',
  gdetail: 'Detail', audio: 'Audio', talent: 'Talent', est: 'Est', front: 'Front', back: 'Back',
  ok: '✓', script: 'Script',
}

type SchoolOption = {
  code: string; short_name: string | null; name: string | null
  primary_color: string | null; secondary_color: string | null; accent_color: string | null
}
type ChannelOption = { id: string; slug: string; name: string; output_token: string }

export default function ShowClient({
  bundle: initialBundle, channels, schools: schoolOptions,
}: {
  bundle: ShowBundle
  channels: ChannelOption[]
  schools: SchoolOption[]
}) {
  // State lives here, not in a server re-render. See use-show-sync for why.
  const { bundle, refresh: pullState, setPaused } = useShowState(initialBundle.show.id, initialBundle)
  const [mode, setMode] = useState<Mode>('build')
  const [role, setRole] = useState<Role>('director')
  const [selId, setSelId] = useState<string | null>(bundle.rows[0]?.id ?? null)
  const [nextId, setNextId] = useState<string | null>(bundle.rows[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, Partial<ShowRow>>>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const [chapters, setChapters] = useState<string>('')
  const [sponsorReport, setSponsorReport] = useState<{ name: string; takes: number; seconds: number }[]>([])
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const blockTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [blockDraft, setBlockDraft] = useState<Record<string, string>>({})

  const { show, blocks, rows, shelf, air, theme, schools, rosters, audioAssets } = bundle

  const ctx: MarkContext = useMemo(
    () => ({ schoolCode: show.school_code, awayCode: show.away_code, schools }),
    [show.school_code, show.away_code, schools],
  )

  /** Local edits win until the server round-trips, so typing never stutters. */
  const merged = useMemo<ShowRow[]>(
    () => rows.map(r => (draft[r.id] ? { ...r, ...draft[r.id] } : r)),
    [rows, draft],
  )
  const selected = merged.find(r => r.id === selId) ?? null
  const airRow = merged.find(r => r.started_at && !r.ended_at) ?? null

  const timing = useMemo(
    () =>
      computeTiming({
        rows: merged,
        airAt: show.air_at ? Date.parse(show.air_at) : Date.now(),
        hardOutAt: show.hard_out_at ? Date.parse(show.hard_out_at) : Date.now() + 3 * 3600_000,
        startedAt: show.started_at ? Date.parse(show.started_at) : null,
        airRowId: airRow?.id ?? null,
      }),
    [merged, show.air_at, show.hard_out_at, show.started_at, airRow],
  )

  const call = useCallback(
    async (path: string, init: RequestInit) => {
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
    },
    [],
  )

  /**
   * Pull fresh state and drop any local draft the server has now caught up on.
   * Drafts that are still ahead survive, so a refetch never yanks a field out
   * from under someone mid-word.
   */
  const refresh = useCallback(() => { void pullState(true) }, [pullState])

  /** Structural change: renumber the pages, then pull. */
  const refreshAndRenumber = useCallback(async () => {
    await call(`/api/gfx/shows/${show.id}/renumber`, { method: 'POST' })
    await pullState(true)
  }, [call, show.id, pullState])

  const take = useCallback(async () => {
    if (!nextId) return
    const ok = await call(`/api/gfx/shows/${show.id}/take`, { method: 'POST', body: JSON.stringify({ row_id: nextId }) })
    if (!ok) return
    const i = merged.findIndex(r => r.id === nextId)
    let j = i + 1
    while (j < merged.length && merged[j].floated) j++
    setNextId(j < merged.length ? merged[j].id : null)
    setSelId(nextId)
    refresh()
  }, [nextId, call, show.id, merged, refresh])

  const fireShelf = useCallback(async (graphic: GraphicPayload) => {
    await call(`/api/gfx/shows/${show.id}/air`, { method: 'POST', body: JSON.stringify({ action: 'put', graphic }) })
    refresh()
  }, [call, show.id, refresh])

  const clearLayer = useCallback(async (layer: GraphicsLayer) => {
    await call(`/api/gfx/shows/${show.id}/air`, { method: 'POST', body: JSON.stringify({ action: 'clear', layer }) })
    refresh()
  }, [call, show.id, refresh])

  const clearAll = useCallback(async () => {
    await call(`/api/gfx/shows/${show.id}/air`, { method: 'POST', body: JSON.stringify({ action: 'clear_all' }) })
    refresh()
  }, [call, show.id, refresh])

  /**
   * Debounced save. The draft is the truth on screen the moment you type; the
   * database catches up 600ms later and nothing re-renders when it does. This
   * used to call router.refresh() on every save, which re-ran the whole server
   * page per keystroke burst. That was the lag.
   */
  const patchRow = useCallback((rowId: string, patch: Partial<ShowRow>) => {
    setPaused(true)
    setDraft(d => ({ ...d, [rowId]: { ...d[rowId], ...patch } }))
    clearTimeout(saveTimers.current[rowId])
    saveTimers.current[rowId] = setTimeout(async () => {
      await fetch(`/api/gfx/shows/${show.id}/rows/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => null)
      setPaused(false)
    }, 600)
  }, [show.id, setPaused])

  /**
   * Listening is the rig's ear. Off, every output page checks back every two
   * minutes; on, they run at broadcast cadence. It follows the show state
   * automatically and this is the manual override.
   */
  const setListening = useCallback(async (on: boolean) => {
    if (!show.channel) return
    const ok = await call(`/api/gfx/channels/${show.channel.id}`, {
      method: 'PATCH', body: JSON.stringify({ listening: on }),
    })
    if (ok) refresh()
  }, [call, show.channel, refresh])

  const patchShow = useCallback(async (patch: Record<string, unknown>) => {
    const ok = await call(`/api/gfx/shows/${show.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (ok) refresh()
  }, [call, show.id, refresh])

  const deleteRow = useCallback(async (rowId: string) => {
    const ok = await call(`/api/gfx/shows/${show.id}/rows/${rowId}`, { method: 'DELETE' })
    if (ok) { if (selId === rowId) setSelId(null); void refreshAndRenumber() }
  }, [call, show.id, selId, refreshAndRenumber])

  const duplicateRow = useCallback(async (row: ShowRow) => {
    const ok = await call(`/api/gfx/shows/${show.id}/rows`, {
      method: 'POST',
      body: JSON.stringify({
        after_row_id: row.id, block_id: row.block_id, page: row.page,
        slug: row.slug, form: row.form, est_seconds: row.est_seconds,
        is_break: row.is_break, graphic: row.graphic,
      }),
    })
    if (ok) void refreshAndRenumber()
  }, [call, show.id, refreshAndRenumber])

  const moveRow = useCallback(async (rowId: string, targetId: string, before: boolean) => {
    const ok = await call(`/api/gfx/shows/${show.id}/reorder`, {
      method: 'POST', body: JSON.stringify({ row_id: rowId, target_row_id: targetId, before }),
    })
    if (ok) void refreshAndRenumber()
  }, [call, show.id, refreshAndRenumber])

  /** Created with a placeholder and renamed in place. A modal prompt to name a
   *  thing you can see on screen is a step for nothing. */
  const addBlock = useCallback(async () => {
    const ok = await call(`/api/gfx/shows/${show.id}/blocks`, {
      method: 'POST', body: JSON.stringify({ label: 'NEW SEGMENT' }),
    })
    if (ok) void refreshAndRenumber()
  }, [call, show.id, refreshAndRenumber])

  const renameBlock = useCallback((blockId: string, label: string) => {
    setBlockDraft(d => ({ ...d, [blockId]: label }))
    clearTimeout(blockTimers.current[blockId])
    blockTimers.current[blockId] = setTimeout(() => {
      void fetch(`/api/gfx/shows/${show.id}/blocks/${blockId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      }).catch(() => null)
    }, 600)
  }, [show.id])

  /**
   * Deleting a block keeps its rows. Losing a whole segment because someone
   * meant to rename it is not a recoverable mistake mid-build.
   */
  const deleteBlock = useCallback(async (blockId: string, label: string, rowCount: number) => {
    const message = rowCount === 0
      ? `Delete the ${label} block?`
      : `Delete the ${label} block? Its ${rowCount} row${rowCount === 1 ? '' : 's'} stay, unassigned.`
    if (!window.confirm(message)) return
    const ok = await call(`/api/gfx/shows/${show.id}/blocks/${blockId}`, { method: 'DELETE' })
    if (ok) void refreshAndRenumber()
  }, [call, show.id, refreshAndRenumber])

  const addShelfItem = useCallback(async (tid: string) => {
    const template = templateById(tid)
    if (!template) return
    const ok = await call(`/api/gfx/shows/${show.id}/shelf`, {
      method: 'POST',
      body: JSON.stringify({ label: template.name, graphic: { tid, data: blankData(template) } }),
    })
    if (ok) refresh()
  }, [call, show.id, refresh])

  const deleteShelfItem = useCallback(async (itemId: string) => {
    const ok = await call(`/api/gfx/shows/${show.id}/shelf/${itemId}`, { method: 'DELETE' })
    if (ok) refresh()
  }, [call, show.id, refresh])

  const fireAudio = useCallback(async (assetId: string, mode: 'oneshot' | 'bed') => {
    await call(`/api/gfx/shows/${show.id}/audio`, {
      method: 'POST',
      body: JSON.stringify({ action: 'fire', cue: { asset_id: assetId, mode, gain_db: mode === 'bed' ? -14 : 0 } }),
    })
    refresh()
  }, [call, show.id, refresh])

  const stopAudio = useCallback(async (slot: 'oneshot' | 'bed' | 'all') => {
    await call(`/api/gfx/shows/${show.id}/audio`, { method: 'POST', body: JSON.stringify({ action: 'stop', slot }) })
    refresh()
  }, [call, show.id, refresh])

  // Both fall out of the as-run log, so they cost nothing to produce.
  useEffect(() => {
    if (mode !== 'review') return
    let cancelled = false
    void Promise.all([
      fetch(`/api/gfx/shows/${show.id}/export?kind=chapters`).then(r => (r.ok ? r.json() : null)),
      fetch(`/api/gfx/shows/${show.id}/export?kind=sponsors`).then(r => (r.ok ? r.json() : null)),
    ]).then(([ch, sp]) => {
      if (cancelled) return
      if (ch?.text !== undefined) setChapters(ch.text)
      if (sp?.sponsors) setSponsorReport(sp.sponsors)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [mode, show.id])

  const savePackage = useCallback(async () => {
    const name = window.prompt('Save this show\u2019s look as a package', `${show.name} package`)
    if (!name) return
    const ok = await call(`/api/gfx/shows/${show.id}/package`, {
      method: 'POST', body: JSON.stringify({ action: 'save', name }),
    })
    if (ok) refresh()
  }, [call, show.id, show.name, refresh])

  const addRow = useCallback(async (withGraphic: boolean) => {
    const template = templatesForEvent(show.event_type)[0]
    const ok = await call(`/api/gfx/shows/${show.id}/rows`, {
      method: 'POST',
      body: JSON.stringify({
        after_row_id: selId,
        slug: 'New row',
        graphic: withGraphic && template ? { tid: template.id, data: blankData(template) } : null,
      }),
    })
    if (ok) void refreshAndRenumber()
  }, [call, show.id, selId, show.event_type, refreshAndRenumber])

  /** Add straight into a block, so you add where you are looking. */
  const addRowToBlock = useCallback(async (blockId: string | null, afterRowId: string | null) => {
    const ok = await call(`/api/gfx/shows/${show.id}/rows`, {
      method: 'POST',
      body: JSON.stringify({ after_row_id: afterRowId, block_id: blockId, slug: 'New row' }),
    })
    if (ok) void refreshAndRenumber()
  }, [call, show.id, refreshAndRenumber])

  /**
   * Auto-out sweep. A row lower third comes down on its own so nobody has to
   * remember. The output also hides it locally, so this staying open is not
   * load-bearing; it just keeps the record honest.
   */
  useEffect(() => {
    if (mode !== 'run') return
    const expiring = air.filter(a => a.out_seconds > 0)
    if (expiring.length === 0) return
    const timer = setInterval(() => {
      const now = Date.now()
      for (const entry of expiring) {
        if (now - Date.parse(entry.taken_at) >= entry.out_seconds * 1000) {
          void clearLayer(entry.layer)
          return
        }
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [air, mode, clearLayer])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /input|textarea|select/i.test(el.tagName)) return
      if (e.key === ' ') { e.preventDefault(); void take() }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const i = merged.findIndex(r => r.id === nextId)
        const j = Math.max(0, Math.min(merged.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)))
        if (merged[j]) { setNextId(merged[j].id); setSelId(merged[j].id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [take, merged, nextId])

  const pages = useMemo(() => autoPages(blocks, merged), [blocks, merged])

  /**
   * Rows grouped under their block, every block shown whether or not it has
   * rows. A block header used to render only when a row pointed at it, so a
   * brand new block was invisible and looked like the button had done nothing.
   */
  const plan = useMemo(() => {
    type Entry =
      | { kind: 'block'; block: ShowBundle['blocks'][number] | null; count: number; lastRowId: string | null }
      | { kind: 'row'; row: ShowRow; index: number }

    const indexOf = new Map(merged.map((r, i) => [r.id, i]))
    const visible = merged.filter(r => !(role === 'graphics' && mode !== 'build' && !r.graphic))
    const out: Entry[] = []

    const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order)
    for (const block of ordered) {
      const rows = visible.filter(r => r.block_id === block.id)
      if (rows.length === 0 && mode !== 'build') continue
      out.push({ kind: 'block', block, count: rows.length, lastRowId: rows.at(-1)?.id ?? null })
      for (const row of rows) out.push({ kind: 'row', row, index: indexOf.get(row.id) ?? 0 })
    }

    const loose = visible.filter(r => !r.block_id || !ordered.some(b => b.id === r.block_id))
    if (loose.length > 0) {
      out.push({ kind: 'block', block: null, count: loose.length, lastRowId: loose.at(-1)?.id ?? null })
      for (const row of loose) out.push({ kind: 'row', row, index: indexOf.get(row.id) ?? 0 })
    }
    return out
  }, [blocks, merged, role, mode])
  const columns = mode === 'build' ? ROLE_COLUMNS.director : ROLE_COLUMNS[role]
  const previewGraphic = selected?.graphic ?? null
  const live = show.state === 'live'

  /** Edit in the grid. The right panel is for the graphic, not for retyping a slug. */
  const editing = mode === 'build'
  const field = (
    row: ShowRow, key: keyof ShowRow, className = '', placeholder = '',
  ) => (
    <input
      className={`sh-cell ${className}`}
      value={String(row[key] ?? '')}
      placeholder={placeholder}
      onClick={e => e.stopPropagation()}
      onChange={e => patchRow(row.id, { [key]: e.target.value } as Partial<ShowRow>)}
    />
  )

  const cell = (row: ShowRow, key: string, index: number) => {
    switch (key) {
      case 'pg': return (
        <td key={key} className="sh-pg">
          {mode === 'build' && <span className="sh-handle">⠿</span>}
          {/* Derived, never the stored value. A page that disagrees with the
              running order is worse than no page at all, and storing it only
              matters for the prompter and the exports. */}
          {pages[row.id] || row.page}
        </td>
      )
      case 'slug': return (
        <td key={key} className="sh-slug">
          {editing ? field(row, 'slug', 'strong', 'Slug') : row.slug}
          {row.repeat_count > 0 && <span className="gfx-note"> {row.repeat_count} × {row.per_unit_seconds}s</span>}
          {row.floated && <span className="gfx-chip idle" style={{ marginLeft: 6 }}>float</span>}
        </td>
      )
      case 'form': return (
        <td key={key}>
          {editing
            ? <input className="sh-cell tiny" value={row.form} onClick={e => e.stopPropagation()}
                onChange={e => patchRow(row.id, { form: e.target.value.toUpperCase().slice(0, 12) })} />
            : <span className={`sh-form ${row.form}`}>{row.form}</span>}
        </td>
      )
      case 'video': return <td key={key}>{editing ? field(row, 'video') : row.video}</td>
      case 'camera': return <td key={key}>{editing ? field(row, 'camera') : row.camera}</td>
      case 'audio': return <td key={key}>{editing ? field(row, 'audio_source') : row.audio_source}</td>
      case 'talent': return <td key={key}>{editing ? field(row, 'talent') : row.talent}</td>
      case 'gfx': return <td key={key}>{row.graphic ? <><span className="sh-gdot" />{templateById(row.graphic.tid)?.name}</> : null}</td>
      case 'gdetail': return <td key={key} className="gfx-note">{row.graphic ? templateById(row.graphic.tid)?.summary(row.graphic.data) : ''}</td>
      case 'est': {
        const script = readSeconds(row.script)
        const over = row.script && script > timing.est[index] + 3
        return (
          <td key={key} className="sh-num">
            {editing ? (
              <input className="sh-cell num" value={formatDuration(row.est_seconds)}
                onClick={e => e.stopPropagation()}
                onChange={e => patchRow(row.id, { est_seconds: parseDuration(e.target.value) })} />
            ) : formatDuration(timing.est[index])}
            {over ? <div className="sh-warn">script {formatDuration(script)}</div> : null}
          </td>
        )
      }
      case 'front': return <td key={key} className="sh-num gfx-note">{formatClock(timing.front[index], true)}</td>
      case 'back': return <td key={key} className="sh-num gfx-note">{formatClock(timing.back[index], true)}</td>
      case 'ok': return (
        <td key={key}>
          {editing ? (
            <button className="sh-okbtn" title={row.approved ? 'Approved' : 'Mark approved'}
              onClick={e => { e.stopPropagation(); patchRow(row.id, { approved: !row.approved }) }}>
              {row.approved ? <span className="sh-tick">✓</span> : <span className="gfx-chip idle">draft</span>}
            </button>
          ) : row.approved ? <span className="sh-tick">✓</span> : <span className="gfx-chip idle">draft</span>}
        </td>
      )
      case 'script': return (
        <td key={key} style={{ fontSize: 15, lineHeight: 1.5, maxWidth: '74ch' }}>
          {row.script || <span className="gfx-note">—</span>}
          {row.ifb && <div style={{ color: '#ff9ba4', fontSize: 11.5, fontStyle: 'italic' }}>IFB: {row.ifb}</div>}
        </td>
      )
      default: return <td key={key} />
    }
  }


  return (
    <div className="sh" style={themeCssVars(theme) as React.CSSProperties}>
      <div className="gfx-bar">
        <div className="brand">CSDtv<small>Show</small></div>
        <a href="/gfx" className="gfx-btn sm ghost" style={{ textDecoration: 'none' }}>← Shows</a>
        <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{show.name}</strong>
        <div className="sh-modes">
          {(['build', 'run', 'review'] as Mode[]).map(m => (
            <button key={m} className={`${mode === m ? 'on' : ''}${m === 'run' ? ' run' : ''}`} onClick={() => setMode(m)}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        {mode !== 'build' && (
          <select className="sh-role" value={role} onChange={e => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_COLUMNS) as Role[]).map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
          </select>
        )}
        <span className="gfx-spacer" />
        {error && <span style={{ color: '#ff9ba4', fontSize: 11.5 }}>{error}</span>}
        <span className={`gfx-chip ${live ? 'onair' : 'idle'}`}>{live ? 'On air' : show.state}</span>
        {show.channel && (
          <button
            className={`gfx-btn sm ${show.channel.listening ? 'on' : 'ghost'}`}
            title={show.channel.listening
              ? 'Outputs are polling at broadcast cadence'
              : 'Outputs are idle, checking back every two minutes'}
            onClick={() => void setListening(!show.channel!.listening)}>
            <span className={`sh-ear${show.channel.listening ? ' on' : ''}`} />
            {show.channel.name} {show.channel.listening ? 'listening' : 'idle'}
          </button>
        )}
        <button className="gfx-btn sm ghost" onClick={() => setDrawerOpen(true)}>⚙ Setup</button>
      </div>

      <SetupDrawer
        bundle={bundle}
        schools={schoolOptions}
        channels={channels}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onPatch={patchShow}
        onRefresh={refresh}
      />

      <div className={`sh-timing${live ? ' hot' : ''}`}>
        <div className="sh-tc"><div className="k">Air</div><div className="v sm">{show.air_at ? formatClock(Date.parse(show.air_at)) : '—'}</div></div>
        <div className="sh-tc"><div className="k">Hard out</div><div className="v sm">{show.hard_out_at ? formatClock(Date.parse(show.hard_out_at)) : '—'}</div></div>
        <div className="sh-tc"><div className="k">TRT</div><div className="v sm">{formatDuration(timing.trt)}</div></div>
        <div className="sh-tc">
          <div className="k">{timing.overUnder > 0 ? 'Heavy' : timing.overUnder < 0 ? 'Light' : 'On time'}</div>
          <div className={`v ${timing.overUnder > 1 ? 'sh-heavy' : timing.overUnder < -1 ? 'sh-light' : ''}`}>
            {timing.overUnder > 0 ? '+' : ''}{formatDuration(timing.overUnder)}
          </div>
        </div>
        <div className="sh-tc" style={{ flex: 1 }}><div className="k">On air</div>
          <div className="v sm">{airRow ? `${airRow.page} · ${airRow.slug}` : '—'}</div></div>
        <div className="sh-tc" style={{ minWidth: 118 }}><div className="k">Key</div>
          <div style={{ display: 'flex', gap: 11, marginTop: 5, fontSize: 9.5, fontWeight: 800 }}>
            <span style={{ color: 'var(--gx-live)' }}>■ ON AIR</span>
            <span style={{ color: 'var(--gx-next)' }}>■ NEXT</span>
          </div></div>
      </div>

      <div className={`sh-body${busy ? ' sh-busy' : ''}`}>
        <div className="sh-center">
          {mode === 'build' && (
            <div className="sh-tools">
              <b style={{ fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--gx-mu)' }}>Build</b>
              <button className="gfx-btn sm" onClick={() => void addRow(false)}>＋ Row</button>
              <button className="gfx-btn sm" onClick={() => void addRow(true)}>＋ Row with graphic</button>
              <button className="gfx-btn sm ghost" onClick={() => void addBlock()}>＋ Block</button>
              <button className="gfx-btn sm ghost" onClick={() => void refreshAndRenumber()}>Renumber</button>
              {selected && (
                <>
                  <span style={{ width: 1, height: 18, background: 'var(--gx-ln)', margin: '0 3px' }} />
                  <button className="gfx-btn sm ghost" onClick={() => void duplicateRow(selected)}>Duplicate</button>
                  <button className="gfx-btn sm ghost" style={{ color: '#ff9ba4', borderColor: 'var(--gx-live)' }}
                    onClick={() => void deleteRow(selected.id)}>Delete row</button>
                </>
              )}
              <span className="gfx-spacer" />
              <span className="gfx-note">Drag ⠿ to reorder · Space takes · ↑ ↓ arms</span>
            </div>
          )}
          <div className="sh-scroll">
            <table className="sh-rd">
              <thead><tr>{columns.map(c => <th key={c}>{COLUMN_LABEL[c]}</th>)}</tr></thead>
              <tbody>
                {plan.map(entry => {
                  if (entry.kind === 'block') {
                    const b = entry.block
                    return (
                      <tr className="sh-block" key={`b-${b?.id ?? 'none'}`}>
                        <td colSpan={columns.length}>
                          {b && mode === 'build' ? (
                            <input className="sh-blin" value={blockDraft[b.id] ?? b.label}
                              onClick={e => e.stopPropagation()}
                              onChange={e => renameBlock(b.id, e.target.value)} />
                          ) : (
                            <span className="sh-bl">{b ? b.label : 'UNASSIGNED'}</span>
                          )}
                          {b?.anchor_at && (
                            <span className="sh-anchor">
                              {b.anchor_type === 'hard_start' ? 'hard start ' : b.anchor_type === 'hard_out' ? 'hard out ' : 'target '}
                              {formatClock(Date.parse(b.anchor_at))}
                            </span>
                          )}
                          {mode === 'build' && (
                            <span className="sh-bacts">
                              <button className="gfx-btn sm ghost"
                                onClick={e => { e.stopPropagation(); void addRowToBlock(b?.id ?? null, entry.lastRowId) }}>
                                ＋ Row
                              </button>
                              {b && (
                                <button className="gfx-btn sm ghost" style={{ color: '#ff9ba4' }}
                                  onClick={e => { e.stopPropagation(); void deleteBlock(b.id, b.label, entry.count) }}>Delete</button>
                              )}
                            </span>
                          )}
                          {entry.count === 0 && (
                            <span className="gfx-note" style={{ marginLeft: 10 }}>empty</span>
                          )}
                        </td>
                      </tr>
                    )
                  }

                  const row = entry.row
                  const i = entry.index
                  const classes = [
                    'sh-row',
                    row.id === airRow?.id ? 'sh-air' : '',
                    row.id === nextId && row.id !== airRow?.id ? 'sh-next' : '',
                    row.ended_at ? 'sh-done' : '',
                    row.floated ? 'sh-float' : '',
                    row.is_break ? 'sh-brk' : '',
                    row.id === selId ? 'sh-sel' : '',
                  ].filter(Boolean).join(' ')
                  const tr = (
                    <tr
                      key={row.id}
                      className={[
                        classes,
                        dragId === row.id ? 'sh-dragging' : '',
                        dropTarget?.id === row.id ? (dropTarget.before ? 'sh-dropb' : 'sh-dropa') : '',
                      ].filter(Boolean).join(' ')}
                      draggable={mode === 'build'}
                      onClick={() => { setSelId(row.id); setNextId(row.id) }}
                      onDragStart={() => setDragId(row.id)}
                      onDragEnd={() => { setDragId(null); setDropTarget(null) }}
                      onDragOver={e => {
                        if (mode !== 'build' || !dragId) return
                        e.preventDefault()
                        const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setDropTarget({ id: row.id, before: e.clientY < box.top + box.height / 2 })
                      }}
                      onDrop={e => {
                        if (mode !== 'build' || !dragId) return
                        e.preventDefault()
                        const before = dropTarget?.id === row.id ? dropTarget.before : true
                        if (dragId !== row.id) void moveRow(dragId, row.id, before)
                        setDragId(null); setDropTarget(null)
                      }}
                    >
                      {columns.map(c => cell(row, c, i))}
                    </tr>
                  )
                  if (mode !== 'build' || row.id !== selId) return tr
                  return (
                    <Fragment key={row.id}>
                      {tr}
                      <tr className="sh-scriptrow">
                        <td colSpan={columns.length}>
                          <div className="sh-scriptwrap">
                            <label>
                              Script
                              <span className="gfx-note">reads {formatDuration(readSeconds(row.script))}</span>
                            </label>
                            <textarea value={row.script} placeholder="What is read out loud. This is what the prompter shows."
                              onClick={e => e.stopPropagation()}
                              onChange={e => patchRow(row.id, { script: e.target.value })} />
                            <label>IFB / talent note<span className="gfx-note">never read aloud</span></label>
                            <input className="sh-ifb" value={row.ifb} placeholder="In their ear only"
                              onClick={e => e.stopPropagation()}
                              onChange={e => patchRow(row.id, { ifb: e.target.value })} />
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
                {mode === 'build' && (
                  <tr><td colSpan={columns.length} className="sh-addrow" onClick={() => void addRow(false)}>＋ add a row</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sh-side">
          {mode === 'build' ? (
            <>
              <div className="sh-pvwrap">
                <div className="sh-mon pvw"><span className="lab">PREVIEW</span>
                  <StagePreview single={previewGraphic} ctx={ctx} />
                </div>
              </div>
              {selected ? (
                <RowEditor row={selected} onPatch={patch => patchRow(selected.id, patch)}
                  eventType={show.event_type} audioAssets={audioAssets}
                  onDuplicate={() => void duplicateRow(selected)}
                  onDelete={() => void deleteRow(selected.id)} />
              ) : (
                <section className="sh-sect"><div className="sh-in">
                  <p className="gfx-note">Click a row. Its graphic lands here, everything else is in the grid.</p>
                </div></section>
              )}

              <section className="sh-sect">
                <h4>Shelf<span className="r">{shelf.length} card{shelf.length === 1 ? '' : 's'}</span></h4>
                <div className="sh-in">
                  {shelf.map(item => (
                    <div key={item.id} className="sh-lrow">
                      <span style={{ flex: 1 }}>
                        <b>{item.label}</b>
                        <div className="gfx-note">{item.graphic ? templateById(item.graphic.tid)?.name : 'no graphic'}</div>
                      </span>
                      <button className="gfx-btn sm ghost" style={{ color: '#ff9ba4', borderColor: 'var(--gx-live)' }}
                        onClick={() => void deleteShelfItem(item.id)}>Remove</button>
                    </div>
                  ))}
                  <select value="" style={{ marginTop: 6 }} onChange={e => { if (e.target.value) void addShelfItem(e.target.value) }}>
                    <option value="">Add a shelf card…</option>
                    {templatesForEvent(show.event_type).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <p className="gfx-note" style={{ marginTop: 7 }}>
                    The shelf is what the graphics operator owns. Not in the running order, not in the timing,
                    and never cleared by a take.
                  </p>
                </div>
              </section>
            </>
          ) : mode === 'run' ? (
            <>
              <section className="sh-sect">
                <h4>Program</h4>
                <div className="sh-in">
                  <div className="sh-pvpg">
                    <div className="sh-mon pvw"><span className="lab">PREVIEW</span>
                      <StagePreview single={merged.find(r => r.id === nextId)?.graphic ?? null} ctx={ctx} /></div>
                    <div className="sh-mon pgm"><span className="lab">PROGRAM</span>
                      <StagePreview air={air} ctx={ctx} /></div>
                  </div>
                </div>
              </section>
              {(role === 'director' || role === 'graphics') && (
                <section className="sh-sect">
                  <h4>Transport</h4>
                  <div className="sh-in">
                    <p className="gfx-note">Next</p>
                    <div style={{ fontWeight: 700, fontSize: 13.5, minHeight: 18, marginBottom: 6 }}>
                      {merged.find(r => r.id === nextId) ? `${merged.find(r => r.id === nextId)!.page} · ${merged.find(r => r.id === nextId)!.slug}` : '—'}
                    </div>
                    <button className="gfx-btn take" style={{ width: '100%', minHeight: 54, fontSize: 15 }}
                      disabled={!nextId || busy} onClick={() => void take()}>TAKE</button>
                  </div>
                </section>
              )}
              {role === 'graphics' && show.event_type === 'game' && (
                <section className="sh-sect">
                  <h4>Jersey lookup<span className="r">one pad, both teams</span></h4>
                  <div className="sh-in">
                    <JerseyPad
                      home={rosters.home}
                      away={rosters.away}
                      homeSchool={schoolOptions.find(s => s.code === show.school_code)}
                      awaySchool={schoolOptions.find(s => s.code === show.away_code)}
                      disabled={busy}
                      onTake={graphic => void fireShelf(graphic)}
                    />
                  </div>
                </section>
              )}

              {(role === 'director' || role === 'graphics' || role === 'audio') && audioAssets.length > 0 && (
                <section className="sh-sect">
                  <h4>Audio<span className="r">its own OBS source</span></h4>
                  <div className="sh-in">
                    <div className="sh-tiles">
                      {audioAssets.slice(0, 6).map(asset => (
                        <button key={asset.id} className="gfx-btn"
                          onClick={() => void fireAudio(asset.id, asset.kind === 'bed' ? 'bed' : 'oneshot')}>
                          {asset.name}
                        </button>
                      ))}
                    </div>
                    <div className="sh-g2" style={{ marginTop: 6 }}>
                      <button className="gfx-btn ghost sm" onClick={() => void stopAudio('oneshot')}>Stop clip</button>
                      <button className="gfx-btn ghost sm" onClick={() => void stopAudio('bed')}>Stop bed</button>
                    </div>
                    <p className="gfx-note" style={{ marginTop: 7 }}>
                      Plays out of <code>/gfx/{show.channel?.slug ?? '…'}/audio</code>, so it has its own fader in
                      OBS and the graphics source stays muted.
                    </p>
                  </div>
                </section>
              )}

              {(role === 'director' || role === 'graphics' || role === 'talent') && (
                <section className="sh-sect">
                  <h4>Prompter<span className="r">{show.prompter_speed.toFixed(1)}\u00d7</span></h4>
                  <div className="sh-in">
                    <div className="sh-g2">
                      <button className={`gfx-btn ${show.prompter_roll ? 'live' : ''}`}
                        onClick={() => void patchShow({ prompter_roll: !show.prompter_roll })}>
                        {show.prompter_roll ? '\u23f8 Pause' : '\u25b6 Roll'}
                      </button>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="gfx-btn ghost" style={{ flex: 1 }}
                          onClick={() => void patchShow({ prompter_speed: Math.max(0.2, show.prompter_speed - 0.2) })}>\u2013</button>
                        <button className="gfx-btn ghost" style={{ flex: 1 }}
                          onClick={() => void patchShow({ prompter_speed: Math.min(6, show.prompter_speed + 0.2) })}>+</button>
                      </div>
                    </div>

                    <label className="sh-label">Position</label>
                    <div className="sh-seg">
                      <button className="gfx-btn"
                        onClick={() => void patchShow({ prompter_seek: { kind: 'back', value: '3' } })}>\u2191\u2191 Back</button>
                      <button className="gfx-btn"
                        onClick={() => void patchShow({ prompter_seek: { kind: 'back', value: '1' } })}>\u2191 Line</button>
                      <button className="gfx-btn"
                        onClick={() => void patchShow({ prompter_seek: { kind: 'forward', value: '1' } })}>\u2193 Line</button>
                      <button className="gfx-btn"
                        onClick={() => void patchShow({ prompter_seek: { kind: 'forward', value: '3' } })}>\u2193\u2193 Ahead</button>
                    </div>
                    <div className="sh-seg" style={{ marginTop: 4 }}>
                      <button className="gfx-btn ghost"
                        onClick={() => void patchShow({ prompter_seek: { kind: 'air' } })}>Back to on air</button>
                      <button className="gfx-btn ghost"
                        onClick={() => void patchShow({ prompter_seek: { kind: 'top' } })}>Top of show</button>
                      {selected && (
                        <button className="gfx-btn ghost"
                          onClick={() => void patchShow({ prompter_seek: { kind: 'row', value: selected.id } })}>
                          Jump to {selected.page || selected.slug}
                        </button>
                      )}
                    </div>

                    <p className="gfx-note" style={{ marginTop: 7 }}>
                      Back scrolls the prompter up without moving the rundown, so talent can pick up a line they
                      missed and the show never re-takes anything. <b>Back to on air</b> puts it where the
                      director is.
                    </p>
                  </div>
                </section>
              )}

              <section className="sh-sect">
                <h4>On air now<span className="r">{air.length} layer{air.length === 1 ? '' : 's'}</span></h4>
                <div className="sh-in">
                  {air.length === 0 ? <p className="gfx-note">Clear.</p> : air.map(entry => (
                    <div key={entry.layer} className="sh-lrow air" onClick={() => void clearLayer(entry.layer)}>
                      <span style={{ flex: 1 }}>
                        <b>{templateById(entry.graphic.tid)?.summary(entry.graphic.data)}</b>
                        <div className="gfx-note">
                          {GRAPHICS_LAYER_LABELS[entry.layer]} · from the {entry.source === 'row' ? 'rundown' : 'shelf'} · tap to clear
                        </div>
                      </span>
                    </div>
                  ))}
                  <button className="gfx-btn live sm" style={{ width: '100%', marginTop: 5 }} onClick={() => void clearAll()}>
                    Clear all graphics
                  </button>
                  <p className="gfx-note" style={{ marginTop: 6 }}>
                    Rundown graphics clear themselves on the next take. Shelf graphics stay until you clear them.
                  </p>
                </div>
              </section>
              {shelf.length > 0 && (
                <section className="sh-sect">
                  <h4>Shelf</h4>
                  <div className="sh-in">
                    <div className="sh-tiles">
                      {shelf.map(item => (
                        <button key={item.id} className="gfx-btn"
                          disabled={!item.graphic}
                          onClick={() => item.graphic && void fireShelf(item.graphic)}>{item.label}</button>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
            <section className="sh-sect">
              <h4>As run</h4>
              <div className="sh-in">
                {merged.filter(r => r.started_at && r.ended_at).length === 0 ? (
                  <p className="gfx-note">Nothing has run yet.</p>
                ) : (
                  <table className="sh-rd" style={{ fontSize: 11.5 }}>
                    <thead><tr><th>Pg</th><th>Planned</th><th>Actual</th><th>Diff</th></tr></thead>
                    <tbody>
                      {merged.filter(r => r.started_at && r.ended_at).map(r => {
                        const actual = (Date.parse(r.ended_at!) - Date.parse(r.started_at!)) / 1000
                        const planned = timing.est[merged.indexOf(r)]
                        const diff = actual - planned
                        return (
                          <tr key={r.id}>
                            <td className="sh-pg">{r.page}</td>
                            <td className="sh-num">{formatDuration(planned)}</td>
                            <td className="sh-num">{formatDuration(actual)}</td>
                            <td className={`sh-num ${diff > 0 ? 'sh-heavy' : 'sh-light'}`}>{diff > 0 ? '+' : ''}{formatDuration(diff)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="sh-sect">
              <h4>YouTube chapters<span className="r">paste into the description</span></h4>
              <div className="sh-in">
                <textarea readOnly value={chapters || 'Nothing has run yet.'}
                  style={{ minHeight: 130, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }} />
                <button className="gfx-btn sm ghost" style={{ width: '100%', marginTop: 6 }}
                  disabled={!chapters}
                  onClick={() => void navigator.clipboard?.writeText(chapters)}>Copy</button>
                <p className="gfx-note" style={{ marginTop: 7 }}>
                  Built from the as-run log, so every piece at a concert and every quarter at a game is a
                  chapter without anyone writing one down.
                </p>
              </div>
            </section>

            <section className="sh-sect">
              <h4>Sponsor report<span className="r">{sponsorReport.length}</span></h4>
              <div className="sh-in">
                {sponsorReport.length === 0 ? (
                  <p className="gfx-note">No sponsor graphics have run yet.</p>
                ) : sponsorReport.map(line => (
                  <div key={line.name} className="sh-lrow">
                    <span style={{ flex: 1 }}>{line.name}</span>
                    <span className="gfx-note">
                      {line.takes} take{line.takes === 1 ? '' : 's'} · {formatDuration(line.seconds)}
                    </span>
                  </div>
                ))}
                <p className="gfx-note" style={{ marginTop: 7 }}>
                  Takes and on-screen time per sponsor, counted off the same log. Nobody else covering high
                  school sports hands this to a sponsor.
                </p>
              </div>
            </section>

            <section className="sh-sect">
              <h4>Save</h4>
              <div className="sh-in">
                <button className="gfx-btn sm" style={{ width: '100%' }} onClick={() => void savePackage()}>
                  Save this show as a package
                </button>
                <p className="gfx-note" style={{ marginTop: 7 }}>
                  Saves the templates in use, their mark settings and the shelf. Recall it on the next show
                  of this type from setup.
                </p>
              </div>
            </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The graphic, and nothing else.
 *
 * Everything about the row itself lives in the grid where the row is. This
 * panel used to repeat all of it, which meant two places to change one thing
 * and a wall of fields to read past before reaching the work.
 */
function RowEditor({
  row, onPatch, eventType, audioAssets, onDuplicate, onDelete,
}: {
  row: ShowRow
  onPatch: (patch: Partial<ShowRow>) => void
  eventType: ShowBundle['show']['event_type']
  audioAssets: ShowBundle['audioAssets']
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [openOptions, setOpenOptions] = useState(false)
  const template = row.graphic ? templateById(row.graphic.tid) : null
  const cue = (row.audio_cue || null) as { asset_id: string; mode: 'oneshot' | 'bed'; gain_db: number } | null
  const cueAsset = cue ? audioAssets.find(a => a.id === cue.asset_id) ?? null : null

  const setGraphicField = (field: string, value: string) => {
    if (!row.graphic) return
    onPatch({ graphic: { ...row.graphic, data: { ...row.graphic.data, [field]: value } } })
  }

  const optionCount = (cue ? 1 : 0) + (row.hold_full ? 1 : 0) + (row.floated ? 1 : 0)

  return (
    <>
      <section className="sh-sect">
        <h4>
          {row.page ? `${row.page} · ` : ''}{row.slug || 'Row'}
          <span className="r">{template ? GRAPHICS_LAYER_LABELS[template.layer] : 'no graphic'}</span>
        </h4>
        <div className="sh-in">
          {!template ? (
            <>
              <select defaultValue="" onChange={e => {
                const t = templateById(e.target.value)
                if (t) onPatch({ graphic: { tid: t.id, data: blankData(t) } })
              }}>
                <option value="">Add a graphic…</option>
                {templatesForEvent(eventType).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p className="gfx-note" style={{ marginTop: 8 }}>
                This row carries no graphic. Plenty of rows should not.
              </p>
            </>
          ) : (
            <>
              <div className="sh-tswap">
                <select value={template.id} onChange={e => {
                  const t = templateById(e.target.value)
                  if (t) onPatch({ graphic: { tid: t.id, data: blankData(t) } })
                }}>
                  {templatesForEvent(eventType).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="gfx-btn sm ghost" title="Remove the graphic from this row"
                  onClick={() => onPatch({ graphic: null })}>✕</button>
              </div>

              {template.fields.map(field => (
                <div key={field.id}>
                  <label className="sh-label">{field.label}</label>
                  {field.type === 'logo' ? (
                    <div className="sh-seg">
                      {LOGO_CHOICES.map(choice => (
                        <button key={choice.value}
                          className={`gfx-btn ${row.graphic!.data[field.id] === choice.value ? 'on' : ''}`}
                          onClick={() => setGraphicField(field.id, choice.value)}>{choice.label}</button>
                      ))}
                    </div>
                  ) : field.type === 'choice' ? (
                    <div className="sh-seg">
                      {(field.options || []).map(choice => {
                        const value = row.graphic!.data[field.id] || field.placeholder || ''
                        return (
                          <button key={choice.value}
                            className={`gfx-btn ${value === choice.value ? 'on' : ''}`}
                            onClick={() => setGraphicField(field.id, choice.value)}>{choice.label}</button>
                        )
                      })}
                    </div>
                  ) : field.type === 'textarea' ? (
                    <textarea style={{ minHeight: 48 }} value={row.graphic!.data[field.id] || ''}
                      onChange={e => setGraphicField(field.id, e.target.value)} />
                  ) : (
                    <input value={row.graphic!.data[field.id] || ''}
                      onChange={e => setGraphicField(field.id, e.target.value)} />
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <section className="sh-sect">
        <button className="sh-disc" onClick={() => setOpenOptions(v => !v)}>
          <span className="sh-caret">{openOptions ? '▾' : '▸'}</span>
          Row options
          {optionCount > 0 && <span className="sh-badge">{optionCount}</span>}
        </button>
        {openOptions && (
          <div className="sh-in">
            <label className="sh-label" style={{ marginTop: 0 }}>On take</label>
            <div className="sh-seg">
              <button className={`gfx-btn ${!row.hold_full ? 'on' : ''}`}
                onClick={() => onPatch({ hold_full: false })}>Clear the full screen</button>
              <button className={`gfx-btn ${row.hold_full ? 'on' : ''}`}
                onClick={() => onPatch({ hold_full: true })}>Hold it</button>
            </div>

            <label className="sh-label">Audio cue on take</label>
            {audioAssets.length === 0 ? (
              <p className="gfx-note">Nothing uploaded yet. The Library&rsquo;s Audio tab takes the file.</p>
            ) : (
              <>
                <select value={cue?.asset_id ?? ''} onChange={e => {
                  const assetId = e.target.value
                  if (!assetId) { onPatch({ audio_cue: null }); return }
                  const asset = audioAssets.find(a => a.id === assetId)
                  const mode = asset?.kind === 'bed' ? 'bed' : 'oneshot'
                  onPatch({ audio_cue: { asset_id: assetId, mode, gain_db: mode === 'bed' ? -14 : 0 } })
                }}>
                  <option value="">None</option>
                  {audioAssets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.kind}{a.duration_seconds ? ` · ${formatDuration(Math.round(a.duration_seconds))}` : ''}
                    </option>
                  ))}
                </select>
                {cue && (
                  <>
                    <div className="sh-seg" style={{ marginTop: 6 }}>
                      <button className={`gfx-btn ${cue.mode === 'oneshot' ? 'on' : ''}`}
                        onClick={() => onPatch({ audio_cue: { ...cue, mode: 'oneshot' } })}>One shot</button>
                      <button className={`gfx-btn ${cue.mode === 'bed' ? 'on' : ''}`}
                        onClick={() => onPatch({ audio_cue: { ...cue, mode: 'bed', gain_db: cue.gain_db || -14 } })}>Bed</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <input type="range" min={-30} max={6} step={1} value={cue.gain_db} style={{ flex: 1 }}
                        onChange={e => onPatch({ audio_cue: { ...cue, gain_db: Number(e.target.value) } })} />
                      <span className="gfx-note" style={{ minWidth: 44, textAlign: 'right' }}>{cue.gain_db} dB</span>
                    </div>
                    {cueAsset?.duration_seconds && row.est_seconds !== Math.round(cueAsset.duration_seconds) && (
                      <button className="gfx-btn sm ghost" style={{ marginTop: 6 }}
                        onClick={() => onPatch({ est_seconds: Math.round(cueAsset.duration_seconds!) })}>
                        Set the estimate to the clip, {formatDuration(Math.round(cueAsset.duration_seconds))}
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 5, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="gfx-btn sm ghost" onClick={() => onPatch({ floated: !row.floated })}>
                {row.floated ? 'Unfloat' : 'Float'}
              </button>
              <button className="gfx-btn sm ghost" onClick={onDuplicate}>Duplicate</button>
              <button className="gfx-btn sm ghost" style={{ color: '#ff9ba4', borderColor: 'var(--gx-live)' }}
                onClick={onDelete}>Delete row</button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
