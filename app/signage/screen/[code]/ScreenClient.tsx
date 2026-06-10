'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WAYFINDING_ARROWS, formatSignageClock, type SignageLayout, type SignageOrientation, type WayfindingDirection } from '@/lib/signage/constants'
import './signage-screen.css'

type FeedMedia = { id: string; type: 'image' | 'video'; title: string | null; url: string; full_screen: boolean }
type FeedAnnouncement = { id: string; title: string; subtitle: string | null; in_ticker: boolean; scope_label: string; all_screens: boolean }
type FeedWayfinding = { id: string; destination: string; direction: string }
type FeedVisitor = { id: string; name: string; note: string | null }

export type ScreenFeed = {
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
  offline?: boolean
}

const REFRESH_MS = 30_000
const FADE_MS = 450
const HEADING_ROTATE_MS = 3_500

function BellIcon() {
  return <span className="cic-ann-icon" aria-hidden>🔔</span>
}

function ConfettiIcon() {
  return <span className="cic-confetti-icon" aria-hidden>✦</span>
}

function ScreenLogo({ portrait }: { portrait?: boolean }) {
  return (
    <div className={`cic-logo${portrait ? ' portrait' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cic-logo.svg" alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
    </div>
  )
}

function ScreenHeader({
  portrait,
  brandTitle,
  brandSub,
  weatherIcon,
  tempF,
  clock,
  wayfindingHeading,
}: {
  portrait?: boolean
  brandTitle: string
  brandSub: string
  weatherIcon: string
  tempF: number | null
  clock: string
  wayfindingHeading?: string | null
}) {
  return (
    <div className={`cic-tvhead${portrait ? ' portrait' : ''}`}>
      <div className={`cic-head-left${portrait ? ' portrait' : ''}`}>
        <ScreenLogo portrait={portrait} />
        <div>
          <div className={`cic-brand${portrait ? ' portrait' : ''}`}>{wayfindingHeading ?? brandTitle}</div>
          <div className={`cic-brandsub${portrait ? ' portrait' : ''}`}>{wayfindingHeading ? 'Find your way' : brandSub}</div>
        </div>
      </div>
      <div className="cic-head-right">
        <div className={`cic-wx${portrait ? ' portrait' : ''}`}>
          <span aria-hidden>{weatherIcon}</span>
          {tempF != null && <span>{tempF}&deg;</span>}
        </div>
        {!portrait && <div className="cic-clk">{clock}</div>}
      </div>
    </div>
  )
}

function WelcomeStrip({ visitor, portrait }: { visitor: FeedVisitor; portrait?: boolean }) {
  const suffix = visitor.note ? ` — ${visitor.note}` : ' — thanks for visiting today'
  return (
    <div className={`cic-welcome${portrait ? ' portrait' : ''}`}>
      <ConfettiIcon />
      <span>Welcome, <b>{visitor.name}</b>{suffix}</span>
    </div>
  )
}

function TickerBar({ items, portrait }: { items: string[]; portrait?: boolean }) {
  const text = items.length
    ? items.join('   •   ')
    : 'Canyons Innovation Center'
  return (
    <div className={`cic-ticker${portrait ? ' portrait' : ''}`}>
      <div className="cic-tickin">{text}</div>
    </div>
  )
}

function AnnouncementRow({ ann }: { ann: FeedAnnouncement }) {
  return (
    <div className="cic-ann">
      <BellIcon />
      <div>
        <div className="cic-anntop">
          {ann.title}
          <span className={`cic-spill${ann.all_screens ? ' all' : ''}`}>{ann.scope_label}</span>
        </div>
        {ann.subtitle && <div className="cic-annsub">{ann.subtitle}</div>}
      </div>
    </div>
  )
}

function AnnouncementsRail({ announcements, emptyLabel = 'No announcements' }: { announcements: FeedAnnouncement[]; emptyLabel?: string }) {
  return (
    <div className="cic-rail">
      <div className="cic-railhd">Announcements</div>
      {announcements.map(a => <AnnouncementRow key={a.id} ann={a} />)}
      {!announcements.length && <div className="cic-empty-muted">{emptyLabel}</div>}
    </div>
  )
}

function WayfindingDirectory({ entries, portrait }: { entries: FeedWayfinding[]; portrait?: boolean }) {
  return (
    <div className={`cic-dir${portrait ? ' portrait' : ''}`}>
      {entries.map(w => (
        <div key={w.id}>
          <span className="cic-dir-arrow">{WAYFINDING_ARROWS[w.direction as WayfindingDirection] || '→'}</span>
          {w.destination}
        </div>
      ))}
      {!entries.length && <div className="cic-empty-muted">Directory coming soon</div>}
    </div>
  )
}

function MediaCarousel({
  media,
  index,
  visible,
  imageSeconds,
  onAdvance,
  fill,
  portrait,
}: {
  media: FeedMedia[]
  index: number
  visible: boolean
  imageSeconds: number
  onAdvance: () => void
  fill?: boolean
  portrait?: boolean
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

  useEffect(() => {
    if (!media.length) return
    const next = media[(index + 1) % media.length]
    if (next?.type === 'image') {
      const img = new Image()
      img.src = next.url
    }
  }, [media, index])

  const className = [
    'cic-media16',
    fill ? 'fill' : '',
    portrait && !fill ? 'portrait-top' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className}>
      {item?.type === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.title || ''} className={visible ? '' : 'hidden'} />
      )}
      {item?.type === 'video' && (
        <video
          ref={videoRef}
          src={item.url}
          muted
          playsInline
          autoPlay
          onEnded={onAdvance}
          className={visible ? '' : 'hidden'}
        />
      )}
      {!item && (
        <div className="cic-media-overlay">
          <div className="cic-msub">No media scheduled</div>
        </div>
      )}
      {media.length > 1 && (
        <div className="cic-dots">
          {media.map((m, i) => (
            <span key={m.id} className={`cic-dot${i === index ? ' on' : ''}`} />
          ))}
        </div>
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
    <div className="cic-fill live-bg" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <video ref={videoRef} muted playsInline autoPlay className="cic-live-video" />
      <div className="cic-live-badge"><span className="cic-live-dot" />live</div>
      <div className="cic-capbar">
        {label ? `${label} · ` : ''}Streaming live · reverts when the stream ends
      </div>
    </div>
  )
}

function OfflineFallback({ centerName }: { centerName: string }) {
  return (
    <div className="cic-fill offline-bg">
      <div className="cic-offline-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cic-logo.svg" alt="" style={{ width: 26, height: 26 }} onError={e => { e.currentTarget.style.display = 'none' }} />
      </div>
      <div className="cic-offline-title">Display will resume shortly</div>
      <div className="cic-msub" style={{ marginTop: 6 }}>Reconnecting…</div>
      <div className="cic-offline-foot">{centerName} · cached screen</div>
    </div>
  )
}

type ScreenClientProps = {
  code: string
  initialFeed: ScreenFeed
  imageSeconds: number
}

export default function ScreenClient({ code, initialFeed, imageSeconds }: ScreenClientProps) {
  const [feed, setFeed] = useState<ScreenFeed>(initialFeed)
  const [mediaIndex, setMediaIndex] = useState(0)
  const mediaIndexRef = useRef(0)
  const [mediaVisible, setMediaVisible] = useState(true)
  const [now, setNow] = useState(new Date())
  const [headingIndex, setHeadingIndex] = useState(0)
  const [offline, setOffline] = useState(Boolean(initialFeed.offline))

  useEffect(() => {
    mediaIndexRef.current = mediaIndex
  }, [mediaIndex])

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/signage/screen/${encodeURIComponent(code)}/feed?t=${Date.now()}`,
        { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } },
      )
      if (!res.ok) return
      const data = (await res.json()) as ScreenFeed
      if (data.offline) {
        setOffline(true)
        return
      }
      setOffline(false)
      setFeed(prev => {
        const prevId = prev.media[mediaIndexRef.current]?.id
        if (!data.media.length) {
          setMediaIndex(0)
        } else if (prevId) {
          const match = data.media.findIndex(m => m.id === prevId)
          setMediaIndex(match >= 0 ? match : 0)
        } else {
          setMediaIndex(0)
        }
        return data
      })
    } catch {
      /* keep last feed when offline */
    }
  }, [code])

  useEffect(() => { setFeed(initialFeed) }, [initialFeed])

  useEffect(() => {
    const timer = setTimeout(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/signage-sw.js').catch(() => {})
      }
    }, 3000)
    return () => clearTimeout(timer)
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
    if (!feed.media.length) return
    setMediaVisible(false)
    setTimeout(() => {
      setMediaIndex(i => (i + 1) % feed.media.length)
      setMediaVisible(true)
    }, FADE_MS)
  }, [feed.media.length])

  const headings = useMemo(() => {
    const list: string[] = []
    if (feed.screen.heading) list.push(feed.screen.heading)
    list.push('Find your way around the Innovation Center')
    for (const v of feed.visitors) {
      list.push(v.note ? `Welcome ${v.name} — ${v.note}` : `Welcome ${v.name}`)
    }
    return list.length ? list : ['Find your way around the Innovation Center']
  }, [feed])

  useEffect(() => {
    if (feed.screen.layout !== 'wayfinding') return
    const t = setInterval(() => setHeadingIndex(i => (i + 1) % headings.length), HEADING_ROTATE_MS)
    return () => clearInterval(t)
  }, [feed.screen.layout, headings.length])

  const portrait = feed.screen.orientation === 'portrait'
  const layout = feed.screen.layout ?? 'zoned'
  const currentMedia = feed.media[mediaIndex]
  const takeoverContent = currentMedia?.full_screen
  const showZones = !takeoverContent && !feed.live.live
  const visitor = feed.visitors[0]
  const clock = formatSignageClock(now)
  const areaLabel = feed.screen.area?.name || feed.screen.name
  const centerSub = feed.screen.center_name === 'Canyons Innovation Center'
    ? 'Innovation Center'
    : feed.screen.center_name

  if (offline) {
    return (
      <div className={`cic-screen${portrait ? ' portrait' : ''}${layout === 'zoned' && !portrait ? ' layout-zoned' : ''}`}>
        <OfflineFallback centerName={feed.screen.center_name} />
      </div>
    )
  }

  return (
    <div className={`cic-screen${portrait ? ' portrait' : ''}${layout === 'zoned' && !portrait ? ' layout-zoned' : ''}`}>
      {feed.live.live && <LiveTakeover hlsUrl={feed.live.hls_url} label={feed.live.label} />}

      {/* 2. Full-bleed landscape */}
      {layout === 'full_bleed' && showZones && (
        <>
          <div className="cic-fill">
            <MediaCarousel
              media={feed.media}
              index={mediaIndex}
              visible={mediaVisible}
              imageSeconds={imageSeconds}
              onAdvance={advanceMedia}
              fill
            />
            <div className="cic-locchip">{areaLabel}</div>
            {visitor && (
              <div className="cic-welchip"><ConfettiIcon /> Welcome {visitor.name}</div>
            )}
          </div>
          <TickerBar items={feed.ticker} portrait={portrait} />
        </>
      )}

      {/* 1. Zoned landscape */}
      {layout === 'zoned' && showZones && !portrait && (
        <>
          <ScreenHeader
            brandTitle={areaLabel}
            brandSub={centerSub}
            weatherIcon={feed.weather.icon}
            tempF={feed.weather.tempF}
            clock={clock}
          />
          {visitor && <WelcomeStrip visitor={visitor} />}
          <div className="cic-body">
            <MediaCarousel
              media={feed.media}
              index={mediaIndex}
              visible={mediaVisible}
              imageSeconds={imageSeconds}
              onAdvance={advanceMedia}
            />
            <AnnouncementsRail announcements={feed.announcements} />
          </div>
          <TickerBar items={feed.ticker} />
        </>
      )}

      {/* 3. Portrait (zoned stack) */}
      {layout === 'zoned' && showZones && portrait && (
        <>
          <ScreenHeader
            portrait
            brandTitle={feed.screen.name}
            brandSub={centerSub}
            weatherIcon={feed.weather.icon}
            tempF={feed.weather.tempF}
            clock={clock}
          />
          {visitor && <WelcomeStrip visitor={visitor} portrait />}
          <MediaCarousel
            media={feed.media}
            index={mediaIndex}
            visible={mediaVisible}
            imageSeconds={imageSeconds}
            onAdvance={advanceMedia}
            portrait
          />
          {feed.wayfinding.length > 0 && (
            <div className="cic-portrait-section">
              <div className="cic-railhd tight">Directory</div>
              <WayfindingDirectory entries={feed.wayfinding} portrait />
            </div>
          )}
          <div className="cic-portrait-ann">
            <div className="cic-railhd">Announcements</div>
            {feed.announcements.map(a => <AnnouncementRow key={a.id} ann={a} />)}
            {!feed.announcements.length && <div className="cic-empty-muted">No announcements</div>}
          </div>
          <TickerBar items={feed.ticker} portrait />
        </>
      )}

      {/* 4. Wayfinding landscape */}
      {layout === 'wayfinding' && showZones && !portrait && (
        <>
          <ScreenHeader
            brandTitle={headings[headingIndex % headings.length]}
            brandSub="Find your way"
            weatherIcon={feed.weather.icon}
            tempF={feed.weather.tempF}
            clock={clock}
            wayfindingHeading={headings[headingIndex % headings.length]}
          />
          <div className="cic-body">
            <div className="cic-wayfind-dir">
              <div className="cic-railhd" style={{ marginBottom: 8 }}>Directory</div>
              <WayfindingDirectory entries={feed.wayfinding} />
            </div>
            <MediaCarousel
              media={feed.media}
              index={mediaIndex}
              visible={mediaVisible}
              imageSeconds={imageSeconds}
              onAdvance={advanceMedia}
            />
          </div>
          <TickerBar items={feed.ticker} />
        </>
      )}

      {/* Wayfinding portrait */}
      {layout === 'wayfinding' && showZones && portrait && (
        <>
          <ScreenHeader
            portrait
            brandTitle={headings[headingIndex % headings.length]}
            brandSub="Find your way"
            weatherIcon={feed.weather.icon}
            tempF={feed.weather.tempF}
            clock={clock}
            wayfindingHeading={headings[headingIndex % headings.length]}
          />
          {visitor && <WelcomeStrip visitor={visitor} portrait />}
          <MediaCarousel
            media={feed.media}
            index={mediaIndex}
            visible={mediaVisible}
            imageSeconds={imageSeconds}
            onAdvance={advanceMedia}
            portrait
          />
          <div className="cic-portrait-section">
            <div className="cic-railhd tight">Directory</div>
            <WayfindingDirectory entries={feed.wayfinding} portrait />
          </div>
          <div className="cic-portrait-ann">
            <div className="cic-railhd">Announcements</div>
            {feed.announcements.map(a => <AnnouncementRow key={a.id} ann={a} />)}
          </div>
          <TickerBar items={feed.ticker} portrait />
        </>
      )}

      {/* Full-screen content takeover */}
      {takeoverContent && !feed.live.live && (
        <MediaCarousel
          media={feed.media}
          index={mediaIndex}
          visible={mediaVisible}
          imageSeconds={imageSeconds}
          onAdvance={advanceMedia}
          fill
        />
      )}
    </div>
  )
}
