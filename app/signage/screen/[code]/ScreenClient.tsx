'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { CIC_PALETTE, WAYFINDING_ARROWS, type SignageLayout, type SignageOrientation, type WayfindingDirection } from '@/lib/signage/constants'

type FeedMedia = { id: string; type: 'image' | 'video'; title: string | null; url: string; full_screen: boolean }
type FeedAnnouncement = { id: string; title: string; subtitle: string | null; in_ticker: boolean }
type FeedWayfinding = { id: string; destination: string; direction: string }
type FeedVisitor = { id: string; name: string; note: string | null }

type ScreenFeed = {
  screen: {
    name: string
    code: string
    orientation: SignageOrientation
    layout: SignageLayout
    heading: string | null
    area: { name: string; slug: string; building: string | null; floor: number | null } | null
    center_name: string
  }
  media: FeedMedia[]
  announcements: FeedAnnouncement[]
  ticker: string[]
  wayfinding: FeedWayfinding[]
  visitors: FeedVisitor[]
  live: { live: true; hls_url: string; label: string | null } | { live: false }
  weather: { tempF: number | null; condition: string; icon: string }
}

const REFRESH_MS = 60_000
const FADE_MS = 500

function CicLogo({ size = 48 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/cic-logo.svg"
      alt=""
      width={size}
      height={size}
      style={{ display: 'block' }}
      onError={e => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

function TickerBar({ items }: { items: string[] }) {
  const text = items.length ? items.join('   •   ') : 'Canyons Innovation Center'
  return (
    <div style={{
      background: CIC_PALETTE.panel,
      color: CIC_PALETTE.offWhite,
      padding: '10px 0',
      overflow: 'hidden',
      borderTop: `1px solid ${CIC_PALETTE.accent}`,
      flexShrink: 0,
    }}>
      <div className="cic-ticker-track" style={{ whiteSpace: 'nowrap', display: 'inline-block', animation: 'cic-ticker 40s linear infinite', fontSize: '18px', paddingLeft: '100%' }}>
        {text}
      </div>
      <style>{`@keyframes cic-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }`}</style>
    </div>
  )
}

function MediaBox({
  media,
  index,
  visible,
  imageSeconds,
  onAdvance,
  fill,
}: {
  media: FeedMedia[]
  index: number
  visible: boolean
  imageSeconds: number
  onAdvance: () => void
  fill?: boolean
}) {
  const item = media[index]
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!item || item.type !== 'image') return
    const t = setTimeout(onAdvance, imageSeconds * 1000)
    return () => clearTimeout(t)
  }, [item, imageSeconds, onAdvance])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !item || item.type !== 'video') return
    v.load()
    void v.play().catch(() => {})
  }, [item])

  if (!item) {
    return (
      <div style={{
        background: CIC_PALETTE.black,
        flex: fill ? 1 : undefined,
        width: fill ? '100%' : undefined,
        aspectRatio: fill ? undefined : '16 / 9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: CIC_PALETTE.accent,
        fontSize: '20px',
      }}>
        No media scheduled
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative',
      flex: fill ? 1 : undefined,
      width: fill ? '100%' : undefined,
      aspectRatio: fill ? undefined : '16 / 9',
      background: CIC_PALETTE.black,
      overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transition: `opacity ${FADE_MS}ms ease`,
    }}>
      {item.type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.title || ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <video
          ref={videoRef}
          src={item.url}
          muted
          playsInline
          autoPlay
          onEnded={onAdvance}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}
    </div>
  )
}

function LiveTakeover({ hlsUrl, label }: { hlsUrl: string; label: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: { destroy: () => void } | null = null
    let cancelled = false

    ;(async () => {
      const Hls = (await import('hls.js')).default
      if (cancelled) return
      if (Hls.isSupported()) {
        const instance = new Hls()
        hls = instance
        instance.loadSource(hlsUrl)
        instance.attachMedia(video)
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => {})
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl
        void video.play().catch(() => {})
      }
    })()

    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [hlsUrl])

  return (
    <div style={{ position: 'fixed', inset: 0, background: CIC_PALETTE.black, zIndex: 100 }}>
      <video ref={videoRef} muted playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      {label && (
        <div style={{ position: 'absolute', bottom: 24, left: 24, background: 'rgba(22,40,68,0.85)', color: CIC_PALETTE.offWhite, padding: '8px 16px', borderRadius: 8, fontSize: 18 }}>
          LIVE — {label}
        </div>
      )}
    </div>
  )
}

