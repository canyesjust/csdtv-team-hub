'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { resolveCurrentAgendaItem } from '@/lib/board-meetings/control-meeting-cache'
import type { ControlBundle, LowerThirdPerson } from '@/lib/board-meetings/types'

type AttStatus = 'present' | 'remote' | 'absent'

type Props = {
  productionId: string
  bundle: ControlBundle
  canControl: boolean
  busy: boolean
  onAction: (action: string, body?: unknown) => Promise<void>
  onSetAttendance?: (personId: string, status: AttStatus) => void | Promise<void>
}

const C = {
  bg: '#0a0f1a', panel: '#111a2b', panel2: '#16223a',
  line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)',
  text: '#eaf1fb', soft: '#9fb2d0', dim: '#64748b',
  accent: '#4f9dee', accentbg: 'rgba(79,157,238,.16)',
  live: '#ff5d5d', livebg: 'rgba(255,93,93,.16)',
  yea: '#34d399', yeabg: 'rgba(52,211,153,.16)',
  nay: '#f87171', naybg: 'rgba(248,113,113,.16)',
  amber: '#fbbf24', amberbg: 'rgba(251,191,36,.15)',
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function ConsoleView({ productionId, bundle, canControl, busy, onAction, onSetAttendance }: Props) {
  const bs = bundle.broadcast_state
  const status = bs?.status || bundle.board_meeting.broadcast_status || 'draft'
  const isLive = status === 'live'
  const isPrepared = status === 'prepared'
  const mode = bs?.mode || 'normal'
  const elapsedStartedAt = bs?.elapsed_started_at ?? null
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [attOpen, setAttOpen] = useState(false)

  useEffect(() => {
    if (!elapsedStartedAt) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [elapsedStartedAt])

  const currentItem = resolveCurrentAgendaItem(bundle.agenda_items, bs?.current_agenda_item_id, bundle.current_agenda_item)
  const currentSort = currentItem ? currentItem.sort_order : -1

  const sections = useMemo(() => {
    const map = new Map<number, { title: string; number: number; items: ControlBundle['agenda_items'] }>()
    for (const it of bundle.agenda_items) {
      if (!map.has(it.section_number)) map.set(it.section_number, { title: it.section_title, number: it.section_number, items: [] })
      map.get(it.section_number)!.items.push(it)
    }
    return [...map.values()].sort((a, b) => a.number - b.number)
  }, [bundle.agenda_items])

  const people = bundle.lower_third_people || []
  const boardPeople = people.filter(p => p.category === 'board_member')
  const staffPeople = people.filter(p => p.category === 'staff')
  const activeLt = bundle.lower_third_active
  const position = bs?.lower_third_position ?? 'left'

  const att = bundle.attendance
  const presentCount = att?.quorum.present_count ?? 0
  const threshold = att?.quorum.threshold ?? 0
  const quorumMet = att?.quorum.quorum_met ?? false

  const setLt = (p: LowerThirdPerson) =>
    onAction('set-lower-third', { person_id: p.id, person: p, position })

  const chip = (sel: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 12, padding: '7px 11px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${sel ? 'transparent' : C.line2}`, background: sel ? C.accentbg : 'transparent',
    color: sel ? '#bcdcff' : C.text, fontWeight: sel ? 600 : 400,
  })
  const cardStyle: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 12 }
  const h3: React.CSSProperties = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: C.accent, fontWeight: 700, margin: '0 0 10px' }
  const btn: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '8px 13px', borderRadius: 9, border: `1px solid ${C.line2}`, background: 'transparent', color: C.text, cursor: 'pointer' }

  const attStatus = (personId: string): AttStatus => {
    const r = att?.records.find(x => x.person_id === personId)
    if (!r) return 'present'
    if (r.status === 'absent' || r.status === 'left_early') return 'absent'
    if (r.status === 'remote') return 'remote'
    return 'present'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#05080f', color: C.text, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', margin: 12 }}>
        {/* TOP BAR */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '12px 18px', borderBottom: `1px solid ${C.line}`, background: '#0c1220' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{bundle.meeting?.title || 'Board Meeting'}</div>
            <div style={{ fontSize: 12, color: C.dim }}>
              <Link href="/dashboard/board-meetings" style={{ color: C.dim }}>← Board Meetings</Link>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {isLive ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#ffb3b3', background: C.livebg, padding: '6px 13px', borderRadius: 999 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.live, display: 'inline-block' }} /> ON AIR
              </span>
            ) : isPrepared ? <span style={{ fontSize: 13, fontWeight: 600, color: C.soft }}>Pre-show</span> : null}
            {elapsedStartedAt && <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600 }}>{fmtElapsed(nowMs - new Date(elapsedStartedAt).getTime())}</span>}
            {currentItem && <span style={{ fontSize: 13, color: C.soft }}>On air: <b style={{ color: C.text, fontWeight: 600 }}>Item {currentItem.item_number} — {currentItem.title}</b></span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setAttOpen(true)} style={{ font: 'inherit', cursor: 'pointer', border: 'none', fontSize: 12, fontWeight: 600, color: quorumMet ? '#b7f0d8' : '#ffc4c4', background: quorumMet ? C.yeabg : C.naybg, padding: '6px 12px', borderRadius: 999 }}>
              Attendance {presentCount} / {att?.records.length ?? 0} ▾
            </button>
            {isLive && <button onClick={() => onAction('end-meeting')} disabled={!canControl} style={{ ...btn, color: '#ffc4c4', borderColor: 'rgba(255,93,93,.4)' }}>End meeting</button>}
          </div>
        </div>

        {!canControl && (
          <p style={{ margin: 0, padding: '10px 18px', background: C.amberbg, color: '#fde3a7', fontSize: 13 }}>Lock the agenda before using broadcast controls.</p>
        )}

        {/* THREE COLUMNS */}
        <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr) 340px' }}>
          {/* AGENDA */}
          <div style={{ padding: 14, minHeight: 600 }}>
            <div style={{ ...h3, display: 'flex', justifyContent: 'space-between' }}><span>Agenda</span></div>
            {sections.map(sec => (
              <div key={sec.number}>
                <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '.06em', margin: '12px 0 5px', fontWeight: 600 }}>{sec.number} · {sec.title}</div>
                {sec.items.map(it => {
                  const live = it.id === bs?.current_agenda_item_id
                  const done = currentSort >= 0 && it.sort_order < currentSort
                  return (
                    <div key={it.id} onClick={() => canControl && onAction('jump-to', { agenda_item_id: it.id })}
                      style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 9px', borderRadius: 9, cursor: canControl ? 'pointer' : 'default', marginBottom: 2, opacity: done ? 0.42 : 1, background: live ? C.accentbg : 'transparent', border: `1px solid ${live ? 'rgba(79,157,238,.4)' : 'transparent'}` }}>
                      <span style={{ fontSize: 12, color: live ? '#bcdcff' : C.dim, fontWeight: 600, minWidth: 30, fontVariantNumeric: 'tabular-nums' }}>{it.item_number}</span>
                      <span style={{ fontSize: 13, lineHeight: 1.3 }}>
                        {it.title}
                        {(it.type === 'action' || it.action_requested) && <span style={{ fontSize: 10, color: C.amber, background: C.amberbg, padding: '1px 6px', borderRadius: 5, marginLeft: 6 }}>action</span>}
                        {!it.is_broadcastable && <span style={{ fontSize: 10, color: C.dim, marginLeft: 6 }}>skipped</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* CENTER */}
          <div style={{ padding: 14, minHeight: 600, borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px', marginBottom: 12 }}>
              <button style={btn} disabled={!canControl || busy} onClick={() => onAction('go-back')}>◀ Prev</button>
              <div style={{ flex: 1, fontSize: 13 }}>On air: <b style={{ fontWeight: 600 }}>{currentItem ? `Item ${currentItem.item_number} — ${currentItem.title}` : 'Nothing on air'}</b></div>
              <button style={{ ...btn, background: C.accent, color: '#06101f', border: 'none', fontWeight: 600 }} disabled={!canControl || busy} onClick={() => onAction('advance')}>Next item ▶</button>
            </div>

            {isPrepared && canControl && (
              <button onClick={() => onAction('end-preroll')} disabled={busy} style={{ width: '100%', padding: 14, border: 'none', borderRadius: 10, background: C.accent, color: '#06101f', font: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
                Go live (gavel) — starts the official meeting
              </button>
            )}

            {/* LOWER THIRD */}
            <div style={cardStyle}>
              <h3 style={h3}>Lower third</h3>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: C.dim, fontWeight: 600, margin: '0 0 6px' }}>Board members</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {boardPeople.map(p => (
                  <button key={p.id} style={chip(activeLt?.person_id === p.id)} disabled={!canControl} onClick={() => setLt(p)}>{p.display_name}</button>
                ))}
              </div>
              {staffPeople.length > 0 && <>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: C.dim, fontWeight: 600, margin: '10px 0 6px' }}>Frequent staff</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {staffPeople.map(p => (
                    <button key={p.id} style={chip(activeLt?.person_id === p.id)} disabled={!canControl} onClick={() => setLt(p)}>{p.display_name}</button>
                  ))}
                </div>
              </>}

              <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'stretch' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 9, background: activeLt ? C.livebg : C.panel2, border: `1px solid ${activeLt ? 'rgba(255,93,93,.35)' : C.line}` }}>
                  {activeLt ? (
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: '#ffb3b3' }}>● ON AIR</span>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{activeLt.display_name}</div>
                      {activeLt.primary_title && <div style={{ fontSize: 11, color: C.soft }}>{activeLt.primary_title}</div>}
                    </div>
                  ) : <div style={{ fontSize: 13, color: C.dim }}>No lower third on air</div>}
                  {activeLt && <button style={{ ...btn, color: '#ffc4c4', borderColor: 'rgba(255,93,93,.4)' }} disabled={!canControl} onClick={() => onAction('clear-lower-third')}>Clear</button>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 96 }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: C.dim, fontWeight: 600 }}>Position</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {(['left', 'center', 'right'] as const).map(pos => (
                      <button key={pos} style={{ ...chip(position === pos), flex: 1, textAlign: 'center', padding: '6px 0' }} disabled={!canControl} onClick={() => onAction('set-lower-third-position', { position: pos })}>{pos[0].toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* MOTION (inline next slice — summary + pop-out for now) */}
            <div style={cardStyle}>
              <h3 style={{ ...h3, display: 'flex', justifyContent: 'space-between' }}>
                <span>Motion</span>
                <Link href={`/control/${productionId}/motion`} style={{ fontSize: 11, color: C.accent, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Open motion screen ↗</Link>
              </h3>
              {bundle.motion_lifecycle && bundle.motion_lifecycle.state !== 'no_motion' ? (
                <div style={{ fontSize: 13, color: C.soft }}>
                  {bundle.motion_lifecycle.active_motion?.text || 'Motion in progress'} — <span style={{ color: C.text }}>{bundle.motion_lifecycle.state.replace(/_/g, ' ')}</span>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: C.soft, lineHeight: 1.5 }}>
                  {currentItem && (currentItem.type === 'action' || currentItem.action_requested)
                    ? `Item ${currentItem.item_number} is an action item. Open the motion screen to run the vote — folding this inline is the next build slice.`
                    : 'No action item on air.'}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT RAIL */}
          <div style={{ padding: 14, minHeight: 600 }}>
            <div style={{ ...h3 }}>Confidence + controls</div>

            <div style={cardStyle}>
              <h3 style={h3}>On air now</h3>
              <div style={{ aspectRatio: '16 / 9', background: '#000', border: `1px solid ${C.line2}`, borderRadius: 10, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 0%,#10233f 0%,#060c16 70%)' }} />
                {activeLt && (
                  <div style={{ position: 'relative', margin: '0 0 14px 14px', background: 'rgba(8,14,26,.86)', borderLeft: `3px solid ${C.accent}`, padding: '6px 11px', borderRadius: '0 6px 6px 0', maxWidth: '78%' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{activeLt.display_name}</div>
                    {activeLt.primary_title && <div style={{ fontSize: 10, color: C.soft }}>{activeLt.primary_title}</div>}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>Live delivery confirmation arrives in a later slice.</div>
            </div>

            {/* MODES */}
            <div style={cardStyle}>
              <h3 style={h3}>Modes</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <button style={{ ...btn, textAlign: 'center', ...(mode === 'recess' ? { background: C.amberbg, color: '#fde3a7', borderColor: 'transparent' } : {}) }} disabled={!canControl} onClick={() => onAction(mode === 'recess' ? 'clear-mode' : 'recess')}>Recess</button>
                <button style={{ ...btn, textAlign: 'center', ...(mode === 'technical_difficulties' ? { background: C.amberbg, color: '#fde3a7', borderColor: 'transparent' } : {}) }} disabled={!canControl} onClick={() => onAction(mode === 'technical_difficulties' ? 'clear-mode' : 'technical-difficulties')}>Technical difficulties</button>
                <button style={{ ...btn, textAlign: 'center' }} disabled={!canControl} onClick={() => onAction('toggle-overlay')}>Toggle overlay</button>
                <button style={{ ...btn, textAlign: 'center' }} disabled={!canControl} onClick={() => onAction('show-agenda-branding')}>Agenda branding</button>
              </div>
              {mode !== 'normal' && <div style={{ fontSize: 12, color: '#fde3a7', marginTop: 8 }}>Mode: {mode.replace(/_/g, ' ')}</div>}
            </div>

            {/* OUTPUT CHANNELS readout */}
            <div style={cardStyle}>
              <h3 style={h3}>Output channels</h3>
              {(bundle.channels || []).slice(0, 6).map(ch => {
                const assigned = (bundle.channel_assignments || []).some(a => a.output_channel_id === ch.id)
                return (
                  <div key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '7px 9px', borderRadius: 8, background: C.panel2, border: `1px solid ${C.line}`, marginBottom: 6 }}>
                    <span>{ch.channel_name}</span>
                    <span style={{ color: assigned ? C.yea : C.dim, fontWeight: assigned ? 600 : 400 }}>{assigned ? '● listening' : 'idle'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ATTENDANCE DRAWER */}
      {attOpen && (
        <>
          <div onClick={() => setAttOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,11,.55)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 430, maxWidth: '90vw', background: C.bg, borderLeft: `1px solid ${C.line2}`, zIndex: 41, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: `1px solid ${C.line}` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Attendance · roll call</div>
                <div style={{ fontSize: 12, color: C.soft, marginTop: 2 }}>Adjust anytime — quorum and the vote grid update live</div>
              </div>
              <button style={btn} onClick={() => setAttOpen(false)}>Close</button>
            </div>
            <div style={{ padding: '14px 18px', overflow: 'auto', flex: 1 }}>
              {(att?.records || []).map(r => {
                const st = attStatus(r.person_id)
                return (
                  <div key={r.person_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.line}` }}>
                    <div><div style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</div>{r.arrived_at && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>arrived {new Date(r.arrived_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>}</div>
                    <div style={{ display: 'flex', border: `1px solid ${C.line2}`, borderRadius: 8, overflow: 'hidden' }}>
                      {(['present', 'remote', 'absent'] as AttStatus[]).map((s, i) => {
                        const on = st === s
                        const col = s === 'absent' ? { bg: C.naybg, fg: '#ffc4c4' } : s === 'remote' ? { bg: C.amberbg, fg: '#fde3a7' } : { bg: C.yeabg, fg: '#bff3dd' }
                        return (
                          <button key={s} disabled={!canControl || !onSetAttendance} onClick={() => onSetAttendance?.(r.person_id, s)}
                            style={{ font: 'inherit', fontSize: 12, padding: '6px 11px', border: 'none', borderLeft: i ? `1px solid ${C.line}` : 'none', cursor: 'pointer', textTransform: 'capitalize', background: on ? col.bg : 'transparent', color: on ? col.fg : C.soft, fontWeight: on ? 600 : 400 }}>{s}</button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '14px 18px', borderTop: `1px solid ${C.line}`, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.soft }}>{presentCount} present of {att?.records.length ?? 0}</span>
              <span style={{ color: quorumMet ? C.yea : C.nay, fontWeight: 600 }}>{quorumMet ? 'Quorum met' : 'No quorum'} · need {threshold}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
