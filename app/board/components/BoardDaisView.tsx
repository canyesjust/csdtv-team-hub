'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PublicAgendaItem } from '@/lib/board-meetings/public-output-state'
import { useBoardChannelState } from '@/app/board/hooks/useBoardChannelState'
import BoardOutputDebugStrip from '@/app/board/components/BoardOutputDebugStrip'
import { useAgendaItemCache } from '@/app/board/hooks/useAgendaItemCache'
import { useElementFullscreen } from '@/app/board/hooks/useElementFullscreen'
import type { PublicActiveMotion, PublicActiveVoteResult } from '@/lib/board-meetings/motion-types'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'
import { playBell, type BellChoice } from '@/lib/play-bell'
import BoardBrandingSlide from '@/app/board/components/BoardBrandingSlide'
import { BoardBlankFullscreen } from '@/app/board/components/BoardBlankOutput'
import BoardIdleBranding from '@/app/board/components/BoardIdleBranding'
import { AgendaContextStrip, fitMotionText } from '@/app/board/components/MotionFloorGraphics'
import { CANYONS_LOGO_SRC } from '@/app/board/branding-assets'

// Flat broadcast-grade palette — Canyons navy + amber, solid panels, no glass/glow.
const C = {
  bg0: '#102441',
  bg1: '#0c1d38',
  text: '#f4f7fc',
  textSoft: '#9bb0d0',
  textDim: '#7f97bd',
  accent: '#f5b53f',
  accentGlow: 'transparent',
  amber: '#f5b53f',
  amberGlow: 'transparent',
  blue: '#4f9fe0',
  blueGlow: 'transparent',
  purple: '#a78bfa',
  purpleGlow: 'transparent',
  green: '#34d399',
  greenGlow: 'transparent',
  red: '#f06363',
  redGlow: 'transparent',
  glass: '#19315a',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassHi: '#1d3a63',
}

const font = '"SF Pro Display", "Segoe UI", system-ui, -apple-system, sans-serif'
const mono = '"SF Mono", "JetBrains Mono", ui-monospace, monospace'

