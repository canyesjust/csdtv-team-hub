'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { useBoardChannelState } from '@/app/board/hooks/useBoardChannelState'
import { useElementFullscreen } from '@/app/board/hooks/useElementFullscreen'
import type { PublicActiveMotion, PublicActiveVoteResult } from '@/lib/board-meetings/motion-types'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'
import BoardBrandingSlide from '@/app/board/components/BoardBrandingSlide'
import BoardIdleBranding from '@/app/board/components/BoardIdleBranding'

const LS_KEY = 'board-dais-person'

const C = {
  bg0: '#04080f',
  bg1: '#0a1220',
  text: '#f1f5f9',
  textSoft: '#94a3b8',
  textDim: '#64748b',
  accent: '#38bdf8',
  accentGlow: 'rgba(56, 189, 248, 0.35)',
  amber: '#fbbf24',
  amberGlow: 'rgba(251, 191, 36, 0.25)',
  blue: '#3b82f6',
  blueGlow: 'rgba(59, 130, 246, 0.3)',
  green: '#34d399',
  greenGlow: 'rgba(52, 211, 153, 0.25)',
  red: '#f87171',
  redGlow: 'rgba(248, 113, 113, 0.25)',
  glass: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassHi: 'rgba(255, 255, 255, 0.07)',
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
  const state = useBoardChannelState(channelNumber, { livePriority: true })
  const fullscreen = useElementFullscreen()
  const [personName, setPersonName] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [boardMembers, setBoardMembers] = useState<{ id: string; display_name: string }[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [autoFsPrompt, setAutoFsPrompt] = useState(false)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    if (saved) setPersonName(saved)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (wantAutoFullscreen && fullscreen.supported) setAutoFsPrompt(true)
  }, [wantAutoFullscreen, fullscreen.supported])

  const elapsed = useMemo(() => {
    if (!state?.elapsed_started_at) return 0
    return Math.max(0, Math.floor((now - new Date(state.elapsed_started_at).getTime()) / 1000))
  }, [state?.elapsed_started_at, now])

  const wallClock = useMemo(
    () => new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    [now],
  )

  const openPicker = async () => {
    setPickerOpen(true)
    if (boardMembers.length > 0) return
    try {
      const res = await fetch('/api/board/public/board-members')
      if (!res.ok) return
      const body = await res.json()
      setBoardMembers((body.members || []).map((p: { id: string; display_name: string }) => ({
        id: p.id,
        display_name: p.display_name,
      })))
    } catch { /* ignore */ }
  }

  const selectPerson = (name: string) => {
    localStorage.setItem(LS_KEY, name)
    setPersonName(name)
    setPickerOpen(false)
  }

  const screenNameForIdle = state?.channel_name || initialChannelName || `Channel ${channelNumber}`

  const shellProps = {
    channelNumber,
    fullscreen,
    autoFsPrompt,
    onDismissAutoFsPrompt: () => setAutoFsPrompt(false),
    onEnterFullscreen: async () => {
      const ok = await fullscreen.enter()
      if (ok) setAutoFsPrompt(false)
    },
  }

  if (!state?.active) {
    return (
      <DaisShell {...shellProps}>
        <BoardIdleBranding screenName={screenNameForIdle} variant="fullscreen" />
      </DaisShell>
    )
  }

  const item = state.current_item
  const timer = state.timer
  const mode = state.state?.mode
  const brandingHold = !!(state.agenda_branding_hold || state.state?.agenda_branding_hold)
  const voteResult = state.state?.active_vote_result
  const motion = state.state?.active_motion
  const screenName = state.meeting?.title || initialChannelName || `Channel ${channelNumber}`

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
      `}</style>

      <div style={inner}>
        <div style={bgGrid} aria-hidden />
        <div style={bgGlow} aria-hidden />

        <header style={header}>
          <div style={headerLeft}>
            <span style={livePill}>
              <span style={liveDot} />
              LIVE
            </span>
            <span style={channelTag}>Dais · Ch {channelNumber}</span>
          </div>
          <div style={headerRight}>
            {personName ? (
              <span style={personChip}>{personName}</span>
            ) : (
              <button type="button" onClick={openPicker} style={ghostBtn}>
                Identify monitor
              </button>
            )}
          </div>
        </header>

        {pickerOpen && (
          <div style={pickerOverlay} role="presentation">
            <div style={pickerCard} role="dialog" aria-label="Select board member">
              <p style={pickerTitle}>This monitor</p>
              <p style={pickerSub}>Select your name for a personalized welcome.</p>
              <div style={pickerList}>
                {boardMembers.map(m => (
                  <button key={m.id} type="button" onClick={() => selectPerson(m.display_name)} style={pickerItem}>
                    {m.display_name}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} style={pickerCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

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
                <div style={itemBadgeRow}>
                  <span style={itemBadge}>{item.item_number}</span>
                  {item.type && <span style={typePill}>{item.type.replace('_', ' ')}</span>}
                </div>
                <h1 style={itemTitle}>{item.title}</h1>
                {item.presenters?.[0] && (
                  <p style={presenterLine}>
                    <span style={presenterName}>{item.presenters[0].name}</span>
                    {item.presenters[0].title && (
                      <span style={presenterTitle}> · {item.presenters[0].title}</span>
                    )}
                  </p>
                )}

                {voteResult && (voteResult.remaining_seconds ?? 0) > 0 ? (
                  <VoteResultCard result={voteResult} />
                ) : motion ? (
                  <DaisMotionPanel motion={motion} />
                ) : null}

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
            ) : (
              <p style={waitingText}>Standing by for agenda item…</p>
            )}
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
                  {state.upcoming_items.slice(0, 2).map(u => (
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
      </div>
    </DaisShell>
  )
}

function DaisShell({
  channelNumber: _channelNumber,
  children,
  fullscreen,
  autoFsPrompt,
  onDismissAutoFsPrompt,
  onEnterFullscreen,
}: {
  channelNumber: number
  children: React.ReactNode
  fullscreen: ReturnType<typeof useElementFullscreen>
  autoFsPrompt: boolean
  onDismissAutoFsPrompt: () => void
  onEnterFullscreen: () => void | Promise<void>
}) {
  const { isFullscreen, supported, toggle, setContainer } = fullscreen

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
          }}
          aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
        >
          {isFullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      ) : null}

      {children}
    </div>
  )
}

function GlassCard({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        padding: '20px 22px',
        borderRadius: '16px',
        background: C.glass,
        border: `1px solid ${accent ? `${accent}44` : C.glassBorder}`,
        boxShadow: accent
          ? `0 0 40px ${accent}18, inset 0 1px 0 rgba(255,255,255,0.06)`
          : 'inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
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
        borderRadius: '20px',
        background: `linear-gradient(135deg, ${accent}22 0%, transparent 60%)`,
        border: `1px solid ${accent}55`,
        boxShadow: `0 0 60px ${accent}22`,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 700, letterSpacing: '-0.02em', color: C.text }}>
        {label}
      </h1>
    </div>
  )
}

function VoteResultCard({ result }: { result: PublicActiveVoteResult }) {
  const passed = result.result === 'passed'
  const accent = passed ? C.green : C.red
  const glow = passed ? C.greenGlow : C.redGlow
  return (
    <div
      style={{
        marginTop: '28px',
        padding: '24px 26px',
        borderRadius: '18px',
        background: `linear-gradient(145deg, ${glow} 0%, transparent 55%)`,
        border: `1px solid ${accent}66`,
        boxShadow: `0 0 48px ${glow}`,
      }}
    >
      <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>
        {passed ? 'Motion passed' : 'Motion failed'} · {result.tally.yea}–{result.tally.nay}
      </p>
      <p style={{ margin: 0, fontSize: '22px', lineHeight: 1.4, color: C.text, fontWeight: 500 }}>
        {result.motion_text}
      </p>
    </div>
  )
}

function DaisMotionPanel({ motion }: { motion: PublicActiveMotion }) {
  const isVoting = motion.status === 'voting'
  const hasMover = !!motion.moved_by_name
  const hasSeconder = !!motion.seconded_by_name

  if (isVoting) {
    return (
      <MotionCard
        label="Voting open"
        accent={C.blue}
        glow={C.blueGlow}
        pulse
      >
        <p style={motionText}>{motion.motion_text}</p>
        {hasMover && hasSeconder && (
          <p style={motionMeta}>
            <span style={metaHighlight}>{motion.moved_by_name}</span>
            <span style={metaDim}> seconded by </span>
            <span style={metaHighlight}>{motion.seconded_by_name}</span>
          </p>
        )}
      </MotionCard>
    )
  }

  if (!hasMover) {
    return (
      <MotionCard label="Motion in progress" accent={C.amber} glow={C.amberGlow} shimmer>
        <p style={formingText}>A motion is being made</p>
      </MotionCard>
    )
  }

  if (!hasSeconder) {
    return (
      <MotionCard label="On the floor" accent={C.amber} glow={C.amberGlow}>
        <p style={motionText}>{motion.motion_text}</p>
        <p style={motionMeta}>
          <span style={metaDim}>Moved by </span>
          <span style={metaHighlight}>{motion.moved_by_name}</span>
        </p>
        <p style={awaitingSecond}>Awaiting second</p>
      </MotionCard>
    )
  }

  return (
    <MotionCard label="On the floor" accent={C.amber} glow={C.amberGlow}>
      <p style={motionText}>{motion.motion_text}</p>
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
  glow,
  children,
  pulse,
  shimmer,
}: {
  label: string
  accent: string
  glow: string
  children: React.ReactNode
  pulse?: boolean
  shimmer?: boolean
}) {
  return (
    <div
      style={{
        marginTop: '28px',
        padding: '26px 28px',
        borderRadius: '18px',
        position: 'relative',
        overflow: 'hidden',
        background: shimmer
          ? `linear-gradient(110deg, ${glow} 0%, transparent 40%, ${glow} 80%)`
          : `linear-gradient(145deg, ${glow} 0%, transparent 50%)`,
        backgroundSize: shimmer ? '200% 100%' : undefined,
        animation: shimmer ? 'dais-shimmer 4s ease-in-out infinite' : pulse ? 'dais-pulse 2.5s ease-in-out infinite' : undefined,
        border: `1px solid ${accent}55`,
        boxShadow: `0 0 40px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          background: accent,
          borderRadius: '18px 0 0 18px',
          boxShadow: `0 0 16px ${accent}`,
        }}
        aria-hidden
      />
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
  background: `linear-gradient(165deg, ${C.bg0} 0%, ${C.bg1} 45%, #060b14 100%)`,
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
  top: 20,
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
  position: 'absolute',
  inset: 0,
  backgroundImage: `
    linear-gradient(rgba(56, 189, 248, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.03) 1px, transparent 1px)
  `,
  backgroundSize: '48px 48px',
  maskImage: 'radial-gradient(ellipse 80% 70% at 30% 40%, black 20%, transparent 75%)',
  pointerEvents: 'none',
}

