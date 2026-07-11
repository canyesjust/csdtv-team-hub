import { NextResponse } from 'next/server'

/**
 * GET /api/catalog
 *
 * Live version catalog for the Blackmagic Update Checker desktop app.
 * Fetches Blackmagic Design's public download feed, picks the latest stable
 * (and latest beta) version per product, and merges it with the detection
 * metadata the app needs (Mac app-bundle names, Windows registry match strings,
 * download-page URLs) which the feed does not contain.
 *
 * The desktop app points its CATALOG_URL at this route, so version numbers stay
 * current with zero manual editing. Cached at the edge for 6h.
 */

const FEED_URL = 'https://www.blackmagicdesign.com/api/support/us/downloads.json'
const REVALIDATE_SECONDS = 21600 // 6 hours

// The current published version of the desktop app itself. Bump this when you
// ship a new Update Checker build. The app compares its own version to this and,
// if this is newer, shows a one-time notice with a download link. It never
// updates itself — that stays a conscious choice.
const APP_LATEST_VERSION = '1.2'
const APP_DOWNLOAD_URL = 'https://www.csdtvstaff.org/blackmagic-updater'

type FeedBuild = {
  product: string
  major: number
  minor: number
  releaseNum: number
  buildNum?: number
  beta?: number // 255 = final/stable; other = beta number
}

type FeedEntry = {
  name?: string
  desc?: string
  date?: string
  numericDate?: number
  urls?: Record<string, FeedBuild[]>
}

type Feed = { downloads?: FeedEntry[] }

type ProductTemplate = {
  id: string
  name: string
  family: string
  mac_app: string[]
  win_match: string[]
  slugs: string[]
  fallback: string
  url: string
  treatSdkAsStable?: boolean
}

// Detection metadata + feed matcher. `slugs` match each build's `product` slug.
// `fallback` is the last-known-good version used only if the feed lacks it.
const PRODUCTS: ProductTemplate[] = [
  { id: 'davinci_resolve', name: 'DaVinci Resolve / Studio', family: 'DaVinci Resolve and Fusion',
    mac_app: ['DaVinci Resolve.app'], win_match: ['DaVinci Resolve'],
    slugs: ['davinci-resolve', 'davinci-resolve-studio'], fallback: '21.0',
    url: 'https://www.blackmagicdesign.com/products/davinciresolve' },

  { id: 'fusion_studio', name: 'Fusion Studio', family: 'DaVinci Resolve and Fusion',
    mac_app: ['Fusion.app', 'Fusion Studio.app'], win_match: ['Fusion Studio', 'Blackmagic Fusion'],
    slugs: ['fusion-studio'], fallback: '21.0',
    url: 'https://www.blackmagicdesign.com/products/fusion' },

  { id: 'desktop_video', name: 'Desktop Video (DeckLink / UltraStudio drivers)', family: 'Capture and Playback',
    mac_app: ['Blackmagic Desktop Video Setup.app'], win_match: ['Desktop Video'],
    slugs: ['desktop-video'], fallback: '16.0.1',
    url: 'https://www.blackmagicdesign.com/support/family/capture-and-playback' },

  { id: 'atem_software_control', name: 'ATEM Software Control', family: 'ATEM Production Switchers',
    mac_app: ['ATEM Software Control.app', 'ATEM Setup.app'], win_match: ['ATEM Switchers', 'ATEM Software Control', 'ATEM Setup'],
    slugs: ['atem'], fallback: '10.2.1',
    url: 'https://www.blackmagicdesign.com/support/family/atem-live-production-switchers' },

  { id: 'camera_setup', name: 'Blackmagic Camera Setup', family: 'Professional Cameras',
    mac_app: ['Blackmagic Camera Setup.app'], win_match: ['Blackmagic Camera Setup', 'Camera Setup'],
    slugs: ['camera'], fallback: '10.2',
    url: 'https://www.blackmagicdesign.com/support/family/cameras' },

  { id: 'hyperdeck_setup', name: 'HyperDeck Setup', family: 'Disk Recorders',
    mac_app: ['Blackmagic HyperDeck Setup.app'], win_match: ['HyperDeck Setup'],
    slugs: ['hyperdeck'], fallback: '9.0.2',
    url: 'https://www.blackmagicdesign.com/support/family/capture-and-playback' },

  { id: 'video_assist_setup', name: 'Blackmagic Video Assist Setup', family: 'Disk Recorders',
    mac_app: ['Blackmagic Video Assist Setup.app'], win_match: ['Video Assist'],
    slugs: ['videoassist'], fallback: '3.22',
    url: 'https://www.blackmagicdesign.com/support/family/capture-and-playback' },

  { id: 'converters_setup', name: 'Blackmagic Converters Setup', family: 'Broadcast Converters',
    mac_app: ['Blackmagic Converter Setup.app', 'Blackmagic Converters Setup.app'], win_match: ['Converter Setup', 'Converters Setup'],
    slugs: ['converters'], fallback: '12.2.1',
    url: 'https://www.blackmagicdesign.com/support/family/capture-and-playback' },

  { id: 'ultimatte', name: 'Ultimatte Software / Setup', family: 'Ultimatte',
    mac_app: ['Ultimatte Software.app', 'Blackmagic Ultimatte Setup.app'], win_match: ['Ultimatte'],
    slugs: ['ultimatte'], fallback: '2.4.1',
    url: 'https://www.blackmagicdesign.com/support/family/ultimatte' },

  { id: 'smartview_setup', name: 'Blackmagic SmartView / SmartScope Setup', family: 'Monitoring',
    mac_app: ['Blackmagic SmartView Setup.app'], win_match: ['SmartView', 'SmartScope'],
    slugs: ['smartview'], fallback: '5.0.4',
    url: 'https://www.blackmagicdesign.com/support/family/video-audio-monitoring' },

  { id: 'videohub_setup', name: 'Videohub Control / Setup', family: 'Routing and Distribution',
    mac_app: ['Blackmagic Videohub Setup.app', 'Videohub Control.app'], win_match: ['Videohub'],
    slugs: ['videohub'], fallback: '11.0.1',
    url: 'https://www.blackmagicdesign.com/support/family/routing-and-distribution' },

  { id: 'web_presenter_setup', name: 'Web Presenter / Streaming Setup', family: 'Streaming and Encoding',
    mac_app: ['Blackmagic Web Presenter Setup.app', 'Blackmagic Streaming Setup.app'], win_match: ['Web Presenter', 'Streaming'],
    slugs: ['web-presenter'], fallback: '4.2.3',
    url: 'https://www.blackmagicdesign.com/support/family/streaming-and-encoding' },

  { id: 'cloud_store_setup', name: 'Blackmagic Cloud Store Setup', family: 'Network Storage',
    mac_app: ['Blackmagic Cloud Store Setup.app', 'Blackmagic Cloud Setup.app'], win_match: ['Cloud Store', 'Cloud Setup'],
    slugs: ['blackmagic-cloud-store'], fallback: '1.8.3',
    url: 'https://www.blackmagicdesign.com/support/family/network-storage' },

  { id: 'raw', name: 'Blackmagic RAW (Player / Speed Test / SDK)', family: 'Capture and Playback',
    mac_app: ['Blackmagic RAW Player.app', 'Blackmagic RAW Speed Test.app'], win_match: ['Blackmagic RAW'],
    slugs: ['braw-sdk', 'blackmagic-raw'], fallback: '5.1', treatSdkAsStable: true,
    url: 'https://www.blackmagicdesign.com/support/family/capture-and-playback' },
]

