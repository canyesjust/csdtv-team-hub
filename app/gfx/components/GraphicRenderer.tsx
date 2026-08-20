'use client'

import { templateById } from '@/lib/graphics/templates'
import type { GraphicPayload } from '@/lib/graphics/types'
import LogoMark, { resolveMarkCode, type MarkContext } from './LogoMark'

type D = Record<string, string>

function St({ i, base, children, style }: { i: number; base?: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="gx-st" style={{ ['--i' as string]: i, ...(base != null ? { ['--base' as string]: `${base}ms` } : {}), ...style }}>
      {children}
    </div>
  )
}

function Overlay({ motion, style, children }: { motion: string; style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={`gx gx-m-${motion}`}>
      <div className="gx-panel" style={style}>
        <span className="gx-glow" />
        <span className="gx-bar3" />
        <span className="gx-shine" />
        <div className="gx-content">{children}</div>
      </div>
    </div>
  )
}

function Slate({ children }: { children: React.ReactNode }) {
  return (
    <div className="gx gx-m-slate">
      <div className="gx-slate-bg"><span className="gx-wash" /><span className="gx-vignette" /></div>
      <div className="gx-panel gx-slate-body">{children}</div>
    </div>
  )
}

const lines = (v: string | undefined) => String(v || '').split('\n').filter(Boolean)

/** A number that counts in rather than cutting. */
function Num({ children, delay = 420 }: { children: React.ReactNode; delay?: number }) {
  return <span className="gx-num" style={{ ['--nd' as string]: `${delay}ms` }}><span>{children}</span></span>
}

/** An operator-supplied still. Never stretched, because a squashed crest reads
    worse than no crest. */
function Img({ src, className = '', style }: { src?: string; className?: string; style?: React.CSSProperties }) {
  if (!src) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} style={style} />
}

/**
 * Where a lower third sits. Raised clears a venue scoreboard or burned-in
 * captions; right is for when the subject is framed left. The band is the same
 * band either way, which is the point: one type scale, one set of anchors.
 */
function place(d: D, base: React.CSSProperties, fallback = 'left-low'): React.CSSProperties {
  const [side, height] = String(d.pos || fallback).split('-')
  const bottom = height === 'high' ? 232 : 96
  return side === 'right'
    ? { ...base, left: undefined, right: 80, bottom, textAlign: 'left' }
    : { ...base, left: 80, bottom }
}