const bgGlow: React.CSSProperties = {
  position: 'absolute',
  top: '-20%',
  left: '-10%',
  width: '55%',
  height: '60%',
  background: 'radial-gradient(ellipse, rgba(56, 189, 248, 0.12) 0%, transparent 70%)',
  pointerEvents: 'none',
}

const header: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '28px',
}

const headerLeft: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '14px' }
const headerRight: React.CSSProperties = { display: 'flex', alignItems: 'center' }

const livePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 14px',
  borderRadius: '999px',
  background: 'rgba(52, 211, 153, 0.12)',
  border: '1px solid rgba(52, 211, 153, 0.45)',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.14em',
  color: C.green,
}

const liveDot: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: C.green,
  boxShadow: `0 0 10px ${C.green}`,
  animation: 'dais-pulse 2s ease-in-out infinite',
}

const channelTag: React.CSSProperties = {
  fontSize: '13px',
  color: C.textDim,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const personChip: React.CSSProperties = {
  fontSize: '14px',
  color: C.textSoft,
  padding: '8px 16px',
  borderRadius: '10px',
  background: C.glassHi,
  border: `1px solid ${C.glassBorder}`,
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.glassBorder}`,
  borderRadius: '10px',
  color: C.accent,
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '0.02em',
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

const heroCol: React.CSSProperties = { minWidth: 0 }

const nowBlock: React.CSSProperties = {
  marginTop: '4px',
  padding: '28px 32px 32px',
  borderRadius: '20px',
  background: 'linear-gradient(145deg, rgba(56, 189, 248, 0.08) 0%, rgba(255, 255, 255, 0.02) 55%)',
  border: '1px solid rgba(56, 189, 248, 0.22)',
  boxShadow: '0 0 48px rgba(56, 189, 248, 0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
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
  borderRadius: '8px',
  background: 'rgba(56, 189, 248, 0.1)',
  border: `1px solid rgba(56, 189, 248, 0.35)`,
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

const waitingText: React.CSSProperties = {
  margin: '32px 0 0',
  fontSize: '28px',
  color: C.textDim,
  fontWeight: 500,
}

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
  marginTop: 'auto',
  padding: '14px 16px',
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: `1px solid ${C.glassBorder}`,
  opacity: 0.85,
}

const upNextLabel: React.CSSProperties = {
  margin: 0,
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.textDim,
}

const upNextList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginTop: '10px',
}

const upNextRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '8px 10px',
  borderRadius: '8px',
  background: 'transparent',
  border: 'none',
}
const upNextNum: React.CSSProperties = { fontSize: '10px', fontWeight: 600, color: C.textDim, fontFamily: mono }
const upNextTitle: React.CSSProperties = {
  fontSize: '13px',
  color: C.textSoft,
  lineHeight: 1.35,
  fontWeight: 400,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const motionText: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 'clamp(20px, 2.2vw, 26px)',
  lineHeight: 1.4,
  color: C.text,
  fontWeight: 500,
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

const pickerOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(4, 8, 15, 0.85)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: '24px',
}

const pickerCard: React.CSSProperties = {
  width: '100%',
  maxWidth: '400px',
  padding: '28px',
  borderRadius: '20px',
  background: 'linear-gradient(160deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
  border: `1px solid ${C.glassBorder}`,
  boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
}

const pickerTitle: React.CSSProperties = { margin: '0 0 6px', fontSize: '20px', fontWeight: 700, color: C.text }
const pickerSub: React.CSSProperties = { margin: '0 0 20px', fontSize: '14px', color: C.textSoft, lineHeight: 1.45 }
const pickerList: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '50vh', overflowY: 'auto' }
const pickerItem: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '14px 16px',
  borderRadius: '12px',
  background: C.glassHi,
  border: `1px solid ${C.glassBorder}`,
  color: C.text,
  fontSize: '16px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
}
const pickerCancel: React.CSSProperties = {
  ...pickerItem,
  marginTop: '12px',
  textAlign: 'center',
  color: C.textDim,
  background: 'transparent',
}
