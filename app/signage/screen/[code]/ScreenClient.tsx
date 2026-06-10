'use client'

import Hls from 'hls.js'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { WAYFINDING_ARROWS, formatSignageClock, type SignageLayout, type SignageOrientation, type SignageTheme, type WayfindingDirection } from '@/lib/signage/constants'
import { announcementIconEmoji } from '@/lib/signage/announcement-icons'
import { isSignageHlsUrl, youtubeEmbedUrlFromStreamUrl } from '@/lib/signage/stream-url'
import SignageBackground from '@/app/signage/_components/SignageBackground'
import './signage-screen.css'

type FeedMedia = {
  id: string
  type: 'image' | 'video' | 'html'
  title: string | null
  url: string
  html: string | null
  full_screen: boolean
  display_seconds: number
}
type FeedAnnouncement = { id: string; title: string; subtitle: string | null; in_ticker: boolean; icon: string; scope_label: string | null; all_screens: boolean }
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
    theme: SignageTheme
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

const REFRESH_MS = 5_000
const CROSSFADE_MS = 700
const HEADING_ROTATE_MS = 3_500

function ConfettiIcon() {
  return <span className="cic-confetti-icon" aria-hidden>✦</span>
}

function AnnouncementIcon({ icon }: { icon: string }) {
  return <span className="cic-ann-icon" aria-hidden>{announcementIconEmoji(icon)}</span>
}

