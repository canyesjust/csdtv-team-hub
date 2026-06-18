'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { resolveCurrentAgendaItem } from '@/lib/board-meetings/control-meeting-cache'
import MotionInline from './MotionInline'
import ConsoleQR from './ConsoleQR'
import PreshowMode from './PreshowMode'
import BoardPreview from './BoardPreview'
import ConsoleLowerThirdOther from './ConsoleLowerThirdOther'
import { playBell, type BellChoice } from '@/lib/play-bell'
import type { ControlBundle, LowerThirdPerson } from '@/lib/board-meetings/types'

type AttStatus = 'present' | 'remote' | 'absent'

type Props = {
  productionId: string
  bundle: ControlBundle
  canControl: boolean
  busy: boolean
  onAction: (action: string, body?: unknown) => Promise<void>
  onSetAttendance?: (personId: string, status: AttStatus) => void | Promise<void>
  onConfirmAttendance?: () => void | Promise<void>
  onMarkStreamStarted?: (clear: boolean) => void | Promise<void>
  onPatchAgendaItem?: (itemId: string, patch: Partial<ControlBundle['agenda_items'][number]>) => void | Promise<void>
  onReorderAgenda?: (orderedBroadcastableIds: string[]) => void | Promise<void>
  onListeningChange?: (channelId: string, enabled: boolean) => void | Promise<void>
  onPullFromConsent?: (consentItemId: string, itemNumber: string) => void | Promise<void>
}

const C = {
  bg: '#0a0f1a', panel: '#111a2b', panel2: '#16223a',
  line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)',
  text: '#eaf1fb', soft: '#9fb2d0', dim: '#8a9cbb',
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

/** Isolated so the elapsed clock ticking each second doesn't re-render the whole console. */
function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600 }}>{fmtElapsed(nowMs - new Date(startedAt).getTime())}</span>
}

/** Inline live countdown for the operator: ticks locally, with a colour-staged progress bar. */
function LiveCountdown({ startedAt, durationSeconds }: { startedAt: string; durationSeconds: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const remaining = durationSeconds - (nowMs - new Date(startedAt).getTime()) / 1000
  const isUp = remaining <= 0
  const rc = Math.max(0, remaining)
  const pct = durationSeconds > 0 ? Math.max(0, Math.min(1, rc / durationSeconds)) : 0
  const color = isUp || rc <= 15 ? '#f87171' : rc <= 30 ? '#fbbf24' : '#34d399'
  return (
    <div>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isUp ? '#f87171' : '#eaf1fb' }}>
        {fmtElapsed(rc * 1000)}{isUp ? ' · time up' : ''}
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.12)', overflow: 'hidden', marginTop: 8 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .25s linear' }} />
      </div>
    </div>
  )
}