export default function BoardDaisView({
  channelNumber,
  initialChannelName,
  autoFullscreen = false,
}: {
  channelNumber: number
  initialChannelName?: string
  /** When true (e.g. `?fullscreen=1` in the URL), prompt or enter browser full screen. */
  autoFullscreen?: boolean
}) {
  const wantAutoFullscreen = autoFullscreen
  const { state, debugInfo } = useBoardChannelState(channelNumber, { livePriority: true })
  const seedItems = useMemo(
    () => (state?.current_item ? [state.current_item] : []),
    [state?.current_item],
  )
  const { resolveItem, resolveSummary } = useAgendaItemCache(
    channelNumber,
    !!state?.active,
    seedItems,
    state?.meeting?.production_number,
  )
  const fullscreen = useElementFullscreen()
  const [now, setNow] = useState(() => Date.now())
  const [autoFsPrompt, setAutoFsPrompt] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (wantAutoFullscreen && fullscreen.supported) setAutoFsPrompt(true)
  }, [wantAutoFullscreen, fullscreen.supported])

  // Ring a bell in the room when the active timer reaches zero.
  const bellRef = useRef<{ choice: BellChoice; customUrl: string | null }>({ choice: 'classic', customUrl: null })
  useEffect(() => {
    fetch('/api/board/bell').then(r => r.json()).then(d => { bellRef.current = { choice: d.choice, customUrl: d.custom_url } }).catch(() => {})
  }, [])
  const timerStartedAt = state?.timer?.started_at ?? null
  const timerDuration = state?.timer?.duration_seconds ?? null
  useEffect(() => {
    if (!timerStartedAt || !timerDuration) return
    const delay = new Date(timerStartedAt).getTime() + timerDuration * 1000 - Date.now()
    if (delay <= 0) return
    const id = setTimeout(() => playBell(bellRef.current), delay)
    return () => clearTimeout(id)
  }, [timerStartedAt, timerDuration])

  const elapsed = useMemo(() => {
    if (!state?.elapsed_started_at) return 0
    return Math.max(0, Math.floor((now - new Date(state.elapsed_started_at).getTime()) / 1000))
  }, [state?.elapsed_started_at, now])

  const wallClock = useMemo(
    () => new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    [now],
  )

  const screenNameForIdle = state?.channel_name || initialChannelName || `Channel ${channelNumber}`

  const shellProps = {
    channelNumber,
    fullscreen,
    autoFsPrompt,
    debugInfo,
    pollMs: state?.poll_interval_ms,
    onDismissAutoFsPrompt: () => setAutoFsPrompt(false),
    onEnterFullscreen: async () => {
      const ok = await fullscreen.enter()
      if (ok) setAutoFsPrompt(false)
    },
  }

  if (!state?.active) {
    return (
      <DaisShell {...shellProps}>
        <BoardBlankFullscreen />
      </DaisShell>
    )
  }

  const item = resolveItem(state.current_item)
  const timer = state.timer
  const mode = state.state?.mode
  const brandingHold = !!(state.agenda_branding_hold || state.state?.agenda_branding_hold)
  const voteResult = state.state?.active_vote_result
  const motion = state.state?.active_motion
  const screenName = state.meeting?.title || initialChannelName || `Channel ${channelNumber}`
  // A motion only becomes "official" on the dais once a mover is set (or it's being
  // voted). Until then it's still a SUGGESTED motion — using the live motion text if a
  // draft is open (so control-panel edits show), else the item's saved suggestion.
  const showVote = !!(voteResult && (voteResult.remaining_seconds ?? 0) > 0)
  const showLiveMotion = !showVote && !!motion && (!!motion.moved_by_name || motion.status === 'voting')
  const suggestedMotionText = (motion?.motion_text || item?.suggested_motion_text || '').trim()

  return (
    <DaisShell {...shellProps}>
      <style>{`
        @keyframes dais-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5); }
          50% { opacity: 0.85; box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); }
        }
        @keyframes dais-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes dais-timer-flash {
          0%, 100% { background: #1a0606; }
          50% { background: #7f1d1d; }
        }
      `}</style>

      <div style={inner}>
        <div style={bgGrid} aria-hidden />
        <div style={bgGlow} aria-hidden />

        {timer && timer.show_on_dais && timer.started_at && timer.duration_seconds > 0 && (
          <DaisFullScreenTimer
            startedAt={timer.started_at}
            durationSeconds={timer.duration_seconds}
            label={timer.label}
          />
        )}

        <header style={header}>
          <div style={headerLeft}>
            <img src={CANYONS_LOGO_SRC} alt="Canyons School District" style={headerLogo} />
          </div>
          <div style={headerRight}>
            <span style={livePill}>
              <span style={liveDot} />
              LIVE
            </span>
            <span style={channelTag}>Dais · Ch {channelNumber}</span>
          </div>
        </header>

        <main style={mainGrid}>
          <section style={heroCol}>
            {!brandingHold ? (
              <p style={meetingLabel}>{state.meeting?.title || 'Board meeting'}</p>
            ) : null}

            {mode === 'recess' ? (
              <StatusHero label="Recess" accent={C.accent} />
            ) : mode === 'technical_difficulties' ? (
              <StatusHero label="Technical difficulties" accent={C.red} />
            ) : brandingHold ? (
              <BoardBrandingSlide
                variant="dais"
                screenName={screenName}
                statusLine="Agenda update"
              />
            ) : item ? (
              <div style={nowBlock}>
                <p style={nowLabel}>Now</p>
                {showVote || showLiveMotion ? (
                  <>
                    <AgendaContextStrip item={item} variant="dais" />
                    {showVote ? (
                      <VoteResultCard result={voteResult!} />
                    ) : motion ? (
                      <DaisMotionPanel motion={motion} hero />
                    ) : null}
                  </>
                ) : (
                  <DaisAgendaItemHero item={item} suggestedMotionText={suggestedMotionText} />
                )}

                {(item.documents?.length ?? 0) > 0 && (
                  <div style={docList}>
                    {item.documents.map((d, i) => (
                      <div key={i} style={docRow}>
                        <span style={docIcon}>DOC</span>
                        <span style={docTitle}>{d.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : state.show_channel_ident ? (
              <BoardIdleBranding screenName={screenNameForIdle} variant="fullscreen" statusLine={null} />
            ) : null}
          </section>

          <aside style={sideCol}>
            <GlassCard>
              <p style={cardLabel}>Clock</p>
              <p style={clockBig}>{wallClock}</p>
              <div style={divider} />
              <p style={cardLabel}>Elapsed</p>
              <p style={elapsedBig}>{formatOffsetSeconds(elapsed)}</p>
            </GlassCard>

            {timer && timer.show_on_dais && timer.remaining_seconds > 0 && (
              <GlassCard accent={C.accent}>
                <p style={cardLabel}>Timer</p>
                <p style={timerLabel}>{timer.label}</p>
                <p style={timerBig}>{formatOffsetSeconds(timer.remaining_seconds)}</p>
              </GlassCard>
            )}

            {!brandingHold && state.upcoming_items.length > 0 && (
              <div style={upNextCard}>
                <p style={upNextLabel}>Up next</p>
                <div style={upNextList}>
                  {state.upcoming_items.slice(0, 6).map(u => (
                    <div key={u.id} style={upNextRow}>
                      <span style={upNextNum}>{u.item_number}</span>
                      <span style={upNextTitle}>{u.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </main>

        {state.upcoming_items.length > 0 ? (
          <DaisAgendaPrerenderHost items={state.upcoming_items.slice(0, 3)} resolveSummary={resolveSummary} />
        ) : null}
      </div>
    </DaisShell>
  )
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Renders text at the largest font size (between min and max px) that still fits
 * within maxHeightVh of the viewport and the container width. Re-fits whenever the
 * text or window size changes, so long agenda titles and suggested motions shrink
 * to fit the dais instead of overflowing.
 */
function AutoFitText({
  text,
  baseStyle,
  maxFontPx,
  minFontPx,
  maxHeightVh,
}: {
  text: string
  baseStyle: React.CSSProperties
  maxFontPx: number
  minFontPx: number
  maxHeightVh: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [fontPx, setFontPx] = useState(maxFontPx)

  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      const maxH = (window.innerHeight * maxHeightVh) / 100
      let lo = minFontPx
      let hi = maxFontPx
      let best = minFontPx
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        el.style.fontSize = `${mid}px`
        if (el.scrollHeight <= maxH && el.scrollWidth <= el.clientWidth + 1) {
          best = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      el.style.fontSize = `${best}px`
      setFontPx(best)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [text, maxFontPx, minFontPx, maxHeightVh])

  return (
    <div
      ref={ref}
      style={{
        ...baseStyle,
        fontSize: `${fontPx}px`,
        maxHeight: `${maxHeightVh}vh`,
        overflow: 'hidden',
        // Preserve the line breaks the operator typed so multi-line / itemized
        // motions read as separate lines on the dais instead of one run-on block.
        whiteSpace: 'pre-line',
      }}
    >
      {text}
    </div>
  )
}

function DaisAgendaItemHero({ item, suggestedMotionText }: { item: PublicAgendaItem; suggestedMotionText?: string }) {
  const isAction = !!(item.action_requested || item.type === 'action')
  const motionText = (suggestedMotionText || item.suggested_motion_text || '').trim()
  return (
    <>
      <div style={itemBadgeRow}>
        <span style={itemBadge}>{item.item_number}</span>
        {item.type ? <span style={typePill}>{item.type.replace('_', ' ')}</span> : null}
      </div>
      {/* On an action item the suggested motion is the star, so the title is
          smaller above it. On other items the title is the main thing. Both
          auto-fit so long or short text always fills the space without overflow. */}
      <AutoFitText
        text={item.title}
        baseStyle={itemTitle}
        maxFontPx={isAction ? 30 : 50}
        minFontPx={isAction ? 16 : 20}
        maxHeightVh={isAction ? 15 : 32}
      />
      {item.presenters?.[0] ? (
        <p style={presenterLine}>
          <span style={presenterName}>{item.presenters[0].name}</span>
          {item.presenters[0].title ? (
            <span style={presenterTitle}> · {item.presenters[0].title}</span>
          ) : null}
        </p>
      ) : null}
      {isAction ? (
        <div style={proposedMotionBox}>
          <p style={proposedMotionLabel}>Suggested motion</p>
          {motionText ? (
            <>
              <AutoFitText text={motionText} baseStyle={proposedMotionText} maxFontPx={52} minFontPx={14} maxHeightVh={50} />
              <p style={proposedMotionNote}>Awaiting a motion from the board</p>
            </>
          ) : (
            <div style={{ ...proposedMotionText, fontStyle: 'italic', color: C.textSoft, fontSize: 'clamp(26px, 3.4vw, 44px)' }}>Will accept a motion</div>
          )}
        </div>
      ) : null}
    </>
  )
}

const proposedMotionBox: React.CSSProperties = {
  marginTop: '2.2vh',
  padding: '1.6vh 2vw',
  borderLeft: '0.4vw solid #3b82f6',
  background: 'rgba(59,130,246,0.12)',
  borderRadius: '0 0.5vw 0.5vw 0',
  maxWidth: '80vw',
}
const proposedMotionLabel: React.CSSProperties = {
  margin: '0 0 0.6vh',
  fontSize: '1.3vw',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#93b7eb',
  fontWeight: 700,
}
const proposedMotionText: React.CSSProperties = {
  margin: 0,
  fontSize: '2vw',
  fontWeight: 600,
  lineHeight: 1.3,
  color: '#eaf0fb',
}
const proposedMotionNote: React.CSSProperties = {
  margin: '0.8vh 0 0',
  fontSize: '1.1vw',
  color: '#9fb2d0',
}

/** Off-screen paint so the browser has fonts/layout ready before Advance. */
function DaisAgendaPrerenderHost({
  items,
  resolveSummary,
}: {
  items: { id: string; item_number: string; title: string; type: string }[]
  resolveSummary: ReturnType<typeof useAgendaItemCache>['resolveSummary']
}) {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: -10000,
        top: 0,
        width: 1920,
        visibility: 'hidden',
        pointerEvents: 'none',
        contain: 'strict',
      }}
    >
      {items.map(summary => {
        const item = resolveSummary(summary)
        return (
          <div key={summary.id} style={nowBlock}>
            <p style={nowLabel}>Now</p>
            <DaisAgendaItemHero item={item} />
          </div>
        )
      })}
    </div>
  )
}

function DaisShell({
  channelNumber: _channelNumber,
  children,
  fullscreen,
  autoFsPrompt,
  debugInfo,
  pollMs,
  onDismissAutoFsPrompt,
  onEnterFullscreen,
}: {
  channelNumber: number
  children: React.ReactNode
  fullscreen: ReturnType<typeof useElementFullscreen>
  autoFsPrompt: boolean
  debugInfo: ReturnType<typeof useBoardChannelState>['debugInfo']
  pollMs?: number
  onDismissAutoFsPrompt: () => void
  onEnterFullscreen: () => void | Promise<void>
}) {
  const { isFullscreen, supported, toggle, setContainer } = fullscreen

  // The full-screen toggle is an operator control, not part of the broadcast — so
  // it auto-hides when idle (it was sitting on top of the LIVE pill and title).
  // It reappears on mouse movement when the operator actually needs it.
  const [controlsVisible, setControlsVisible] = useState(true)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const show = () => {
      setControlsVisible(true)
      clearTimeout(timer)
      timer = setTimeout(() => setControlsVisible(false), 3000)
    }
    show()
    window.addEventListener('mousemove', show)
    window.addEventListener('touchstart', show)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', show)
      window.removeEventListener('touchstart', show)
    }
  }, [])

  return (
    <div
      ref={setContainer}
      style={{
        ...shell,
        minHeight: isFullscreen ? '100dvh' : shell.minHeight,
      }}
    >
      {autoFsPrompt && supported && !isFullscreen ? (
        <div style={autoFsBanner} role="status">
          <p style={autoFsBannerText}>Tap below for full-screen display on this monitor.</p>
          <div style={autoFsBannerActions}>
            <button type="button" onClick={() => void onEnterFullscreen()} style={autoFsBannerPrimary}>
              Enter full screen
            </button>
            <button type="button" onClick={onDismissAutoFsPrompt} style={autoFsBannerGhost}>
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {supported ? (
        <button
          type="button"
          onClick={() => void toggle()}
          style={{
            ...fullscreenBtn,
            ...(isFullscreen ? fullscreenBtnActive : {}),
            opacity: controlsVisible ? 1 : 0,
            pointerEvents: controlsVisible ? 'auto' : 'none',
            transition: 'opacity 0.4s ease',
          }}
          aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
        >
          {isFullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      ) : null}

      {children}
      {debugInfo ? <BoardOutputDebugStrip info={debugInfo} pollMs={pollMs} /> : null}
    </div>
  )
}

/**
 * Full-screen countdown that takes over the whole dais when a timer is running.
 * Counts down locally (every ~120ms) from started_at + duration so it stays
 * smooth and accurate without waiting on the server. The progress bar runs green,
 * turns amber at 30s, red at 15s, and the whole screen flashes red once time is up
 * (until the operator ends the timer from the console).
 */
function DaisFullScreenTimer({ startedAt, durationSeconds, label }: { startedAt: string; durationSeconds: number; label: string }) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 120)
    return () => clearInterval(id)
  }, [])
  const remaining = durationSeconds - (nowMs - new Date(startedAt).getTime()) / 1000
  const isUp = remaining <= 0
  const remainingClamped = Math.max(0, remaining)
  const pct = durationSeconds > 0 ? Math.max(0, Math.min(1, remainingClamped / durationSeconds)) : 0
  const barColor = isUp || remainingClamped <= 15 ? C.red : remainingClamped <= 30 ? C.amber : C.green

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4vh',
        background: isUp ? '#1a0606' : C.bg0,
        animation: isUp ? 'dais-timer-flash 0.9s steps(1, end) infinite' : undefined,
      }}
    >
      {/* Keep the district branding on screen even while the timer is up. */}
      <img src={CANYONS_LOGO_SRC} alt="Canyons School District" style={{ position: 'absolute', top: '28px', left: '36px', height: '40px', width: 'auto', objectFit: 'contain', opacity: 0.95 }} />
      {label && (
        <div style={{ fontFamily: font, fontSize: 'min(6vh, 4vw)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: isUp ? '#fecaca' : C.textSoft }}>
          {label}
        </div>
      )}
      <div style={{ fontFamily: mono, fontSize: 'min(32vh, 20vw)', fontWeight: 700, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums', color: isUp ? '#ffffff' : barColor }}>
        {formatOffsetSeconds(Math.ceil(remainingClamped))}
      </div>
      <div style={{ width: '74vw', height: '1.8vh', borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 999, transition: 'width 0.12s linear' }} />
      </div>
    </div>
  )
}

function GlassCard({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        padding: '18px 20px',
        borderRadius: '10px',
        background: C.glass,
        border: `1px solid ${accent ? `${accent}66` : C.glassBorder}`,
      }}
    >
      {children}
    </div>
  )
}

function StatusHero({ label, accent }: { label: string; accent: string }) {
  return (
    <div
      style={{
        marginTop: '24px',
        padding: '32px 28px',
        borderRadius: '10px',
        background: C.glass,
        borderLeft: `4px solid ${accent}`,
        border: `1px solid ${C.glassBorder}`,
        borderLeftWidth: '4px',
        borderLeftColor: accent,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text }}>
        {label}
      </h1>
    </div>
  )
}

const VOTE_DISPLAY: Record<string, { label: string; color: string }> = {
  yea: { label: 'Aye', color: C.green },
  nay: { label: 'Nay', color: C.red },
  abstain: { label: 'Abstain', color: C.amber },
  absent: { label: 'Absent', color: C.textDim },
  recused: { label: 'Recused', color: C.textDim },
}

function LiveVoteRoster({ votes }: { votes: { person_name: string; vote: string | null }[] }) {
  return (
    <div
      style={{
        marginTop: '14px',
        paddingTop: '12px',
        borderTop: `1px solid ${C.glassBorder}`,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '2px 24px',
      }}
    >
      {votes.map((v, i) => {
        const pending = v.vote === null
        const absent = v.vote === 'absent' || v.vote === 'recused'
        const dimmed = pending || absent
        const d = v.vote ? VOTE_DISPLAY[v.vote] ?? { label: v.vote, color: C.textSoft } : { label: 'Pending', color: C.amber }
        return (
          <div
            key={`${v.person_name}-${i}`}
            style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '3px 0', opacity: absent ? 0.55 : 1 }}
          >
            <span style={{ fontSize: '16px', color: dimmed ? C.textDim : C.text }}>{v.person_name}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: d.color }}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function VoteResultCard({ result }: { result: PublicActiveVoteResult }) {
  const passed = result.result === 'passed'
  const accent = passed ? C.green : C.red
  const members = [...(result.votes ?? [])].sort((a, b) => a.person_name.localeCompare(b.person_name))
  return (
    <div
      style={{
        marginTop: '24px',
        padding: '22px 26px',
        borderRadius: '10px',
        background: C.glass,
        border: `1px solid ${C.glassBorder}`,
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>
        {passed ? 'Motion passed' : 'Motion failed'} · {result.tally.yea}–{result.tally.nay}
      </p>
      <AutoFitText
        text={result.motion_text}
        baseStyle={{ margin: '0 0 18px', fontWeight: 500, color: C.text, lineHeight: 1.4, letterSpacing: '-0.01em', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        maxFontPx={26}
        minFontPx={11}
        maxHeightVh={24}
      />
      {members.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2px 24px', borderTop: `1px solid ${C.glassBorder}`, paddingTop: '12px' }}>
          {members.map((v, i) => {
            const d = VOTE_DISPLAY[v.vote] ?? { label: v.vote, color: C.textSoft }
            const dimmed = v.vote === 'absent' || v.vote === 'recused'
            return (
              <div key={`${v.person_name}-${i}`} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '3px 0', opacity: dimmed ? 0.55 : 1 }}>
                <span style={{ fontSize: '16px', color: dimmed ? C.textDim : C.text }}>{v.person_name}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: d.color }}>{d.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DaisMotionPanel({ motion, hero = false }: { motion: PublicActiveMotion; hero?: boolean }) {
  const isVoting = motion.status === 'voting'
  const hasMover = !!motion.moved_by_name
  const hasSeconder = !!motion.seconded_by_name
  const text = fitMotionText(motion)
  const motionBase: React.CSSProperties = {
    margin: '0 0 6px',
    fontWeight: hero ? 600 : 500,
    color: C.text,
    lineHeight: 1.4,
    letterSpacing: '-0.01em',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  }
  // During voting the live roster also needs room, so the motion gets less height
  // (and shrinks smaller) than when it's on the floor alone. Low min font ensures
  // even a very long, multi-clause motion still fits fully on screen.
  const motionMaxVh = isVoting ? 34 : hero ? 54 : 40
  const motionFit = text ? (
    <AutoFitText
      text={text}
      baseStyle={motionBase}
      maxFontPx={hero ? 34 : 26}
      minFontPx={11}
      maxHeightVh={motionMaxVh}
    />
  ) : null

  if (isVoting) {
    return (
      <MotionCard
        label="Voting open"
        accent={C.purple}
        hero={hero}
      >
        {motionFit}
        {hasMover && hasSeconder && (
          <p style={motionMeta}>
            <span style={metaHighlight}>{motion.moved_by_name}</span>
            <span style={metaDim}> seconded by </span>
            <span style={metaHighlight}>{motion.seconded_by_name}</span>
          </p>
        )}
        {motion.live_votes && motion.live_votes.length > 0 && (
          <LiveVoteRoster votes={motion.live_votes} />
        )}
      </MotionCard>
    )
  }

  if (!hasMover) {
    return (
      <MotionCard label="Motion in progress" accent={C.amber}>
        <p style={formingText}>A motion is being made</p>
      </MotionCard>
    )
  }

  if (!hasSeconder) {
    return (
      <MotionCard label="On the floor" accent={C.amber} hero={hero}>
        {motionFit}
        <p style={motionMeta}>
          <span style={metaDim}>Moved by </span>
          <span style={metaHighlight}>{motion.moved_by_name}</span>
        </p>
        <p style={awaitingSecond}>Awaiting second</p>
      </MotionCard>
    )
  }

  return (
    <MotionCard label="On the floor" accent={C.amber} hero={hero}>
      {motionFit}
      <p style={motionMeta}>
        <span style={metaHighlight}>{motion.moved_by_name}</span>
        <span style={metaDim}> · seconded by </span>
        <span style={metaHighlight}>{motion.seconded_by_name}</span>
      </p>
    </MotionCard>
  )
}

function MotionCard({
  label,
  accent,
  children,
  hero,
}: {
  label: string
  accent: string
  children: React.ReactNode
  hero?: boolean
}) {
  return (
    <div
      style={{
        marginTop: hero ? '8px' : '24px',
        padding: hero ? '26px 28px' : '22px 26px',
        borderRadius: '10px',
        position: 'relative',
        background: C.glass,
        border: `1px solid ${C.glassBorder}`,
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <p style={{ margin: '0 0 14px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent }}>
        {label}
      </p>
      {children}
    </div>
  )
}

const shell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: C.bg0,
  color: C.text,
  fontFamily: font,
  padding: '28px 36px 36px',
  boxSizing: 'border-box',
  position: 'relative',
  overflow: 'hidden',
}

const inner: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
}

const fullscreenBtn: React.CSSProperties = {
  position: 'absolute',
  bottom: 20,
  right: 20,
  zIndex: 60,
  padding: '10px 18px',
  borderRadius: '10px',
  border: `1px solid ${C.glassBorder}`,
  background: C.glassHi,
  color: C.accent,
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '0.02em',
}

const fullscreenBtnActive: React.CSSProperties = {
  background: 'rgba(56, 189, 248, 0.15)',
  borderColor: 'rgba(56, 189, 248, 0.45)',
}

const autoFsBanner: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 80,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'rgba(4, 8, 15, 0.88)',
  backdropFilter: 'blur(10px)',
}

const autoFsBannerText: React.CSSProperties = {
  margin: '0 0 20px',
  fontSize: '18px',
  color: C.text,
  textAlign: 'center',
  lineHeight: 1.45,
}

const autoFsBannerActions: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
  maxWidth: '280px',
}

const autoFsBannerPrimary: React.CSSProperties = {
  background: C.accent,
  color: '#0f172a',
  border: 'none',
  borderRadius: '10px',
  fontWeight: 700,
  padding: '14px 20px',
  fontSize: '15px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const autoFsBannerGhost: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.glassBorder}`,
  borderRadius: '10px',
  color: C.textSoft,
  padding: '12px 20px',
  fontSize: '14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'center',
}

const bgGrid: React.CSSProperties = {
  display: 'none',
}

const bgGlow: React.CSSProperties = {
  display: 'none',
}

const header: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingBottom: '14px',
  marginBottom: '24px',
  borderBottom: `2px solid ${C.accent}`,
}

const headerLeft: React.CSSProperties = { display: 'flex', alignItems: 'center', minWidth: 0 }
const headerRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }

const headerLogo: React.CSSProperties = {
  height: '40px',
  width: 'auto',
  maxWidth: 'min(320px, 50vw)',
  objectFit: 'contain',
  display: 'block',
}

const livePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 13px',
  borderRadius: '4px',
  background: '#b3261e',
  fontSize: '12px',
  fontWeight: 500,
  letterSpacing: '0.12em',
  color: '#fff',
}

const liveDot: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: '#fff',
}

const channelTag: React.CSSProperties = {
  fontSize: '13px',
  color: C.textDim,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const mainGrid: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2.2fr) minmax(240px, 0.9fr)',
  gap: '36px',
  alignItems: 'stretch',
  flex: 1,
  minHeight: 0,
}

const heroCol: React.CSSProperties = { minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }

const nowBlock: React.CSSProperties = {
  marginTop: '4px',
  padding: '24px 28px 28px',
  borderRadius: '10px',
  background: C.glass,
  border: `1px solid ${C.glassBorder}`,
}

const nowLabel: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: C.accent,
}

const meetingLabel: React.CSSProperties = {
  margin: '0 0 20px',
  fontSize: '13px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.textDim,
}

const itemBadgeRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }

const itemBadge: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: C.accent,
  padding: '6px 14px',
  borderRadius: '6px',
  background: C.glassHi,
  border: `1px solid ${C.glassBorder}`,
  fontFamily: mono,
}

const typePill: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'capitalize',
  color: C.textSoft,
  padding: '5px 12px',
  borderRadius: '999px',
  background: C.glassHi,
  border: `1px solid ${C.glassBorder}`,
}

const itemTitle: React.CSSProperties = {
  margin: '0 0 18px',
  fontSize: 'clamp(36px, 4.8vw, 58px)',
  fontWeight: 700,
  lineHeight: 1.06,
  letterSpacing: '-0.03em',
  color: C.text,
}


const presenterLine: React.CSSProperties = { margin: '0 0 8px', fontSize: 'clamp(18px, 2vw, 26px)', lineHeight: 1.35 }
const presenterName: React.CSSProperties = { color: C.text, fontWeight: 600 }
const presenterTitle: React.CSSProperties = { color: C.textSoft, fontWeight: 400 }

const docList: React.CSSProperties = { marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '8px' }
const docRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  borderRadius: '12px',
  background: C.glass,
  border: `1px solid ${C.glassBorder}`,
}
const docIcon: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.1em',
  color: C.accent,
  fontFamily: mono,
}
const docTitle: React.CSSProperties = { fontSize: '16px', color: C.textSoft }

const sideCol: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  alignSelf: 'stretch',
}

const cardLabel: React.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: C.textDim,
}

const clockBig: React.CSSProperties = {
  margin: '10px 0 0',
  fontSize: '42px',
  fontWeight: 600,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  color: C.text,
  letterSpacing: '-0.02em',
}

const divider: React.CSSProperties = {
  height: '1px',
  background: C.glassBorder,
  margin: '18px 0',
}

const elapsedBig: React.CSSProperties = {
  margin: '10px 0 0',
  fontSize: '36px',
  fontWeight: 600,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  color: C.accent,
}

const timerLabel: React.CSSProperties = { margin: '8px 0 0', fontSize: '16px', color: C.textSoft, fontWeight: 500 }
const timerBig: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: '48px',
  fontWeight: 700,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  color: C.accent,
  textShadow: `0 0 30px ${C.accentGlow}`,
}

const upNextCard: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: '16px 18px',
  borderRadius: '12px',
  background: C.glass,
  border: `1px solid ${C.glassBorder}`,
}

const upNextLabel: React.CSSProperties = {
  margin: 0,
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: C.amber,
}

const upNextList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginTop: '12px',
}

const upNextRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: '2px 0',
  background: 'transparent',
  border: 'none',
}
const upNextNum: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: C.textDim, fontFamily: mono }
const upNextTitle: React.CSSProperties = {
  fontSize: '16px',
  color: C.text,
  lineHeight: 1.3,
  fontWeight: 500,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const formingText: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(24px, 2.8vw, 32px)',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: C.text,
}
const motionMeta: React.CSSProperties = { margin: 0, fontSize: '18px', lineHeight: 1.45 }
const metaHighlight: React.CSSProperties = { color: C.text, fontWeight: 600 }
const metaDim: React.CSSProperties = { color: C.textSoft }
const awaitingSecond: React.CSSProperties = {
  margin: '12px 0 0',
  fontSize: '14px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: C.amber,
}