function ScreenLogo({ portrait }: { portrait?: boolean }) {
  return (
    <div className={`cic-logo${portrait ? ' portrait' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cic-logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
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
        {!portrait && <div className="cic-clk">{renderClock(clock)}</div>}
      </div>
    </div>
  )
}

function ZonedHeader({
  centerName,
  areaLabel,
  weatherIcon,
  tempF,
  clock,
  visitor,
}: {
  centerName: string
  areaLabel: string
  weatherIcon: string
  tempF: number | null
  clock: string
  visitor?: FeedVisitor
}) {
  return (
    <div className="cic-tvhead cic-zhead">
      <div className="cic-zhead-id">
        <ScreenLogo />
        <span className="cic-zhead-area">{areaLabel}</span>
      </div>
      <div className="cic-zhead-welcome">
        <ConfettiIcon />
        <span>
          {visitor
            ? <>Welcome, <b>{visitor.name}</b>{visitor.note ? <span className="cic-zhead-note"> — {visitor.note}</span> : null}</>
            : <>Welcome to <b>{centerName}</b></>}
        </span>
      </div>
      <div className="cic-head-right">
        <div className="cic-wx">
          <span aria-hidden>{weatherIcon}</span>
          {tempF != null && <span>{tempF}&deg;</span>}
        </div>
        <div className="cic-clk">{renderClock(clock)}</div>
      </div>
    </div>
  )
}

function renderClock(clock: string) {
  return clock.split(':').map((part, i) => (
    <span key={i}>
      {i > 0 && <span className="cic-clk-colon">:</span>}
      {part}
    </span>
  ))
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
      <span className="cic-ticker-pill" aria-hidden>CIC</span>
      <div className="cic-ticker-scroll">
        <div className="cic-tickin">{text}</div>
      </div>
    </div>
  )
}

function AnnouncementRow({ ann }: { ann: FeedAnnouncement }) {
  return (
    <div className="cic-ann">
      <AnnouncementIcon icon={ann.icon} />
      <div>
        <div className="cic-anntop">
          {ann.title}
          {ann.scope_label && <span className="cic-spill">{ann.scope_label}</span>}
        </div>
        {ann.subtitle && <div className="cic-annsub">{ann.subtitle}</div>}
      </div>
    </div>
  )
}

function AnnouncementsRail({
  announcements,
  wayfinding,
  emptyLabel = 'No announcements',
  compactDirectory,
}: {
  announcements: FeedAnnouncement[]
  wayfinding?: FeedWayfinding[]
  emptyLabel?: string
  compactDirectory?: boolean
}) {
  return (
    <div className="cic-railcol">
      <div className="cic-rail cic-rail-ann">
        <div className="cic-railhd">Announcements</div>
        {announcements.map(a => <AnnouncementRow key={a.id} ann={a} />)}
        {!announcements.length && <div className="cic-empty-muted">{emptyLabel}</div>}
      </div>
      {wayfinding && wayfinding.length > 0 && (
        <div className="cic-rail cic-rail-dir">
          <div className="cic-railhd">Directory</div>
          <WayfindingDirectory entries={wayfinding} compact={compactDirectory} />
        </div>
      )}
    </div>
  )
}

function WayfindingDirectory({
  entries,
  portrait,
  compact,
  prominent,
}: {
  entries: FeedWayfinding[]
  portrait?: boolean
  compact?: boolean
  prominent?: boolean
}) {
  const className = [
    'cic-dir',
    portrait ? 'portrait' : '',
    compact ? 'compact' : '',
    prominent ? 'prominent' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className}>
      {entries.map(w => (
        <div
          key={w.id}
          className={prominent ? 'cic-dir-card' : 'cic-dir-row cic-dir-row-compact'}
        >
          <span
            className={`cic-dir-arrow-badge${prominent ? ' hero' : ' compact'}`}
            aria-hidden
          >
            {WAYFINDING_ARROWS[w.direction as WayfindingDirection] || '→'}
          </span>
          <span className={prominent ? 'cic-dir-label' : 'cic-dir-label-compact'}>{w.destination}</span>
        </div>
      ))}
      {!entries.length && <div className="cic-empty-muted">Directory coming soon</div>}
    </div>
  )
}

function WayfindingVisitorWelcome({ visitor, portrait }: { visitor: FeedVisitor; portrait?: boolean }) {
  const suffix = visitor.note ? ` — ${visitor.note}` : ' — thanks for visiting today'
  return (
    <div className={`cic-wayfind-welcome${portrait ? ' portrait' : ''}`}>
      <ConfettiIcon />
      <span>Welcome, <b>{visitor.name}</b>{suffix}</span>
    </div>
  )
}

function MediaSlide({
  item,
  layerClass,
  active,
  imageSeconds,
  onAdvance,
}: {
  item: FeedMedia | undefined
  layerClass: string
  active: boolean
  imageSeconds: number
  onAdvance: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onAdvanceRef = useRef(onAdvance)
  onAdvanceRef.current = onAdvance

  const slideSeconds = item?.display_seconds ?? imageSeconds

  useEffect(() => {
    if (!active || !item || item.type === 'video') return
    const t = setTimeout(() => onAdvanceRef.current(), slideSeconds * 1000)
    return () => clearTimeout(t)
  }, [active, item?.id, item?.type, slideSeconds])

  useEffect(() => {
    const v = videoRef.current
    if (!active || !v || !item || item.type !== 'video') return
    v.load()
    void v.play().catch(() => {})
  }, [active, item])

  if (!item) return null

  return (
    <div className={layerClass}>
      {item.type === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.title || ''} />
      )}
      {item.type === 'video' && (
        <video
          ref={videoRef}
          src={item.url}
          muted
          playsInline
          autoPlay
          onEnded={() => onAdvanceRef.current()}
        />
      )}
      {item.type === 'html' && item.html && (
        <div className="cic-html-slide" dangerouslySetInnerHTML={{ __html: item.html }} />
      )}
    </div>
  )
}

function MediaCarousel({
  media,
  index,
  imageSeconds,
  onAdvance,
  fill,
  portrait,
  wayfindMedia,
}: {
  media: FeedMedia[]
  index: number
  imageSeconds: number
  onAdvance: () => void
  fill?: boolean
  portrait?: boolean
  wayfindMedia?: boolean
}) {
  const displayedIndexRef = useRef(index)
  const [crossfade, setCrossfade] = useState<{ from: number; to: number; active: boolean } | null>(null)

  useEffect(() => {
    if (index === displayedIndexRef.current) return
    if (media.length <= 1) {
      displayedIndexRef.current = index
      return
    }
    const from = displayedIndexRef.current
    const to = index
    setCrossfade({ from, to, active: false })
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCrossfade(cf => (cf && cf.to === to ? { ...cf, active: true } : cf))
      })
    })
    const t = setTimeout(() => {
      displayedIndexRef.current = to
      setCrossfade(null)
    }, CROSSFADE_MS)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [index, media.length])

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
    wayfindMedia ? 'wayfind-media' : '',
    crossfade ? 'cic-media-crossfading' : '',
  ].filter(Boolean).join(' ')

  const item = media[index]

  return (
    <div className={className} style={{ '--crossfade-ms': `${CROSSFADE_MS}ms` } as CSSProperties}>
      {crossfade ? (
        <>
          <MediaSlide
            item={media[crossfade.from]}
            layerClass={`cic-media-layer cic-media-layer--out${crossfade.active ? ' is-fading' : ''}`}
            active={false}
            imageSeconds={imageSeconds}
            onAdvance={onAdvance}
          />
          <MediaSlide
            item={media[crossfade.to]}
            layerClass={`cic-media-layer cic-media-layer--in${crossfade.active ? ' is-fading' : ''}`}
            active
            imageSeconds={imageSeconds}
            onAdvance={onAdvance}
          />
        </>
      ) : (
        <MediaSlide
          item={item}
          layerClass="cic-media-layer"
          active
          imageSeconds={imageSeconds}
          onAdvance={onAdvance}
        />
      )}
      {!item && !crossfade && (
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
      {media.length > 1 && (
        <div className="cic-mediaprog" aria-hidden>
          <span
            key={index}
            className="cic-mediaprog-fill"
            style={{ animationDuration: `${Math.max(3, media[index]?.display_seconds ?? imageSeconds)}s` }}
          />
        </div>
      )}
    </div>
  )
}

function LiveTakeover({
  hlsUrl,
  label,
  centerName,
  screenName,
}: {
  hlsUrl: string
  label: string | null
  centerName: string
  screenName: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const youtubeEmbed = useMemo(() => youtubeEmbedUrlFromStreamUrl(hlsUrl), [hlsUrl])
  const useHls = !youtubeEmbed && isSignageHlsUrl(hlsUrl)
  const title = label?.trim() || `${centerName} — Live`

  useEffect(() => {
    if (youtubeEmbed || !useHls) return
    const video = videoRef.current
    if (!video) return
    let hls: Hls | null = null
    let cancelled = false

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!cancelled) void video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && hls) {
          hls.destroy()
          hls = null
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl
      void video.play().catch(() => {})
    } else {
      video.src = hlsUrl
      void video.play().catch(() => {})
    }

    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [hlsUrl, useHls, youtubeEmbed])

  return (
    <div className="cic-fill live-bg cic-live-shell" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      {youtubeEmbed ? (
        <iframe
          src={youtubeEmbed}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        />
      ) : (
        <video ref={videoRef} muted playsInline autoPlay className="cic-live-video" crossOrigin="anonymous" />
      )}
      <div className="cic-live-badge"><span className="cic-live-dot" />live</div>
      <div className="cic-live-context" aria-live="polite">
        <div className="cic-live-context-kicker">Now showing</div>
        <div className="cic-live-context-title">{title}</div>
        <div className="cic-live-context-sub">
          You&apos;re watching a live broadcast. Regular announcements and photos on this screen
          will return when the stream ends.
        </div>
      </div>
      <div className="cic-capbar">
        {centerName} · {screenName} · Live event in progress
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
  const mediaLengthRef = useRef(initialFeed.media.length)
  const [now, setNow] = useState(new Date())
  const [headingIndex, setHeadingIndex] = useState(0)
  const [offline, setOffline] = useState(Boolean(initialFeed.offline))

  useEffect(() => {
    mediaIndexRef.current = mediaIndex
  }, [mediaIndex])

  useEffect(() => {
    mediaLengthRef.current = feed.media.length
  }, [feed.media.length])

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
    const interval = window.setInterval(() => void loadFeed(), REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadFeed()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadFeed])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const advanceMedia = useCallback(() => {
    const len = mediaLengthRef.current
    if (!len) return
    setMediaIndex(i => (i + 1) % len)
  }, [])

  const wayfindingHeadings = useMemo(() => {
    const list: string[] = []
    if (feed.screen.heading) list.push(feed.screen.heading)
    list.push('Find your way around the Innovation Center')
    return list
  }, [feed.screen.heading])

  useEffect(() => {
    if (feed.screen.layout !== 'wayfinding') return
    const t = setInterval(() => setHeadingIndex(i => (i + 1) % wayfindingHeadings.length), HEADING_ROTATE_MS)
    return () => clearInterval(t)
  }, [feed.screen.layout, wayfindingHeadings.length])

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

  const screenClass = `cic-screen${portrait ? ' portrait' : ''} layout-${layout} cic-theme-${feed.screen.theme}`

  if (offline) {
    return (
      <div className={screenClass}>
        <SignageBackground />
        <div className="cic-screen-content">
          <OfflineFallback centerName={feed.screen.center_name} />
        </div>
      </div>
    )
  }

  return (
    <div className={screenClass}>
      <SignageBackground />
      <div className="cic-screen-content">
      {feed.live.live && (
        <LiveTakeover
          hlsUrl={feed.live.hls_url}
          label={feed.live.label}
          centerName={feed.screen.center_name}
          screenName={feed.screen.name}
        />
      )}

      {/* 2. Full-bleed landscape */}
      {layout === 'full_bleed' && showZones && (
        <>
          <div className="cic-fill">
            <MediaCarousel
              media={feed.media}
              index={mediaIndex}
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
        <div className="cic-zoned-stage">
          <ZonedHeader
            centerName={feed.screen.center_name}
            areaLabel={areaLabel}
            weatherIcon={feed.weather.icon}
            tempF={feed.weather.tempF}
            clock={clock}
            visitor={visitor}
          />
          <div className="cic-body">
            <MediaCarousel
              media={feed.media}
              index={mediaIndex}
              imageSeconds={imageSeconds}
              onAdvance={advanceMedia}
            />
            <AnnouncementsRail
              announcements={feed.announcements}
              wayfinding={feed.wayfinding}
              compactDirectory
            />
          </div>
          <TickerBar items={feed.ticker} />
        </div>
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
            imageSeconds={imageSeconds}
            onAdvance={advanceMedia}
            portrait
          />
          <div className="cic-portrait-ann">
            <div className="cic-railhd">Announcements</div>
            {feed.announcements.map(a => <AnnouncementRow key={a.id} ann={a} />)}
            {!feed.announcements.length && <div className="cic-empty-muted">No announcements</div>}
            {feed.wayfinding.length > 0 && (
              <>
                <div className="cic-rail-divider" />
                <div className="cic-railhd">Directory</div>
                <WayfindingDirectory entries={feed.wayfinding} portrait compact />
              </>
            )}
          </div>
          <TickerBar items={feed.ticker} portrait />
        </>
      )}

      {/* 4. Wayfinding landscape */}
      {layout === 'wayfinding' && showZones && !portrait && (
        <>
          <ScreenHeader
            brandTitle={wayfindingHeadings[headingIndex % wayfindingHeadings.length]}
            brandSub="Find your way"
            weatherIcon={feed.weather.icon}
            tempF={feed.weather.tempF}
            clock={clock}
            wayfindingHeading={wayfindingHeadings[headingIndex % wayfindingHeadings.length]}
          />
          <div className="cic-body cic-body-wayfind">
            <div className="cic-wayfind-dir">
              <div className="cic-railhd cic-wayfind-dir-title">Directory</div>
              <div className="cic-wayfind-dir-scroll">
                <WayfindingDirectory entries={feed.wayfinding} prominent />
              </div>
              {visitor && <WayfindingVisitorWelcome visitor={visitor} />}
            </div>
            <div className="cic-wayfind-side">
              <div className="cic-wayfind-media-wrap">
                <MediaCarousel
                  media={feed.media}
                  index={mediaIndex}
                  imageSeconds={imageSeconds}
                  onAdvance={advanceMedia}
                  wayfindMedia
                />
              </div>
              <aside className="cic-wayfind-ann-rail" aria-label="Announcements">
                <div className="cic-railhd cic-wayfind-ann-title">Announcements</div>
                <div className="cic-wayfind-ann-list">
                  {feed.announcements.map(a => <AnnouncementRow key={a.id} ann={a} />)}
                  {!feed.announcements.length && <div className="cic-empty-muted">No announcements</div>}
                </div>
              </aside>
            </div>
          </div>
          <TickerBar items={feed.ticker} />
        </>
      )}

      {/* Wayfinding portrait */}
      {layout === 'wayfinding' && showZones && portrait && (
        <>
          <ScreenHeader
            portrait
            brandTitle={wayfindingHeadings[headingIndex % wayfindingHeadings.length]}
            brandSub="Find your way"
            weatherIcon={feed.weather.icon}
            tempF={feed.weather.tempF}
            clock={clock}
            wayfindingHeading={wayfindingHeadings[headingIndex % wayfindingHeadings.length]}
          />
          <MediaCarousel
            media={feed.media}
            index={mediaIndex}
            imageSeconds={imageSeconds}
            onAdvance={advanceMedia}
            portrait
          />
          <div className="cic-portrait-section cic-wayfind-portrait-dir">
            <div className="cic-railhd tight">Directory</div>
            <WayfindingDirectory entries={feed.wayfinding} portrait prominent />
            {visitor && <WayfindingVisitorWelcome visitor={visitor} portrait />}
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
          imageSeconds={imageSeconds}
          onAdvance={advanceMedia}
          fill
        />
      )}
      </div>
    </div>
  )
}