function formatVersion(b: FeedBuild): string {
  const parts: number[] = [b.major, b.minor, b.releaseNum]
  if (parts[2] === 0) parts.pop() // 21.0.0 -> "21.0", keep 16.0.1
  return parts.join('.')
}

function betaLabel(_entry: FeedEntry, b: FeedBuild): string {
  return `${formatVersion(b)} Beta ${b.beta}`
}

function matchingBuild(entry: FeedEntry, slugSet: Set<string>): FeedBuild | null {
  const urls = entry.urls || {}
  for (const os of Object.keys(urls)) {
    for (const b of urls[os] || []) {
      if (b && slugSet.has(b.product)) return b
    }
  }
  return null
}

export function buildCatalog(feed: Feed) {
  const downloads = feed?.downloads || []
  const products = PRODUCTS.map((p) => {
    const slugSet = new Set(p.slugs)
    let stable: string | null = null
    let stableDate = -1
    let notes = ''
    let releaseDate = ''
    let beta: string | null = null
    let betaDate = -1

    for (const entry of downloads) {
      const b = matchingBuild(entry, slugSet)
      if (!b) continue
      const date = entry.numericDate || 0
      const isSdkNoBeta = b.beta === undefined
      const isBeta = !isSdkNoBeta && b.beta !== 255

      if (!isBeta || (isSdkNoBeta && p.treatSdkAsStable)) {
        if (date > stableDate) {
          stable = formatVersion(b)
          stableDate = date
          notes = (entry.desc || '').trim()
          releaseDate = entry.date || ''
        }
      } else {
        if (date > betaDate) { beta = betaLabel(entry, b); betaDate = date }
      }
    }

    const latest = stable || p.fallback || ''
    const out: Record<string, unknown> = {
      id: p.id,
      name: p.name,
      family: p.family,
      mac_app: p.mac_app,
      win_match: p.win_match,
      latest: { windows: latest, macos: latest },
      verified: Boolean(stable),
      url: p.url,
    }
    if (beta) out.latest_beta = beta
    if (notes) out.notes = notes
    if (releaseDate) out.latest_date = releaseDate
    return out
  })

  return {
    _comment: 'Auto-generated from the blackmagicdesign.com download feed. Do not edit by hand.',
    _updated: new Date().toISOString().slice(0, 10),
    _source: 'live',
    app: { version: APP_LATEST_VERSION, download_url: APP_DOWNLOAD_URL },
    products,
  }
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const headers: Record<string, string> = {
    'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
  }

  try {
    const res = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'BMDUpdateChecker/1.0 (+catalog)' },
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`)
    const feed = (await res.json()) as Feed
    return NextResponse.json(buildCatalog(feed), { headers })
  } catch (err) {
    // Never fail hard: return fallback versions so the app still works offline.
    const catalog = buildCatalog({ downloads: [] }) as Record<string, unknown>
    catalog._source = 'fallback'
    catalog._error = err instanceof Error ? err.message : String(err)
    return NextResponse.json(catalog, { headers })
  }
}