export default function ConsoleView({ productionId, bundle, canControl, busy, onAction, onSetAttendance, onConfirmAttendance, onMarkStreamStarted, onPatchAgendaItem, onReorderAgenda, onListeningChange, onPullFromConsent }: Props) {
  const bs = bundle.broadcast_state
  const status = bs?.status || bundle.board_meeting.broadcast_status || 'draft'
  const isLive = status === 'live'
  const isPrepared = status === 'prepared'
  const mode = bs?.mode || 'normal'
  const onBreak = isLive && mode === 'recess'
  // The view is PURELY manual — it never changes on its own. No status change,
  // poll, or background reload can flip it. Only the operator's buttons switch it.
  // Default is the agenda/live console; pre-show is opt-in. This permanently stops
  // clicking an agenda item / go-live from bouncing back to the pre-show screen.
  const [view, setView] = useState<'preshow' | 'live'>('live')
  const isPreshow = view === 'preshow'
  const elapsedStartedAt = bs?.elapsed_started_at ?? null
  const [attOpen, setAttOpen] = useState(false)
  const [editAgenda, setEditAgenda] = useState(false)
  const [showPreviews, setShowPreviews] = useState(false)
  const [showBackupChannels, setShowBackupChannels] = useState(false)
  const dragId = useRef<string | null>(null)

  // Auto-scroll the agenda list so the current live item sits near the top — the
  // operator shouldn't have to scroll down to find what's on air.
  const agendaScrollRef = useRef<HTMLDivElement | null>(null)
  const liveItemRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const c = agendaScrollRef.current
    const el = liveItemRef.current
    if (!c || !el) return
    c.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: 'smooth' })
  }, [bs?.current_agenda_item_id, editAgenda])

  // Ring a bell on the operator console exactly when the active timer hits zero.
  const bellRef = useRef<{ choice: BellChoice; customUrl: string | null }>({ choice: 'classic', customUrl: null })
  useEffect(() => {
    fetch('/api/board/bell').then(r => r.json()).then(d => { bellRef.current = { choice: d.choice, customUrl: d.custom_url } }).catch(() => {})
  }, [])
  const at = bundle.active_timer as { started_at?: string | null; duration_seconds?: number | null; ended_at?: string | null } | null
  const atStarted = at?.started_at ?? null
  const atDuration = at?.duration_seconds ?? null
  const atEnded = at?.ended_at ?? null
  useEffect(() => {
    if (!atStarted || !atDuration || atEnded) return
    const delay = new Date(atStarted).getTime() + atDuration * 1000 - Date.now()
    if (delay <= 0) return // already elapsed (e.g. page reload after it ended) — don't ring
    const id = setTimeout(() => playBell(bellRef.current), delay)
    return () => clearTimeout(id)
  }, [atStarted, atDuration, atEnded])

  const [timerMin, setTimerMin] = useState(3)
  const [timerOpen, setTimerOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // Lower-third picker: compact summary by default, expand to the full name list.
  const [ltExpanded, setLtExpanded] = useState(false)
  // Dismissible per-phase "next step" guidance for newer operators.
  const [hintOpen, setHintOpen] = useState(true)

  // End-meeting checklist — a deliberate stop so screens/outputs are never left on.
  const [endOpen, setEndOpen] = useState(false)
  const [ckYouTube, setCkYouTube] = useState(false)
  const [ckRecording, setCkRecording] = useState(false)
  const [ending, setEnding] = useState(false)
  const confirmEnd = async () => {
    setEnding(true)
    try {
      await onAction('end-meeting')
      setEndOpen(false)
      setCkYouTube(false)
      setCkRecording(false)
    } finally {
      setEnding(false)
    }
  }

  const handleAgendaDrop = (targetId: string) => {
    const from = dragId.current
    dragId.current = null
    if (!from || from === targetId || !onReorderAgenda) return
    const ids = bundle.agenda_items.filter(i => i.is_broadcastable).map(i => i.id)
    const fromIdx = ids.indexOf(from), toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0])
    void onReorderAgenda(ids)
  }

  const currentItem = resolveCurrentAgendaItem(bundle.agenda_items, bs?.current_agenda_item_id, bundle.current_agenda_item)
  const currentSort = currentItem ? currentItem.sort_order : -1
  const onAirLabel = currentItem
    ? (currentItem.consent_block ? 'Consent Agenda' : `Item ${currentItem.item_number} — ${currentItem.title}`)
    : null
  // The timer only belongs on items that are actually timed — patron/public
  // comments, board/staff/superintendent reports, recognitions, hearings — or
  // whenever a timer is already running. It stays hidden everywhere else.
  const timedItem = !!currentItem && /\b(comment|comments|report|reports|recognition|public input|hearing|testimony)\b/i.test(`${currentItem.title} ${currentItem.type ?? ''}`)
  const isActionItem = !!currentItem && (currentItem.type === 'action' || currentItem.action_requested)

  // Plain-language "what to do next" for the current phase. Sentence continues
  // after "Next step — " so it starts lower-case.
  const hintText = !isLive ? null
    : !currentItem ? 'nothing is on air yet. Click an agenda item on the left to put it on screen.'
    : isActionItem ? 'this is an action item. In the Motion box set who moved and who seconded, then open the vote. After it passes or fails, show the result, then go to the next item.'
    : timedItem ? 'someone is speaking. Pick the speaker’s name below to show their lower third, and add a timer to keep them on time.'
    : 'pick a name below to show a lower third when someone speaks. Click “Next item” when the board moves on.'

  // The picker defaults open on talk items (its the main tool there) and collapsed
  // on action items (where the motion is the focus). The operator can still toggle.
  const ltAutoKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${currentItem?.id ?? 'none'}:${isActionItem ? 'a' : 't'}`
    if (ltAutoKeyRef.current === key) return
    ltAutoKeyRef.current = key
    setLtExpanded(!isActionItem)
  }, [currentItem?.id, isActionItem])

  const sections = useMemo(() => {
    const map = new Map<number, { title: string; number: number; items: ControlBundle['agenda_items'] }>()
    for (const it of bundle.agenda_items) {
      if (!map.has(it.section_number)) map.set(it.section_number, { title: it.section_title, number: it.section_number, items: [] })
      map.get(it.section_number)!.items.push(it)
    }
    return [...map.values()].sort((a, b) => a.number - b.number)
  }, [bundle.agenda_items])

  const people = bundle.lower_third_people || []
  const agendaPeople = bundle.agenda_people || []
  // Group curated people by their Group label (falling back to board/staff/other).
  const groupedPeople: [string, LowerThirdPerson[]][] = (() => {
    const map = new Map<string, LowerThirdPerson[]>()
    for (const p of people) {
      const key = p.group_label?.trim() || (p.category === 'board_member' ? 'Board' : p.category === 'staff' ? 'Staff' : 'Other')
      const arr = map.get(key)
      if (arr) arr.push(p)
      else map.set(key, [p])
    }
    const rank = (k: string) => (k === 'Board' ? 0 : k === 'Staff' ? 8 : k === 'Other' ? 9 : 1)
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
  })()
  const lowerThirdShownIds = new Set([...people, ...agendaPeople].map(p => p.id))
  const activeLt = bundle.lower_third_active
  const position = bs?.lower_third_position ?? 'left'

  // Keep the lower-third panel short: Board + "On this agenda" stay open, but
  // Staff and any other groups start collapsed (operator can expand them).
  const lowerThirdInitRef = useRef(false)
  useEffect(() => {
    if (lowerThirdInitRef.current || groupedPeople.length === 0) return
    lowerThirdInitRef.current = true
    const nonBoard = groupedPeople.map(([l]) => l).filter(l => l !== 'Board')
    if (nonBoard.length) setCollapsedGroups(new Set(nonBoard))
  }, [groupedPeople])

  const timer = bundle.active_timer
  const templates = bundle.timer_templates || []
  const playback = bundle.playlist_state?.playback_state || 'idle'
  const hasPlaylist = !!bundle.meeting_playlist
  const hasYoutube = !!bundle.production?.livestream_url
  const hasCurrentDocument = (bundle.current_documents || []).some(d => !!d.source_url)
  const assignedChannelId = bundle.channel_assignments?.[0]?.output_channel_id
  const boardChannel = bundle.channels?.find(c => c.id === assignedChannelId)?.channel_number ?? null
  const activeQR = bs?.active_qr_url
    ? { url: bs.active_qr_url, label: bs.active_qr_label ?? null, startedAt: bs.active_qr_started_at ?? null, durationSeconds: bs.active_qr_duration_seconds ?? null }
    : null

  const att = bundle.attendance
  const presentCount = att?.quorum.present_count ?? 0
  const threshold = att?.quorum.threshold ?? 0
  const quorumMet = att?.quorum.quorum_met ?? false
  const attendanceRecorded = !!bs?.attendance_recorded_at
  const needRoll = !attendanceRecorded && (isLive || isPrepared)

  // Nudge the operator to take attendance once, right at go-live.
  const rollPromptedRef = useRef(false)
  useEffect(() => {
    if (isLive && !attendanceRecorded && !rollPromptedRef.current) {
      rollPromptedRef.current = true
      setAttOpen(true)
    }
  }, [isLive, attendanceRecorded])

  // Click a name to put it on air; click the name that's already on air to clear it.
  const setLt = (p: LowerThirdPerson) => {
    if (activeLt?.person_id === p.id) onAction('clear-lower-third')
    else onAction('set-lower-third', { person_id: p.id, person: p, position })
  }

  // Keyboard shortcuts for the live operator: → next item, ← previous item,
  // C clears the lower third. Ignored while typing in a field or modal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!canControl || !isLive) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      if (e.key === 'ArrowRight') { e.preventDefault(); void onAction('advance') }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); void onAction('go-back') }
      else if ((e.key === 'c' || e.key === 'C') && activeLt) { e.preventDefault(); void onAction('clear-lower-third') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canControl, isLive, activeLt, onAction])

  const chip = (sel: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 12, padding: '7px 11px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${sel ? 'transparent' : C.line2}`, background: sel ? C.accentbg : 'transparent',
    color: sel ? '#bcdcff' : C.text, fontWeight: sel ? 600 : 400,
  })
  const toggleGroup = (k: string) => setCollapsedGroups(s => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const groupBlock = (label: string, members: LowerThirdPerson[], accent = false) => {
    if (members.length === 0) return null
    const collapsed = collapsedGroups.has(label)
    return (
      <div key={label} style={{ marginBottom: 8 }}>
        <button type="button" onClick={() => toggleGroup(label)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', font: 'inherit', textAlign: 'left' }}>
          <span style={{ fontSize: 11, color: C.dim, width: 8 }}>{collapsed ? '▸' : '▾'}</span>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: accent ? '#bcdcff' : C.dim, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 11, color: C.dim }}>· {members.length}</span>
        </button>
        {!collapsed && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {members.map(p => (
              <button key={p.id} style={chip(activeLt?.person_id === p.id)} disabled={!canControl} onClick={() => setLt(p)}>{p.display_name}</button>
            ))}
          </div>
        )}
      </div>
    )
  }
  const editChip = (on: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 11, padding: '4px 9px', borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${on ? 'transparent' : C.line2}`, background: on ? C.amberbg : 'transparent',
    color: on ? '#fde3a7' : C.soft,
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

  // ── Center-stage cards (ordered motion-first on action items, lower-third-first
  //    on talk items). Defined here so the render stays readable. ──────────────
  const timerCard = (timer || timedItem) ? (
    <div style={cardStyle}>
      <h3 style={{ ...h3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Timer</span>
        {!timer && !timerOpen && <button style={{ ...btn, fontSize: 11, padding: '4px 9px' }} disabled={!canControl} onClick={() => setTimerOpen(true)}>+ Set a timer</button>}
      </h3>
      {timer && atStarted && atDuration ? (
        <>
          <div style={{ fontSize: 12, color: C.soft, marginBottom: 6 }}>{timer.label || 'Timer'}</div>
          <LiveCountdown startedAt={atStarted} durationSeconds={atDuration} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={{ ...btn, flex: 1 }} disabled={!canControl} onClick={() => onAction('end-timer')}>Done</button>
            <button style={btn} disabled={!canControl} onClick={() => onAction('cancel-timer')}>Cancel</button>
          </div>
        </>
      ) : timerOpen ? (
        <>
          <div style={{ fontSize: 12, color: C.soft, marginBottom: 8, lineHeight: 1.5 }}>
            How long for <b style={{ color: C.text }}>{currentItem ? (currentItem.consent_block ? 'Consent Agenda' : `Item ${currentItem.item_number}`) : 'this item'}</b>? Counts down on the dais and rings when it ends.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {[2, 3, 5, 10].map(m => (
              <button key={m} style={{ ...btn, fontSize: 12, padding: '6px 11px' }} disabled={!canControl} onClick={() => { void onAction('start-timer', { duration_seconds: m * 60, label: currentItem?.title || 'Timer', show_on_dais: true }); setTimerOpen(false) }}>{m} min</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <input type="number" min={1} max={120} value={timerMin} onChange={e => setTimerMin(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} style={{ width: 54, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 7, color: C.text, fontSize: 13, padding: '5px 7px', fontFamily: 'inherit' }} />
            <span style={{ fontSize: 12, color: C.soft }}>min</span>
            <button style={{ ...btn, fontSize: 12, padding: '6px 11px', background: C.accent, color: '#06101f', border: 'none', fontWeight: 600 }} disabled={!canControl} onClick={() => { void onAction('start-timer', { duration_seconds: timerMin * 60, label: currentItem?.title || 'Timer', show_on_dais: true }); setTimerOpen(false) }}>Start + bell</button>
            <button style={{ ...btn, fontSize: 12, padding: '6px 11px' }} onClick={() => setTimerOpen(false)}>Cancel</button>
          </div>
          {templates.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {templates.map(t => (
                <button key={t.id} style={{ ...btn, fontSize: 11, padding: '5px 9px' }} disabled={!canControl} onClick={() => { void onAction('start-timer', { template_id: t.id }); setTimerOpen(false) }}>{t.name}</button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: C.dim }}>No timer running. Use “Set a timer” for patron comments, reports, or any timed item.</div>
      )}
    </div>
  ) : null

  const lowerThirdCard = (
    <div style={cardStyle}>
      <h3 style={{ ...h3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Lower third{!isActionItem ? ' · who’s speaking' : ''}</span>
        <button style={{ ...btn, fontSize: 11, padding: '4px 9px' }} onClick={() => setLtExpanded(v => !v)}>{ltExpanded ? 'Done' : (activeLt ? 'Change ▾' : 'Choose ▾')}</button>
      </h3>
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', marginBottom: ltExpanded ? 12 : 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 9, background: activeLt ? C.livebg : C.panel2, border: `1px solid ${activeLt ? 'rgba(255,93,93,.35)' : C.line}` }}>
          {activeLt ? (
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#ffb3b3' }}>● ON AIR</span>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{activeLt.display_name}</div>
              {activeLt.primary_title && <div style={{ fontSize: 11, color: C.soft }}>{activeLt.primary_title}</div>}
            </div>
          ) : <div style={{ fontSize: 13, color: C.dim }}>No lower third on air</div>}
          {activeLt && <button style={{ ...btn, color: '#ffc4c4', borderColor: 'rgba(255,93,93,.4)' }} disabled={!canControl} onClick={() => onAction('clear-lower-third')}>Clear</button>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 96 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: C.dim, fontWeight: 600 }}>Position</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['left', 'center', 'right'] as const).map(pos => (
              <button key={pos} style={{ ...chip(position === pos), flex: 1, textAlign: 'center', padding: '6px 0' }} disabled={!canControl} onClick={() => onAction('set-lower-third-position', { position: pos })}>{pos[0].toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>
      {ltExpanded && (
        <>
          {groupedPeople.filter(([l]) => l === 'Board').map(([label, members]) => groupBlock(label, members))}
          {groupBlock('On this agenda', agendaPeople, true)}
          {groupedPeople.filter(([l]) => l !== 'Board').map(([label, members]) => groupBlock(label, members))}
          <ConsoleLowerThirdOther
            excludeIds={lowerThirdShownIds}
            activeId={activeLt?.person_id ?? null}
            canControl={canControl}
            onPick={setLt}
          />
        </>
      )}
    </div>
  )

  const motionCard = (
    <div style={{ ...cardStyle, ...(isActionItem ? { borderColor: 'rgba(79,157,238,.45)' } : {}) }}>
      <h3 style={{ ...h3, display: 'flex', justifyContent: 'space-between' }}>
        <span>{isActionItem ? 'Motion · live on screen' : 'Motion'}</span>
        <Link href={`/control/${productionId}/motion`} target="_blank" style={{ fontSize: 11, color: C.accent, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Pop out ↗</Link>
      </h3>
      {isActionItem
        ? <MotionInline productionId={productionId} />
        : <div style={{ fontSize: 13, color: C.soft, lineHeight: 1.5 }}>No action item on air. Take an action item to run a motion.</div>}
    </div>
  )

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#05080f', color: C.text, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', margin: 12 }}>
        {/* TOP BAR */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '12px 18px', borderBottom: `1px solid ${C.line}`, background: '#0c1220' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{bundle.meeting?.title || 'Board Meeting'}</div>
            <div style={{ fontSize: 12, color: C.dim, display: 'flex', gap: 12 }}>
              <Link href="/dashboard/board-meetings" style={{ color: C.dim }}>← Board Meetings</Link>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {onBreak ? (
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fde3a7', background: C.amberbg, padding: '6px 13px', borderRadius: 999 }}>ON BREAK</span>
            ) : isLive ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#ffb3b3', background: C.livebg, padding: '6px 13px', borderRadius: 999 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.live, display: 'inline-block' }} /> ON AIR
              </span>
            ) : <span style={{ fontWeight: 700, fontSize: 13, color: '#fde3a7', background: C.amberbg, padding: '6px 13px', borderRadius: 999 }}>PRE-SHOW</span>}
            {elapsedStartedAt && <ElapsedClock startedAt={elapsedStartedAt} />}
            {isLive && (
              <button
                onClick={() => onAction('reset-elapsed')}
                disabled={!canControl}
                title="Restart the elapsed clock from now"
                style={{ font: 'inherit', fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.line2}`, background: 'transparent', color: C.soft, cursor: 'pointer' }}
              >
                {elapsedStartedAt ? 'Reset clock' : 'Start clock'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', border: `1px solid ${C.line2}`, borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setView('preshow')} style={{ font: 'inherit', fontSize: 12, padding: '6px 11px', border: 'none', cursor: 'pointer', background: isPreshow ? C.accentbg : 'transparent', color: isPreshow ? '#bcdcff' : C.soft, fontWeight: isPreshow ? 600 : 400 }}>Pre-show</button>
              <button onClick={() => setView('live')} style={{ font: 'inherit', fontSize: 12, padding: '6px 11px', border: 'none', borderLeft: `1px solid ${C.line}`, cursor: 'pointer', background: !isPreshow ? C.accentbg : 'transparent', color: !isPreshow ? '#bcdcff' : C.soft, fontWeight: !isPreshow ? 600 : 400 }}>Agenda / live</button>
            </div>
            <button
              onClick={() => setAttOpen(true)}
              title={needRoll ? 'Roll has not been taken yet — click to take attendance' : undefined}
              style={{
                font: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999,
                border: needRoll ? '1px solid #f5b53f' : 'none',
                color: needRoll ? '#1a1305' : quorumMet ? '#b7f0d8' : '#ffc4c4',
                background: needRoll ? '#f5b53f' : quorumMet ? C.yeabg : C.naybg,
              }}
            >
              {needRoll ? '⚠ Take attendance ▾' : `Attendance ${presentCount} / ${att?.records.length ?? 0} ✓`}
            </button>
            {isLive && <button onClick={() => setEndOpen(true)} disabled={!canControl} style={{ ...btn, color: '#ffc4c4', borderColor: 'rgba(255,93,93,.4)' }}>End meeting</button>}
          </div>
        </div>

        {endOpen && (
          <div
            onClick={() => !ending && setEndOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,6,12,.66)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', background: C.panel, border: `1px solid ${C.line2}`, borderRadius: 14, padding: 22, color: C.text }}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>End the meeting?</div>
              <div style={{ fontSize: 13, color: C.soft, lineHeight: 1.5, marginBottom: 16 }}>
                Before ending, confirm these — the hub can&apos;t do them for you:
              </div>

              {[
                ['ck-yt', ckYouTube, setCkYouTube, 'I stopped the YouTube livestream in YouTube Studio.'],
                ['ck-rec', ckRecording, setCkRecording, 'The recording is saved / stopped.'],
              ].map(([key, checked, set, label]) => {
                const isChecked = checked as boolean
                const setter = set as (v: boolean) => void
                return (
                  <label key={key as string} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px', marginBottom: 8, borderRadius: 9, border: `1px solid ${isChecked ? 'rgba(52,211,153,.4)' : C.line2}`, background: isChecked ? C.yeabg : 'transparent', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isChecked} onChange={e => setter(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: C.yea, cursor: 'pointer' }} />
                    <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{label as string}</span>
                  </label>
                )
              })}

              <div style={{ fontSize: 12, color: C.soft, lineHeight: 1.55, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px', marginTop: 4, marginBottom: 18 }}>
                When you confirm, the hub will automatically:
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>Return the district screens to normal signage</li>
                  <li>Stop the dais &amp; overlay from listening</li>
                  <li>Clear any timer, motion, or vote graphic</li>
                  <li>Archive the meeting</li>
                </ul>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setEndOpen(false)} disabled={ending} style={{ ...btn }}>Cancel</button>
                <button
                  onClick={() => void confirmEnd()}
                  disabled={ending || !ckYouTube || !ckRecording}
                  style={{ ...btn, background: (ckYouTube && ckRecording) ? C.live : 'transparent', color: (ckYouTube && ckRecording) ? '#fff' : '#7d8ba3', border: 'none', fontWeight: 700, cursor: (ckYouTube && ckRecording && !ending) ? 'pointer' : 'not-allowed' }}
                >
                  {ending ? 'Ending…' : 'End meeting'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!canControl && (
          <p style={{ margin: 0, padding: '10px 18px', background: C.amberbg, color: '#fde3a7', fontSize: 13 }}>Lock the agenda before using broadcast controls.</p>
        )}

        {/* BODY — Pre-show before gavel / on break, Live otherwise */}
        {isPreshow ? (
          <PreshowMode productionId={productionId} bundle={bundle} canControl={canControl} busy={busy} onAction={onAction} onMarkStreamStarted={onMarkStreamStarted} onLeavePreshow={() => setView('live')} />
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr) 340px' }}>
          {/* AGENDA */}
          <div style={{ padding: 14, minHeight: 600 }}>
            <div style={{ ...h3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Agenda</span>
              {canControl && (onPatchAgendaItem || onReorderAgenda) && (
                <button style={{ ...btn, fontSize: 11, padding: '4px 9px', ...(editAgenda ? { background: C.accentbg, color: '#bcdcff', borderColor: 'transparent' } : {}) }} onClick={() => setEditAgenda(v => !v)}>{editAgenda ? 'Done' : 'Edit'}</button>
              )}
            </div>
            {editAgenda && <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, lineHeight: 1.4 }}>Drag on-air items to reorder. Skip removes from the broadcast; table/postpone marks an item.</div>}
            <div ref={agendaScrollRef} style={{ position: 'relative', maxHeight: 'calc(100vh - 170px)', overflowY: 'auto' }}>
            {isLive && (
              <div style={{ position: 'sticky', top: 0, zIndex: 3, background: C.panel, borderRadius: 8, borderLeft: `3px solid ${C.accent}`, border: `1px solid ${C.line2}`, borderLeftWidth: 3, borderLeftColor: C.accent, padding: '7px 10px', marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#bcdcff', textTransform: 'uppercase' }}>On air now</div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{onAirLabel ?? 'Nothing on air'}</div>
              </div>
            )}
            {sections.map(sec => (
              <div key={sec.number}>
                <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '.06em', margin: '12px 0 5px', fontWeight: 600 }}>{sec.number} · {sec.title}</div>
                {sec.items.map(it => {
                  const live = it.id === bs?.current_agenda_item_id
                  const done = currentSort >= 0 && it.sort_order < currentSort
                  if (editAgenda) {
                    const draggable = it.is_broadcastable && !!onReorderAgenda
                    return (
                      <div key={it.id} draggable={draggable}
                        onDragStart={() => { dragId.current = it.id }}
                        onDragOver={e => { if (draggable) e.preventDefault() }}
                        onDrop={() => handleAgendaDrop(it.id)}
                        style={{ padding: '7px 9px', borderRadius: 9, marginBottom: 3, background: C.panel, border: `1px solid ${C.line}` }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                          {draggable && <span style={{ color: C.dim, cursor: 'grab', fontSize: 13 }}>⠿</span>}
                          <span style={{ fontSize: 12, color: C.dim, fontWeight: 600, minWidth: 26, fontVariantNumeric: 'tabular-nums' }}>{it.item_number}</span>
                          <span style={{ fontSize: 13, flex: 1, opacity: it.is_broadcastable ? 1 : 0.5 }}>{it.title}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                          <button style={editChip(!it.is_broadcastable)} onClick={() => onPatchAgendaItem?.(it.id, { is_broadcastable: !it.is_broadcastable })}>{it.is_broadcastable ? 'Skip' : 'On air'}</button>
                          <button style={editChip(it.live_status === 'tabled')} onClick={() => onPatchAgendaItem?.(it.id, { live_status: it.live_status === 'tabled' ? null : 'tabled' })}>Table</button>
                          <button style={editChip(it.live_status === 'postponed')} onClick={() => onPatchAgendaItem?.(it.id, { live_status: it.live_status === 'postponed' ? null : 'postponed' })}>Postpone</button>
                        </div>
                      </div>
                    )
                  }
                  // Consent agenda: one item that votes as one motion, with each
                  // member listed underneath and a live "pull out" per member.
                  if (it.consent_block && Array.isArray(it.subitems) && it.subitems.length > 0) {
                    const subs = it.subitems
                    return (
                      <div key={it.id} ref={live ? liveItemRef : undefined} style={{ marginBottom: 4, borderRadius: 9, border: `1px solid ${live ? 'rgba(79,157,238,.4)' : C.line}`, background: live ? C.accentbg : C.panel, overflow: 'hidden' }}>
                        <div onClick={() => canControl && onAction('jump-to', { agenda_item_id: it.id })}
                          style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '8px 9px', cursor: canControl ? 'pointer' : 'default' }}>
                          <span style={{ fontSize: 12, color: live ? '#bcdcff' : C.dim, fontWeight: 600, minWidth: 30 }}>{it.item_number}</span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>Consent Agenda
                            <span style={{ fontSize: 11, color: C.amber, background: C.amberbg, padding: '1px 6px', borderRadius: 5, marginLeft: 6 }}>one vote · {subs.length} items</span>
                          </span>
                        </div>
                        <div style={{ borderTop: `1px solid ${C.line}`, padding: '4px 9px 6px' }}>
                          {subs.map(s => (
                            <div key={s.item_number} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                              <span style={{ fontSize: 11, color: C.dim, minWidth: 24, fontVariantNumeric: 'tabular-nums' }}>{s.item_number}</span>
                              <span style={{ fontSize: 12, flex: 1, lineHeight: 1.3 }}>{s.title}</span>
                              {canControl && onPullFromConsent && (
                                <button title="Remove from consent — discuss & vote separately" onClick={e => { e.stopPropagation(); void onPullFromConsent(it.id, s.item_number) }}
                                  style={{ font: 'inherit', fontSize: 11, padding: '2px 7px', borderRadius: 6, border: `1px solid ${C.line2}`, background: 'transparent', color: C.soft, cursor: 'pointer', whiteSpace: 'nowrap' }}>Pull out</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={it.id} ref={live ? liveItemRef : undefined} onClick={() => canControl && onAction('jump-to', { agenda_item_id: it.id })}
                      style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 9px', borderRadius: 9, cursor: canControl ? 'pointer' : 'default', marginBottom: 2, opacity: done || !it.is_broadcastable ? 0.42 : 1, background: live ? C.accentbg : 'transparent', border: `1px solid ${live ? 'rgba(79,157,238,.4)' : 'transparent'}` }}>
                      <span style={{ fontSize: 12, color: live ? '#bcdcff' : C.dim, fontWeight: 600, minWidth: 30, fontVariantNumeric: 'tabular-nums' }}>{it.item_number}</span>
                      <span style={{ fontSize: 13, lineHeight: 1.3 }}>
                        {it.title}
                        {(it.type === 'action' || it.action_requested) && <span style={{ fontSize: 11, color: C.amber, background: C.amberbg, padding: '1px 6px', borderRadius: 5, marginLeft: 6 }}>action</span>}
                        {it.live_status && <span style={{ fontSize: 11, color: C.amber, background: C.amberbg, padding: '1px 6px', borderRadius: 5, marginLeft: 6, textTransform: 'capitalize' }}>{it.live_status}</span>}
                        {!it.is_broadcastable && <span style={{ fontSize: 11, color: C.dim, marginLeft: 6 }}>skipped</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
            </div>
          </div>

          {/* CENTER — live stage */}
          <div style={{ padding: 14, minHeight: 600, borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
              <button style={btn} disabled={!canControl || busy} onClick={() => onAction('go-back')}>◀ Prev</button>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.soft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={onAirLabel ?? undefined}>On air: <b style={{ color: C.text, fontWeight: 600 }}>{currentItem ? (currentItem.consent_block ? 'Consent Agenda' : `Item ${currentItem.item_number}`) : 'Nothing on air'}</b></div>
              <button style={{ ...btn, background: C.accent, color: '#06101f', border: 'none', fontWeight: 600 }} disabled={!canControl || busy} onClick={() => onAction('advance')}>Next item ▶</button>
            </div>

            {isPrepared && canControl && (
              <button onClick={() => onAction('end-preroll')} disabled={busy} style={{ width: '100%', padding: 14, border: 'none', borderRadius: 10, background: C.accent, color: '#06101f', font: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
                Go live (gavel) — starts the official meeting
              </button>
            )}

            {/* NEXT STEP — plain-language guidance, dismissible */}
            {isLive && hintText && (hintOpen ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: C.accentbg, border: '1px solid rgba(79,157,238,.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                <span style={{ color: C.accent, fontSize: 15, lineHeight: 1.3 }}>→</span>
                <div style={{ flex: 1, fontSize: 12.5, color: '#cfe2fb', lineHeight: 1.45 }}><b style={{ color: '#eaf1fb' }}>Next step</b> — {hintText}</div>
                <button onClick={() => setHintOpen(false)} title="Hide tips" style={{ font: 'inherit', background: 'transparent', border: 'none', color: C.soft, cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setHintOpen(true)} style={{ ...btn, fontSize: 11, padding: '4px 9px', marginBottom: 10 }}>Show step help</button>
            ))}

            {isLive && <div style={{ fontSize: 11, color: C.dim, margin: '-2px 0 12px', textAlign: 'center' }}>Keys: <b style={{ color: C.soft }}>←</b> prev · <b style={{ color: C.soft }}>→</b> next · <b style={{ color: C.soft }}>C</b> clear lower third</div>}

            {/* Motion leads on action items; the lower-third picker leads on talk items. */}
            {isActionItem ? (
              <>
                {motionCard}
                {timerCard}
                {lowerThirdCard}
              </>
            ) : (
              <>
                {lowerThirdCard}
                {timerCard}
                {motionCard}
              </>
            )}
          </div>

          {/* RIGHT RAIL */}
          <div style={{ padding: 14, minHeight: 600 }}>
            <div style={{ ...h3 }}>Status</div>

            <div style={cardStyle}>
              <h3 style={{ ...h3, display: 'flex', justifyContent: 'space-between' }}>
                <span>Previews</span>
                <button style={{ ...btn, fontSize: 11, padding: '4px 9px' }} title="Open the program output in a separate window for a second monitor" onClick={() => window.open(`/control/${productionId}/program`, 'board-program', 'width=1280,height=720')}>Pop to Monitor 2 ↗</button>
              </h3>
              {showPreviews ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <BoardPreview channel={boardChannel} view="overlay" label="Overlay (exactly what OBS shows)" />
                  <BoardPreview channel={boardChannel} view="dais" label="Dais display" />
                  <button style={{ ...btn, fontSize: 11, padding: '4px 9px' }} onClick={() => setShowPreviews(false)}>Hide previews</button>
                </div>
              ) : (
                <button style={{ ...btn, width: '100%', fontSize: 12 }} onClick={() => setShowPreviews(true)}>Show on-air + dais previews</button>
              )}
              {(() => {
                const listening = (bundle.channel_assignments || []).length
                if (listening === 0) {
                  return <div style={{ fontSize: 12, color: '#ffc4c4', background: C.naybg, padding: '8px 10px', borderRadius: 8, marginTop: 8, lineHeight: 1.4 }}>
                    No output is assigned — graphics won&apos;t reach the broadcast. Assign a channel in Output channels below.
                  </div>
                }
                return <div style={{ fontSize: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: C.soft }}>{activeLt ? 'Lower third live' : 'No lower third'}</span>
                  <span style={{ color: C.yea, fontWeight: 600 }}>✓ delivering to {listening} output{listening > 1 ? 's' : ''}</span>
                </div>
              })()}
            </div>

            {/* STREAM / CHAPTERS ANCHOR */}
            <div style={cardStyle}>
              <h3 style={h3}>Stream</h3>
              {bundle.board_meeting.stream_started_at ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: C.yea, fontWeight: 600 }}>● Stream live</span>
                    <div style={{ fontSize: 11, color: C.soft, marginTop: 2 }}>
                      since {new Date(bundle.board_meeting.stream_started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · this is video 0:00 for chapters
                    </div>
                  </div>
                  <button style={btn} disabled={!onMarkStreamStarted} title="Reset the chapter 0:00 mark" onClick={() => onMarkStreamStarted?.(true)}>Restart 0:00</button>
                </div>
              ) : (
                <>
                  <button onClick={() => onMarkStreamStarted?.(false)} disabled={!onMarkStreamStarted}
                    style={{ width: '100%', padding: 12, border: 'none', borderRadius: 10, background: C.accent, color: '#06101f', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Stream started
                  </button>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 7, lineHeight: 1.5 }}>
                    Tap when you start the YouTube stream (during preroll, before the gavel). Marks video 0:00 so chapters line up.
                  </div>
                </>
              )}
            </div>

            <div style={{ ...h3, marginTop: 18 }}>On-air controls</div>

            {/* MODES & TIMERS */}
            <div style={cardStyle}>
              <h3 style={h3}>Modes</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <button style={{ ...btn, textAlign: 'center', ...(mode === 'recess' ? { background: C.amberbg, color: '#fde3a7', borderColor: 'transparent' } : {}) }} disabled={!canControl} onClick={() => onAction(mode === 'recess' ? 'clear-mode' : 'recess', mode === 'recess' ? undefined : { message: 'Recess' })}>Recess</button>
                <button style={{ ...btn, textAlign: 'center', ...(mode === 'technical_difficulties' ? { background: C.amberbg, color: '#fde3a7', borderColor: 'transparent' } : {}) }} disabled={!canControl} onClick={() => onAction(mode === 'technical_difficulties' ? 'clear-mode' : 'technical-difficulties')}>Technical difficulties</button>
                <button style={{ ...btn, textAlign: 'center', ...(bs?.overlay_visible === false ? { background: C.naybg, color: '#ffc4c4', borderColor: 'transparent' } : { background: C.yeabg, color: '#b7f0d8', borderColor: 'transparent' }) }} disabled={!canControl} onClick={() => onAction('toggle-overlay')}>Overlay: {bs?.overlay_visible === false ? 'OFF' : 'ON'}</button>
                <button style={{ ...btn, textAlign: 'center' }} disabled={!canControl} onClick={() => onAction('show-agenda-branding')}>Agenda branding</button>
              </div>
              {mode !== 'normal' && <div style={{ fontSize: 12, color: '#fde3a7', marginTop: 8 }}>Mode: {mode.replace(/_/g, ' ')}</div>}
              <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 10, paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: C.soft, marginBottom: 6 }}>
                  Vote result: <b style={{ color: bs?.active_vote_result_motion_id ? '#b7f0d8' : C.text }}>{bs?.active_vote_result_motion_id ? 'ON SCREEN' : 'not showing'}</b>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  <button style={{ ...btn, textAlign: 'center' }} disabled={!canControl} onClick={() => onAction('reshow-result')}>Show last result</button>
                  <button style={{ ...btn, textAlign: 'center' }} disabled={!canControl || !bs?.active_vote_result_motion_id} onClick={() => onAction('dismiss-result')}>Clear from screen</button>
                </div>
              </div>
            </div>

            {/* PRE-ROLL */}
            {hasPlaylist && !isLive && (
              <div style={cardStyle}>
                <h3 style={h3}>Pre-roll playlist</h3>
                <div style={{ fontSize: 12, color: C.soft, marginBottom: 8 }}>Playback: <b style={{ color: C.text }}>{playback}</b></div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {playback === 'idle'
                    ? <button style={{ ...btn, flex: 1 }} disabled={!canControl} onClick={() => onAction('playlist-play')}>Play</button>
                    : playback === 'paused'
                      ? <button style={{ ...btn, flex: 1 }} disabled={!canControl} onClick={() => onAction('playlist-play')}>Resume</button>
                      : <button style={{ ...btn, flex: 1 }} disabled={!canControl} onClick={() => onAction('playlist-pause')}>Pause</button>}
                  <button style={btn} disabled={!canControl || playback === 'idle'} onClick={() => onAction('playlist-back')}>◀</button>
                  <button style={btn} disabled={!canControl || playback === 'idle'} onClick={() => onAction('playlist-skip')}>▶</button>
                  <button style={btn} disabled={!canControl} onClick={() => onAction('playlist-end')}>End</button>
                </div>
              </div>
            )}

            {/* QR PUSH */}
            <div style={cardStyle}>
              <h3 style={h3}>QR to overlay</h3>
              <ConsoleQR
                canControl={canControl}
                publicAgendaUrl={bundle.board_meeting?.public_agenda_url}
                activeQR={activeQR}
                hasCurrentDocument={hasCurrentDocument}
                hasYoutube={hasYoutube}
                onPush={payload => onAction('push-qr', payload)}
                onExtend={seconds => onAction('extend-qr', { additional_seconds: seconds })}
                onDismiss={() => onAction('clear-qr')}
              />
            </div>

            {/* OUTPUT CHANNELS — interactive; backups collapsed */}
            {(() => {
              const channelRow = (ch: ControlBundle['channels'][number]) => {
                const assigned = (bundle.channel_assignments || []).some(a => a.output_channel_id === ch.id)
                const listening = !!ch.obs_polling_enabled
                return (
                  <div key={ch.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 9px', borderRadius: 8, background: C.panel2, border: `1px solid ${C.line}`, marginBottom: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: canControl ? 'pointer' : 'default', flex: 1, minWidth: 0 }}>
                      <input type="checkbox" checked={assigned} disabled={!canControl} onChange={() => onAction('toggle-channel', { output_channel_id: ch.id })} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Ch {ch.channel_number} — {ch.channel_name}</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.soft, cursor: canControl ? 'pointer' : 'default' }} title="OBS browser source polling">
                      <span>listen</span>
                      <input type="checkbox" checked={listening} disabled={!canControl} onChange={() => onListeningChange?.(ch.id, !listening)} />
                    </label>
                  </div>
                )
              }
              const all = bundle.channels || []
              const mains = all.filter(c => !/backup/i.test(c.channel_name))
              const backups = all.filter(c => /backup/i.test(c.channel_name))
              return (
                <div style={cardStyle}>
                  <h3 style={h3}>Output channels</h3>
                  {mains.map(channelRow)}
                  {backups.length > 0 && (
                    <>
                      <button onClick={() => setShowBackupChannels(v => !v)} style={{ ...btn, width: '100%', fontSize: 12, marginTop: 2 }}>
                        {showBackupChannels ? 'Hide' : 'Show'} {backups.length} backup channel{backups.length > 1 ? 's' : ''}
                      </button>
                      {showBackupChannels && <div style={{ marginTop: 6 }}>{backups.map(channelRow)}</div>}
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
        )}
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
            <div style={{ padding: '14px 18px', borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: C.soft }}>{presentCount} present of {att?.records.length ?? 0}</span>
                <span style={{ color: quorumMet ? C.yea : C.nay, fontWeight: 600 }}>{quorumMet ? 'Quorum met' : 'No quorum'} · need {threshold}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {needRoll && onConfirmAttendance && (
                  <button onClick={() => { void onConfirmAttendance() }} disabled={!canControl} style={{ ...btn, background: C.accent, color: '#06101f', border: 'none', fontWeight: 700 }}>Mark attendance taken</button>
                )}
                <button onClick={() => setAttOpen(false)} style={btn}>Done</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