export default function GraphicRenderer({ graphic, ctx }: { graphic: GraphicPayload; ctx: MarkContext }) {
  const t = templateById(graphic.tid)
  if (!t) return null
  const d = (graphic.data || {}) as D
  const mark = (key = 'logo', size = 80) => {
    const code = resolveMarkCode(d[key], ctx)
    return code ? <LogoMark code={code} size={size} ctx={ctx} /> : null
  }
  const markCell = (key = 'logo', size = 84, pad = '0 30px 0 34px') => {
    const m = mark(key, size)
    if (!m) return null
    return <div className="gx-st gx-markcell" style={{ ['--i' as string]: 0, ['--base' as string]: '180ms', padding: pad }}>{m}</div>
  }

  switch (t.id) {
    case 'concert_piece':
      return (
        <Overlay motion="wipeL" style={place(d, { maxWidth: 1520, borderRadius: 16, padding: 0 })}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {markCell()}
            <div style={{ padding: '22px 46px 26px 34px' }}>
              {d.ensemble && <St i={1}><div className="gx-kick" style={{ fontSize: 19, marginBottom: 7 }}>{d.ensemble}</div></St>}
              <St i={2}><div className="gx-name" style={{ fontSize: (d.title || '').length > 34 ? 46 : 58 }}>{d.title}</div></St>
              {d.movement && <St i={3}><div className="gx-sub" style={{ fontSize: 26, fontStyle: 'italic', marginTop: 5, opacity: 0.9 }}>{d.movement}</div></St>}
              <St i={4}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 11 }}>
                  <span className="gx-dot" />
                  <span className="gx-sub" style={{ fontSize: 28, fontWeight: 500 }}>
                    {d.composer}{d.dates ? <span style={{ color: 'var(--gx-3)', fontSize: 22 }}> ({d.dates})</span> : null}
                  </span>
                </div>
              </St>
              {d.arranger && <St i={5}><div className="gx-sub" style={{ fontSize: 22, marginTop: 5, marginLeft: 25, opacity: 0.85 }}>{d.arranger}</div></St>}
              {d.soloist && <St i={6}><div className="gx-kick" style={{ fontSize: 19, marginTop: 11 }}>{d.soloist}</div></St>}
              {d.conductor && <St i={7}><div className="gx-sub" style={{ fontSize: 20, marginTop: 6, opacity: 0.68 }}>{d.conductor}, conductor</div></St>}
            </div>
          </div>
        </Overlay>
      )

    case 'person_lt':
      return (
        <Overlay motion="wipeL" style={place(d, { maxWidth: 1420, borderRadius: 16, padding: 0 })}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {markCell('logo', 80, '0 28px 0 32px')}
            <div style={{ padding: '22px 46px 26px 32px' }}>
              <St i={1}><div className="gx-name" style={{ fontSize: 56 }}>{d.name}</div></St>
              <St i={2}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 9 }}>
                  <span className="gx-dot" /><span className="gx-kick" style={{ fontSize: 25 }}>{d.role}</span>
                </div>
              </St>
              {d.org && <St i={3}><div className="gx-sub" style={{ fontSize: 22, marginTop: 6, marginLeft: 25, opacity: 0.75 }}>{d.org}</div></St>}
            </div>
          </div>
        </Overlay>
      )

    case 'player_lt':
      return (
        <Overlay motion="wipeL" style={place(d, { maxWidth: 1560, borderRadius: 16, padding: 0 })}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ background: 'var(--gx-1)', minWidth: 158, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 26px' }}>
              <span className="gx-st" style={{ ['--i' as string]: 0, ['--base' as string]: '160ms', color: '#fff', fontSize: 86, fontWeight: 900, textShadow: 'var(--gx-tsh)' }}>{d.jersey}</span>
            </div>
            <div style={{ padding: '20px 44px 26px 32px' }}>
              {d.team && <St i={1}><div className="gx-kick" style={{ fontSize: 19, marginBottom: 5 }}>{d.team}</div></St>}
              <St i={2}><div className="gx-name" style={{ fontSize: 58 }}>{d.name}</div></St>
              <St i={3}><div className="gx-sub" style={{ fontSize: 25, marginTop: 6, opacity: 0.85 }}>{[d.cls, d.position].filter(Boolean).join(' · ')}</div></St>
              {d.stat && <St i={4}><div className="gx-kick" style={{ fontSize: 23, marginTop: 9 }}>{d.stat}</div></St>}
            </div>
          </div>
        </Overlay>
      )

    case 'stat_callout': {
      const pairs = [[d.k1, d.v1], [d.k2, d.v2], [d.k3, d.v3]].filter(p => p[0] && p[1])
      return (
        <Overlay motion="wipeL" style={place(d, { borderRadius: 16, padding: '20px 44px 26px' })}>
          <St i={0}><div className="gx-name" style={{ fontSize: 50 }}>{d.name}</div></St>
          <St i={1}><div className="gx-sub" style={{ fontSize: 23, marginTop: 4, opacity: 0.8 }}>{d.sub}</div></St>
          <div style={{ display: 'flex', gap: 54, marginTop: 18 }}>
            {pairs.map(([k, v], i) => (
              <St key={k} i={2 + i}>
                <div style={{ textAlign: 'center' }}>
                  <div className="gx-huge" style={{ fontSize: 62, lineHeight: 1 }}>{v}</div>
                  <div className="gx-kick" style={{ fontSize: 19, marginTop: 7 }}>{k}</div>
                </div>
              </St>
            ))}
          </div>
        </Overlay>
      )
    }

    case 'next_up':
      return (
        <Overlay motion="wipeR" style={place(d, { maxWidth: 780, borderRadius: 14, padding: '16px 32px 20px' }, 'right-low')}>
          <St i={0}><div className="gx-kick" style={{ fontSize: 18 }}>Next up</div></St>
          <St i={1}><div className="gx-name" style={{ fontSize: 36, marginTop: 5 }}>{d.title}</div></St>
          <St i={2}><div className="gx-sub" style={{ fontSize: 23, marginTop: 4, opacity: 0.85 }}>{d.sub}</div></St>
        </Overlay>
      )

    case 'parade_entry':
      return (
        <Overlay motion="wipeL" style={place(d, { maxWidth: 1740, borderRadius: 16, padding: 0 })}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {markCell('logo', 78, '0 26px 0 30px')}
            <div style={{ padding: '22px 44px 26px 30px' }}>
              <St i={1}><div className="gx-name" style={{ fontSize: 56 }}>{d.name}</div></St>
              {d.org && <St i={2}><div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}><span className="gx-dot" /><span className="gx-kick" style={{ fontSize: 26 }}>{d.org}</span></div></St>}
            </div>
          </div>
        </Overlay>
      )

    case 'grad_name':
      return (
        <Overlay motion="wipeL" style={place(d, { maxWidth: 1620, borderRadius: 16, padding: 0 })}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {markCell('logo', 84, '0 28px 0 32px')}
            <div style={{ padding: '22px 46px 26px 32px' }}>
              <St i={1}><div className="gx-name" style={{ fontSize: (d.name || '').length > 26 ? 54 : 66 }}>{d.name}</div></St>
              {d.honors && <St i={2}><div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 10 }}><span className="gx-dot" /><span className="gx-kick" style={{ fontSize: 26 }}>{d.honors}</span></div></St>}
              {d.extra && <St i={3}><div className="gx-sub" style={{ fontSize: 22, marginTop: 6, marginLeft: 25, opacity: 0.76 }}>{d.extra}</div></St>}
            </div>
          </div>
        </Overlay>
      )

    case 'free_lt':
      return (
        <Overlay motion="wipeL" style={place(d, { maxWidth: 1560, borderRadius: 16, padding: 0 })}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {markCell('logo', 80, '0 28px 0 32px')}
            <div style={{ padding: '22px 46px 26px 32px' }}>
              {d.l1 && <St i={1}><div className="gx-name" style={{ fontSize: (d.l1 || '').length > 32 ? 48 : 58 }}>{d.l1}</div></St>}
              {d.l2 && (
                <St i={2}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 9 }}>
                    <span className="gx-dot" /><span className="gx-kick" style={{ fontSize: 26 }}>{d.l2}</span>
                  </div>
                </St>
              )}
              {d.l3 && <St i={3}><div className="gx-sub" style={{ fontSize: 22, marginTop: 6, marginLeft: 25, opacity: 0.75 }}>{d.l3}</div></St>}
            </div>
          </div>
        </Overlay>
      )

    case 'free_card': {
      const body = lines(d.body)
      return (
        <Slate>
          {mark('logo', 120) && <St i={0} base={200} style={{ marginBottom: 26 }}>{mark('logo', 120)}</St>}
          {d.kick && <St i={1} base={200}><div className="gx-kick" style={{ fontSize: 28, letterSpacing: 5 }}>{d.kick}</div></St>}
          {d.title && <St i={2} base={200}><div className="gx-name" style={{ fontSize: (d.title || '').length > 30 ? 76 : 96, marginTop: 12 }}>{d.title}</div></St>}
          {body.length > 0 && (
            <div style={{ marginTop: 30, display: 'grid', gap: 14, justifyItems: 'center' }}>
              {body.slice(0, 8).map((line, i) => (
                <St key={line + i} i={3 + i} base={200}>
                  <div className="gx-sub" style={{ fontSize: 36 }}>{line}</div>
                </St>
              ))}
            </div>
          )}
          {d.foot && <St i={12} base={200}><div className="gx-kick" style={{ fontSize: 24, marginTop: 34, opacity: 0.8 }}>{d.foot}</div></St>}
        </Slate>
      )
    }

    case 'free_image':
      return (
        <div className="gx gx-m-slate">
          <div className="gx-slate-bg"><span className="gx-vignette" /></div>
          <div className="gx-grow" style={{ position: 'absolute', inset: 0 }}>
            <Img src={d.image} className="gx-fullimg" />
          </div>
          {(d.caption || d.credit) && (
            <div className="gx-imgcap">
              {d.caption && <St i={0} base={420}><div className="gx-name" style={{ fontSize: 46 }}>{d.caption}</div></St>}
              {d.credit && <St i={1} base={420}><div className="gx-kick" style={{ fontSize: 20, marginTop: 6 }}>{d.credit}</div></St>}
            </div>
          )}
        </div>
      )

    case 'backdrop':
      return (
        <div className="gx gx-m-slate">
          <div className="gx-slate-bg">
            <Img src={d.image} className="gx-fullimg" />
            <span className="gx-scrim" />
            <span className="gx-vignette" />
          </div>
          <div className="gx-panel gx-slate-body">
            {mark('logo', 130) && <St i={0} base={220} style={{ marginBottom: 26, height: 130 }}>{mark('logo', 130)}</St>}
            {d.kick && <St i={1} base={220}><div className="gx-kick" style={{ fontSize: 28, letterSpacing: 6 }}>{d.kick}</div></St>}
            {d.title && <St i={2} base={220}><div className="gx-name" style={{ fontSize: 92, marginTop: 12 }}>{d.title}</div></St>}
            {d.sub && <St i={3} base={220}><div className="gx-sub" style={{ fontSize: 34, marginTop: 14 }}>{d.sub}</div></St>}
          </div>
        </div>
      )

    case 'social_bug':
      return (
        <Overlay motion="drop" style={{ right: 70, top: 60, borderRadius: 46, padding: '10px 26px 10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {mark('logo', 52) && <span className="gx-st" style={{ ['--i' as string]: 0, ['--base' as string]: '150ms', display: 'flex' }}>{mark('logo', 52)}</span>}
            <div>
              {d.kick && <St i={1} base={150}><div className="gx-kick" style={{ fontSize: 15 }}>{d.kick}</div></St>}
              <St i={2} base={150}><div className="gx-name" style={{ fontSize: 27 }}>{d.handle}</div></St>
            </div>
          </div>
        </Overlay>
      )

    case 'lower_matchup':
      return (
        <Overlay motion="wipeL" style={place(d, { maxWidth: 1180, borderRadius: 16, padding: 0 })}>
          <div className="gx-lmu">
            <span className="gx-lmu-side l">
              <span className="gx-lmu-mark">{mark('alogo', 62)}</span>
              <span className="gx-lmu-team">{d.away}</span>
              <span className="gx-lmu-score gx-fill-l" style={{ ['--i' as string]: 0 }}>
                <Num delay={380}>{d.ascore}</Num>
              </span>
            </span>
            <span className="gx-lmu-mid">{d.note || 'vs'}</span>
            <span className="gx-lmu-side r">
              <span className="gx-lmu-score gx-fill-r" style={{ ['--i' as string]: 0 }}>
                <Num delay={380}>{d.hscore}</Num>
              </span>
              <span className="gx-lmu-team">{d.home}</span>
              <span className="gx-lmu-mark">{mark('hlogo', 62)}</span>
            </span>
          </div>
        </Overlay>
      )

    case 'player_bio':
      return (
        <Overlay motion="wipeL" style={place(d, { maxWidth: 1500, borderRadius: 16, padding: 0 })}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {d.photo
              ? <span className="gx-bio-photo"><Img src={d.photo} /></span>
              : markCell('logo', 80, '0 26px 0 30px')}
            <div style={{ padding: '20px 44px 24px 30px', minWidth: 0 }}>
              {d.team && <St i={1}><div className="gx-kick" style={{ fontSize: 18, marginBottom: 5 }}>{d.team}</div></St>}
              <St i={2}><div className="gx-name" style={{ fontSize: 54 }}>{d.name}</div></St>
              {d.role && <St i={3}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 7 }}>
                  <span className="gx-dot" /><span className="gx-kick" style={{ fontSize: 23 }}>{d.role}</span>
                </div>
              </St>}
              {d.bio && <St i={4}><div className="gx-sub gx-bio-text">{d.bio}</div></St>}
            </div>
          </div>
        </Overlay>
      )

    case 'lineup_panel': {
      const entries = lines(d.rows)
      const right = String(d.pos || 'left-low').startsWith('right')
      return (
        <div className={`gx gx-m-${right ? 'wipeR' : 'wipeL'}`}>
          <div className="gx-panel gx-lpanel" style={right ? { right: 70 } : { left: 70 }}>
            <div className="gx-cap gx-lpcap">
              <span className="gx-reveal gx-kick" style={{ fontSize: 21, letterSpacing: 4 }}>
                {d.kick || 'STARTING LINEUP'}
              </span>
            </div>
            <div className="gx-grow gx-lpbody">
              {mark('logo', 74) && <div className="gx-st gx-lpmark" style={{ ['--i' as string]: 0, ['--base' as string]: '300ms' }}>{mark('logo', 74)}</div>}
              {d.team && <St i={1} base={300}><div className="gx-name gx-lpteam">{d.team}</div></St>}
              <div className="gx-lplist">
                {entries.slice(0, 14).map((line, i) => (
                  <div key={line + i} className="gx-fill-l gx-lprow" style={{ ['--i' as string]: i, ['--base' as string]: '420ms' }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }

    case 'crawl': {
      const items = lines(d.items)
      const seconds = d.speed === 'fast' ? 26 : d.speed === 'slow' ? 68 : 44
      const run = items.length ? items : ['']
      return (
        <div className="gx gx-m-rise">
          <div className="gx-panel gx-crawlbar">
            <span className="gx-bar3" />
            {mark('logo', 44) && <span className="gx-crawl-mark">{mark('logo', 44)}</span>}
            {d.kick && <span className="gx-crawl-kick">{d.kick}</span>}
            <div className="gx-crawl-track">
              {/* Two identical runs so the loop has no seam. */}
              {[0, 1].map(copy => (
                <div key={copy} className="gx-crawl-run" style={{ animationDuration: `${seconds}s` }} aria-hidden={copy === 1}>
                  {run.map((item, i) => (
                    <span key={i}>
                      <span style={{ padding: '0 46px' }}>{item}</span>
                      <span style={{ color: 'var(--gx-3)' }}>◆</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    case 'corner_bug':
      return (
        <Overlay motion="drop" style={{ right: 70, top: 60, borderRadius: 46, padding: '10px 26px 10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            {mark('logo', 52) && <span className="gx-st" style={{ ['--i' as string]: 0, ['--base' as string]: '150ms', display: 'flex' }}>{mark('logo', 52)}</span>}
            {String(d.live || '').toLowerCase() === 'yes' && (
              <span className="gx-st" style={{ ['--i' as string]: 1, ['--base' as string]: '150ms', width: 13, height: 13, borderRadius: '50%', background: 'var(--gx-1)', display: 'block' }} />
            )}
            <St i={2} base={150}><span className="gx-sub" style={{ fontSize: 26, fontWeight: 600 }}>{d.text}</span></St>
          </div>
        </Overlay>
      )

    case 'sponsor_bug':
      return (
        <Overlay motion="drop" style={{ right: 70, bottom: 210, borderRadius: 14, padding: '14px 30px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {mark('logo', 64) && <span className="gx-st" style={{ ['--i' as string]: 0, ['--base' as string]: '150ms', display: 'flex' }}>{mark('logo', 64)}</span>}
            <div style={{ textAlign: 'left' }}>
              <St i={1} base={150}><div className="gx-kick" style={{ fontSize: 16 }}>{d.kick}</div></St>
              <St i={2} base={150}><div className="gx-name" style={{ fontSize: 32, marginTop: 3 }}>{d.name}</div></St>
            </div>
          </div>
        </Overlay>
      )

    case 'ticker': {
      const items = lines(d.items)
      return (
        <div className="gx gx-m-rise">
          <div className="gx-panel" style={{ left: 0, right: 0, bottom: 0, height: 70, display: 'flex', alignItems: 'center', borderRadius: 0 }}>
            <span className="gx-bar3" />
            {mark('logo', 46) && <span style={{ display: 'flex', padding: '0 22px 0 26px', position: 'relative', zIndex: 6 }}>{mark('logo', 46)}</span>}
            <div className="gx-content" style={{ whiteSpace: 'nowrap', color: '#fff', fontSize: 28, paddingLeft: 10, textShadow: 'var(--gx-tsh)', overflow: 'hidden' }}>
              {items.map((item, i) => (
                <span key={i}>
                  <span style={{ padding: '0 56px' }}>{item}</span>
                  <span style={{ color: 'var(--gx-3)' }}>◆</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )
    }

    case 'title_slate':
      return (
        <Slate>
          {mark('logo', 150) && <St i={0}>{mark('logo', 150)}</St>}
          <St i={1}><div className="gx-kick" style={{ fontSize: 30, marginTop: 24 }}>{d.kick}</div></St>
          <St i={2}><div className="gx-name" style={{ fontSize: 104, marginTop: 14, fontWeight: 700 }}>{d.title}</div></St>
          <St i={3}><div className="gx-rule" /></St>
          <St i={4}><div className="gx-sub" style={{ fontSize: 36 }}>{d.sub}</div></St>
        </Slate>
      )

    case 'message':
      return (
        <Slate>
          {mark('logo', 110) && <St i={0}>{mark('logo', 110)}</St>}
          <St i={1}><div className="gx-name" style={{ fontSize: 84, marginTop: 26 }}>{d.title}</div></St>
          {d.sub && <St i={2}><div className="gx-sub" style={{ fontSize: 36, marginTop: 18 }}>{d.sub}</div></St>}
        </Slate>
      )

    case 'section_header':
      return (
        <Slate>
          {mark('logo', 130) && <St i={0}>{mark('logo', 130)}</St>}
          <St i={1}><div className="gx-kick" style={{ fontSize: 30, marginTop: 22 }}>{d.kick}</div></St>
          <St i={2}><div className="gx-name" style={{ fontSize: 86, marginTop: 12 }}>{d.title}</div></St>
          <St i={3}><div className="gx-rule" /></St>
          <St i={4}><div className="gx-sub" style={{ fontSize: 32 }}>{d.sub}</div></St>
        </Slate>
      )

    case 'program_note':
      return (
        <Slate>
          {mark('logo', 90) && <St i={0}>{mark('logo', 90)}</St>}
          <St i={1}><div className="gx-kick" style={{ fontSize: 26, marginTop: 18 }}>Program note</div></St>
          <St i={2}><div className="gx-name" style={{ fontSize: 70, marginTop: 10 }}>{d.title}</div></St>
          <St i={3}><div className="gx-rule" /></St>
          <St i={4}><div className="gx-sub" style={{ fontSize: 34, lineHeight: 1.5, maxWidth: 1280, whiteSpace: 'pre-line', margin: '0 auto' }}>{d.body}</div></St>
        </Slate>
      )

    case 'matchup':
      return (
        <Slate>
          {/* The build read off the reference: the cap lands first with its
              title revealed through it, the body grows down from the rail,
              then the wings push out carrying each team's colour. */}
          <div className="gx-cap gx-mucap">
            <span className="gx-reveal gx-kick" style={{ fontSize: 30, letterSpacing: 7 }}>
              {d.meta || 'MATCHUP'}
            </span>
          </div>
          <div className="gx-grow gx-mubody">
            <div className="gx-wing-l gx-muwing l" />
            <div className="gx-wing-r gx-muwing r" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 70, width: '100%', maxWidth: 1560, position: 'relative', zIndex: 3 }}>
              <St i={0} base={420} style={{ flex: 1 }}>
                <div style={{ marginBottom: 18, height: 150 }}>{mark('alogo', 150)}</div>
                <div className="gx-name" style={{ fontSize: 62 }}>{d.away}</div>
                <div className="gx-kick" style={{ fontSize: 25, marginTop: 9 }}>{d.arec}</div>
              </St>
              <St i={1} base={420}><div className="gx-huge" style={{ fontSize: 56, opacity: 0.55 }}>at</div></St>
              <St i={2} base={420} style={{ flex: 1 }}>
                <div style={{ marginBottom: 18, height: 150 }}>{mark('hlogo', 150)}</div>
                <div className="gx-name" style={{ fontSize: 62 }}>{d.home}</div>
                <div className="gx-kick" style={{ fontSize: 25, marginTop: 9 }}>{d.hrec}</div>
              </St>
            </div>
          </div>
        </Slate>
      )

    case 'score_card':
      return (
        <Slate>
          <St i={0}><div className="gx-kick" style={{ fontSize: 32 }}>{d.kick}</div></St>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 64, marginTop: 26 }}>
            <St i={1}>
              <div style={{ marginBottom: 14 }}>{mark('alg', 110)}</div>
              <div className="gx-name" style={{ fontSize: 40 }}>{d.a}</div>
              <div className="gx-huge" style={{ fontSize: 118, lineHeight: 1.02, marginTop: 4 }}>{d.as}</div>
            </St>
            <St i={2}><div className="gx-huge" style={{ fontSize: 44, opacity: 0.4 }}>·</div></St>
            <St i={3}>
              <div style={{ marginBottom: 14 }}>{mark('blg', 110)}</div>
              <div className="gx-name" style={{ fontSize: 40 }}>{d.b}</div>
              <div className="gx-huge" style={{ fontSize: 118, lineHeight: 1.02, marginTop: 4 }}>{d.bs}</div>
            </St>
          </div>
          {d.note && <St i={4}><div className="gx-kick" style={{ fontSize: 25, marginTop: 34 }}>{d.note}</div></St>}
        </Slate>
      )

    case 'lineup':
      return (
        <Slate>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
            {mark('logo', 80) && <St i={0}>{mark('logo', 80)}</St>}
            <St i={0}>
              <div style={{ textAlign: 'left' }}>
                <div className="gx-kick" style={{ fontSize: 24 }}>{d.kick}</div>
                <div className="gx-name" style={{ fontSize: 54, marginTop: 4 }}>{d.team}</div>
              </div>
            </St>
          </div>
          <St i={1}><div className="gx-rule" /></St>
          <div style={{ width: '100%', maxWidth: 1180 }}>
            {lines(d.rows).map((row, i) => {
              const c = row.split(',').map(x => x.trim())
              return (
                <St key={i} i={2 + i}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
                    <span className="gx-huge" style={{ fontSize: 42, minWidth: 90, color: 'var(--gx-3)' }}>{c[0] || ''}</span>
                    <span className="gx-name" style={{ fontSize: 40, flex: 1, textAlign: 'left' }}>{c[1] || ''}</span>
                    <span className="gx-sub" style={{ fontSize: 29, opacity: 0.72 }}>{c[2] || ''}</span>
                  </div>
                </St>
              )
            })}
          </div>
        </Slate>
      )

    case 'roster_page': {
      const cols: [string, string][] = [[d.s1, d.n1], [d.s2, d.n2], [d.s3, d.n3], [d.s4, d.n4]]
      return (
        <Slate>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
            {mark('logo', 72) && <St i={0}>{mark('logo', 72)}</St>}
            <St i={0}><div className="gx-name" style={{ fontSize: 56 }}>{d.title}</div></St>
          </div>
          <St i={1}><div className="gx-rule" /></St>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 48, maxWidth: 1620 }}>
            {cols.map(([heading, names], i) => heading ? (
              <St key={i} i={2 + i}>
                <div style={{ textAlign: 'left' }}>
                  <div className="gx-kick" style={{ fontSize: 24, marginBottom: 12 }}>{heading}</div>
                  {lines(names).map((n, j) => <div key={j} className="gx-sub" style={{ fontSize: 26, lineHeight: 1.55 }}>{n}</div>)}
                </div>
              </St>
            ) : null)}
          </div>
        </Slate>
      )
    }

    case 'countdown': {
      const sponsors = lines(d.sponsors)
      return (
        <Slate>
          {mark('logo', 120) && <St i={0}>{mark('logo', 120)}</St>}
          <St i={1}><div className="gx-kick" style={{ fontSize: 32, marginTop: 20 }}>{d.kick}</div></St>
          <St i={2}><div className="gx-huge" style={{ fontSize: 150, marginTop: 6, lineHeight: 1 }} data-gx-countdown={d.target || ''}>--:--</div></St>
          <St i={3}>
            <div style={{ height: 10, borderRadius: 99, background: 'rgba(255,255,255,.13)', width: '46%', margin: '30px auto 0', overflow: 'hidden' }}>
              <i data-gx-progress="1" style={{ display: 'block', height: '100%', width: '0%', borderRadius: 99, background: 'linear-gradient(90deg, var(--gx-1), var(--gx-3))' }} />
            </div>
          </St>
          <St i={4}><div className="gx-sub" style={{ fontSize: 34, marginTop: 28 }}>Back at <b style={{ color: 'var(--gx-3)' }}>{d.target}</b></div></St>
          {d.sub && <St i={5}><div className="gx-sub" style={{ fontSize: 25, marginTop: 8, opacity: 0.62 }}>{d.sub}</div></St>}
          {sponsors.length > 0 && (
            <div className="gx-st" style={{ ['--i' as string]: 7, position: 'absolute', left: 0, right: 0, bottom: 64 }}>
              <div className="gx-kick" style={{ fontSize: 16, opacity: 0.42, marginBottom: 14 }}>Brought to you by</div>
              <div style={{ display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                {sponsors.map((s, i) => (
                  <span key={i} className="gx-sub" style={{ fontSize: 24, opacity: 0.62, padding: '0 32px', borderLeft: i ? '1px solid rgba(255,255,255,.18)' : undefined }}>{s}</span>
                ))}
              </div>
            </div>
          )}
        </Slate>
      )
    }

    default:
      return null
  }
}