export default function ScreenClient() {
  const params = useParams()
  const searchParams = useSearchParams()
  const code = String(params.code ?? '')
  const imageSeconds = useMemo(() => {
    const raw = parseInt(searchParams.get('seconds') ?? '10', 10)
    return Number.isNaN(raw) ? 10 : Math.min(120, Math.max(3, raw))
  }, [searchParams])

  const [feed, setFeed] = useState<ScreenFeed | null>(null)
  const [mediaIndex, setMediaIndex] = useState(0)
  const [mediaVisible, setMediaVisible] = useState(true)
  const [now, setNow] = useState(new Date())
  const [headingIndex, setHeadingIndex] = useState(0)

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch(`/api/signage/screen/${encodeURIComponent(code)}/feed`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as ScreenFeed
      setFeed(data)
      setMediaIndex(i => (data.media.length ? Math.min(i, data.media.length - 1) : 0))
    } catch {
      /* keep cached feed via SW */
    }
  }, [code])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/signage-sw.js').catch(() => {})
    }
  }, [])

  useEffect(() => {
    void loadFeed()
    const interval = setInterval(() => void loadFeed(), REFRESH_MS)
    return () => clearInterval(interval)
  }, [loadFeed])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const advanceMedia = useCallback(() => {
    if (!feed?.media.length) return
    setMediaVisible(false)
    setTimeout(() => {
      setMediaIndex(i => (i + 1) % (feed?.media.length || 1))
      setMediaVisible(true)
    }, FADE_MS)
  }, [feed?.media.length])

  const headings = useMemo(() => {
    if (!feed) return ['Find your way']
    const list: string[] = []
    if (feed.screen.heading) list.push(feed.screen.heading)
    list.push('Find your way around the Innovation Center')
    for (const v of feed.visitors) {
      list.push(v.note ? `Welcome ${v.name} — ${v.note}` : `Welcome ${v.name}`)
    }
    return list.length ? list : ['Find your way']
  }, [feed])

  useEffect(() => {
    if (feed?.screen.layout !== 'wayfinding') return
    const t = setInterval(() => setHeadingIndex(i => (i + 1) % headings.length), 8000)
    return () => clearInterval(t)
  }, [feed?.screen.layout, headings.length])

  const portrait = feed?.screen.orientation === 'portrait'
  const layout = feed?.screen.layout ?? 'zoned'
  const currentMedia = feed?.media[mediaIndex]
  const takeoverContent = currentMedia?.full_screen
  const showZones = !takeoverContent && !feed?.live.live

  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const areaLabel = feed?.screen.area?.name || feed?.screen.name

  if (!feed) {
    return (
      <div style={{ minHeight: '100vh', background: CIC_PALETTE.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CIC_PALETTE.accent, fontFamily: 'system-ui, sans-serif' }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      height: '100vh',
      background: CIC_PALETTE.navy,
      color: CIC_PALETTE.offWhite,
      fontFamily: 'system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      cursor: 'none',
    }}>
      {feed.live.live && <LiveTakeover hlsUrl={feed.live.hls_url} label={feed.live.label} />}

      {layout === 'full_bleed' && showZones && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 2, background: 'rgba(30,54,73,0.9)', padding: '6px 14px', borderRadius: 8, fontSize: 14, color: CIC_PALETTE.accent }}>
            {areaLabel}
          </div>
          {feed.visitors[0] && (
            <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2, background: 'rgba(30,54,73,0.9)', padding: '6px 14px', borderRadius: 8, fontSize: 14 }}>
              Welcome {feed.visitors[0].name}
            </div>
          )}
          <MediaBox media={feed.media} index={mediaIndex} visible={mediaVisible} imageSeconds={imageSeconds} onAdvance={advanceMedia} fill />
          <TickerBar items={feed.ticker} />
        </div>
      )}

      {layout === 'zoned' && showZones && (
        <div style={{ flex: 1, display: 'flex', flexDirection: portrait ? 'column' : 'row', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: CIC_PALETTE.panel, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CicLogo size={40} />
                <div>
                  <div style={{ fontSize: 14, color: CIC_PALETTE.accent }}>{feed.screen.center_name}</div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{areaLabel}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 16 }}>
                <div>{feed.weather.icon} {feed.weather.tempF != null ? `${feed.weather.tempF}°F` : ''} {feed.weather.condition}</div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>{clock}</div>
              </div>
            </header>
            {feed.visitors[0] && (
              <div style={{ background: CIC_PALETTE.accent, color: CIC_PALETTE.navy, textAlign: 'center', padding: '8px 16px', fontWeight: 600, fontSize: 16, flexShrink: 0 }}>
                Welcome {feed.visitors[0].name}{feed.visitors[0].note ? ` — ${feed.visitors[0].note}` : ''}
              </div>
            )}
            <div style={{ flex: 1, padding: portrait ? 12 : 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
              <div style={{ width: '100%', maxWidth: portrait ? '100%' : 'min(100%, calc((100vh - 200px) * 16 / 9))' }}>
                <MediaBox media={feed.media} index={mediaIndex} visible={mediaVisible} imageSeconds={imageSeconds} onAdvance={advanceMedia} />
              </div>
            </div>
            <TickerBar items={feed.ticker} />
          </div>
          {!portrait && (
            <aside style={{ width: 320, background: CIC_PALETTE.panel, padding: 20, overflowY: 'auto', flexShrink: 0, borderLeft: `1px solid ${CIC_PALETTE.gray}` }}>
              <div style={{ fontSize: 14, color: CIC_PALETTE.accent, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Announcements</div>
              {feed.announcements.map(a => (
                <div key={a.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 17 }}>{a.title}</div>
                  {a.subtitle && <div style={{ fontSize: 14, color: CIC_PALETTE.accent, marginTop: 4 }}>{a.subtitle}</div>}
                </div>
              ))}
              {!feed.announcements.length && <div style={{ color: CIC_PALETTE.gray, fontSize: 14 }}>No announcements</div>}
            </aside>
          )}
          {portrait && feed.announcements.length > 0 && (
            <div style={{ background: CIC_PALETTE.panel, padding: 16, flexShrink: 0 }}>
              {feed.announcements.slice(0, 3).map(a => (
                <div key={a.id} style={{ marginBottom: 8, fontSize: 15 }}><strong>{a.title}</strong>{a.subtitle ? ` — ${a.subtitle}` : ''}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {layout === 'wayfinding' && showZones && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <header style={{ padding: '20px 24px', background: CIC_PALETTE.panel, textAlign: 'center', flexShrink: 0 }}>
            <CicLogo size={36} />
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, minHeight: 34 }}>{headings[headingIndex % headings.length]}</div>
          </header>
          <div style={{ flex: 1, display: 'flex', flexDirection: portrait ? 'column' : 'row', minHeight: 0, padding: 16, gap: 16 }}>
            <div style={{ flex: portrait ? undefined : 1, width: portrait ? '100%' : undefined }}>
              <MediaBox media={feed.media} index={mediaIndex} visible={mediaVisible} imageSeconds={imageSeconds} onAdvance={advanceMedia} />
            </div>
            <div style={{ flex: portrait ? 1 : '0 0 340px', background: CIC_PALETTE.panel, borderRadius: 12, padding: 20, overflowY: 'auto' }}>
              {feed.wayfinding.map(w => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, fontSize: 20 }}>
                  <span style={{ fontSize: 28, width: 36, textAlign: 'center', color: CIC_PALETTE.accent }}>
                    {WAYFINDING_ARROWS[w.direction as WayfindingDirection] || '→'}
                  </span>
                  <span>{w.destination}</span>
                </div>
              ))}
              {!feed.wayfinding.length && <div style={{ color: CIC_PALETTE.gray }}>Directory coming soon</div>}
            </div>
          </div>
          <TickerBar items={feed.ticker} />
        </div>
      )}

      {takeoverContent && showZones === false && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <MediaBox media={feed.media} index={mediaIndex} visible={mediaVisible} imageSeconds={imageSeconds} onAdvance={advanceMedia} fill />
        </div>
      )}
    </div>
  )
}
