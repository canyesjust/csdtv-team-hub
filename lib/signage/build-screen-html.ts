import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildScreenFeed, type ScreenFeedPayload } from './build-screen-feed'
import { announcementIconEmoji } from './announcement-icons'
import { SCREEN_INLINE_CSS } from './screen-inline-css.generated'
import { WAYFINDING_ARROWS, type WayfindingDirection } from './constants'

/**
 * Self-contained HTML render pipeline for the AbleSign HTML web app changeover.
 *
 * `buildScreenHtml` reuses the exact same feed that powers
 * `app/signage/screen/[code]` (via `buildScreenFeed`), then emits ONE inlined
 * HTML document with zero external dependencies:
 *   - all CSS inlined (verbatim copy of the locked /signage grid)
 *   - all images fetched server-side and embedded as compressed base64 data URIs
 *   - system fonts only
 *   - feed data baked into a <script> block
 *   - clock + slide rotation + wayfinding heading rotation as vanilla JS over the
 *     baked data, with NO network calls
 *
 * Deliberately excluded (these need a live connection and have no offline value):
 *   - video slides (video stays native AbleSign media, sequenced in the playlist)
 *   - live HLS / board-meeting takeover (stream-dependent)
 *
 * The document downloads to the AbleSign stick and plays from local storage, so it
 * survives a network outage. It refreshes only when the Hub re-pushes.
 */

type Feed = ScreenFeedPayload

const CROSSFADE_MS = 700
const HEADING_ROTATE_MS = 3500
const DEFAULT_IMAGE_SECONDS = 10

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---------------------------------------------------------------------------
// Asset inlining (server-side fetch + compress → data URI)
// ---------------------------------------------------------------------------

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  } catch {
    return null
  }
}

async function imageToDataUri(
  url: string,
  opts: { maxWidth: number; quality: number },
): Promise<string | null> {
  if (!url || url.startsWith('data:')) return url || null
  const buf = await fetchBuffer(url)
  if (!buf) return null
  try {
    const out = await sharp(buf)
      .rotate()
      .resize({ width: opts.maxWidth, withoutEnlargement: true })
      .jpeg({ quality: opts.quality, mozjpeg: true })
      .toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    return null
  }
}

async function logoToDataUri(url: string): Promise<string | null> {
  if (!url || url.startsWith('data:')) return url || null
  const buf = await fetchBuffer(url)
  if (!buf) return null
  try {
    // Keep PNG so logo transparency survives.
    const out = await sharp(buf)
      .resize({ width: 220, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer()
    return `data:image/png;base64,${out.toString('base64')}`
  } catch {
    return null
  }
}

/** Inline any external <img src="http..."> inside a sanitized HTML slide body. */
async function inlineHtmlImages(html: string): Promise<string> {
  const srcs = new Set<string>()
  const re = /<img[^>]+src=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (/^https?:\/\//i.test(m[1])) srcs.add(m[1])
  }
  if (!srcs.size) return html
  let out = html
  for (const src of srcs) {
    const dataUri = await imageToDataUri(src, { maxWidth: 1280, quality: 72 })
    if (dataUri) out = out.split(src).join(dataUri)
  }
  return out
}

/** Replace every external asset URL in the feed with an inlined data URI. */
async function inlineFeedAssets(feed: Feed): Promise<Feed> {
  const next: Feed = JSON.parse(JSON.stringify(feed))

  if (next.screen.logo_url) {
    next.screen.logo_url = (await logoToDataUri(next.screen.logo_url)) ?? null
  }

  next.media = await Promise.all(
    next.media.map(async item => {
      if (item.type === 'image' && item.url) {
        const dataUri = await imageToDataUri(item.url, { maxWidth: 1600, quality: 74 })
        return { ...item, url: dataUri ?? '' }
      }
      if (item.type === 'html' && item.html) {
        return { ...item, html: await inlineHtmlImages(item.html) }
      }
      return item
    }),
  )

  return next
}

// ---------------------------------------------------------------------------
// Markup helpers (mirror app/signage/screen/[code]/ScreenClient.tsx)
// ---------------------------------------------------------------------------

function confettiIcon(): string {
  return '<span class="cic-confetti-icon" aria-hidden>✦</span>'
}

function screenLogo(src: string | null, portrait = false): string {
  if (!src) return ''
  return `<div class="cic-logo${portrait ? ' portrait' : ''}"><img src="${esc(src)}" alt=""></div>`
}

function weatherBlock(icon: string, tempF: number | null, portrait = false): string {
  const temp = tempF != null ? `<span>${esc(tempF)}°</span>` : ''
  return `<div class="cic-wx${portrait ? ' portrait' : ''}"><span aria-hidden>${esc(icon)}</span>${temp}</div>`
}

/** Clock container — filled and ticked by baked JS. */
function clockBlock(): string {
  return '<div class="cic-clk" data-clock></div>'
}

function screenHeader(opts: {
  portrait?: boolean
  brandTitle: string
  brandSub: string
  weatherIcon: string
  tempF: number | null
  wayfindingHeading?: string | null
  logoUrl: string | null
  showWeather: boolean
  showClock: boolean
}): string {
  const p = opts.portrait ? ' portrait' : ''
  const title = opts.wayfindingHeading ?? opts.brandTitle
  const sub = opts.wayfindingHeading ? 'Find your way' : opts.brandSub
  const headingAttr = opts.wayfindingHeading != null ? ' data-wayheading' : ''
  return (
    `<div class="cic-tvhead${p}">` +
    `<div class="cic-head-left${p}">${screenLogo(opts.logoUrl, opts.portrait)}` +
    `<div><div class="cic-brand${p}"${headingAttr}>${esc(title)}</div>` +
    `<div class="cic-brandsub${p}">${esc(sub)}</div></div></div>` +
    `<div class="cic-head-right">` +
    `${opts.showWeather ? weatherBlock(opts.weatherIcon, opts.tempF, opts.portrait) : ''}` +
    `${!opts.portrait && opts.showClock ? clockBlock() : ''}` +
    `</div></div>`
  )
}

function zonedHeader(opts: {
  centerName: string
  areaLabel: string
  weatherIcon: string
  tempF: number | null
  visitor?: Feed['visitors'][number]
  logoUrl: string | null
  showWeather: boolean
  showClock: boolean
}): string {
  const welcome = opts.visitor
    ? `Welcome, <b>${esc(opts.visitor.name)}</b>${opts.visitor.note ? `<span class="cic-zhead-note"> — ${esc(opts.visitor.note)}</span>` : ''}`
    : `Welcome to <b>${esc(opts.centerName)}</b>`
  return (
    `<div class="cic-tvhead cic-zhead">` +
    `<div class="cic-zhead-id">${screenLogo(opts.logoUrl)}<span class="cic-zhead-area">${esc(opts.areaLabel)}</span></div>` +
    `<div class="cic-zhead-welcome">${confettiIcon()}<span>${welcome}</span></div>` +
    `<div class="cic-head-right">` +
    `${opts.showWeather ? weatherBlock(opts.weatherIcon, opts.tempF) : ''}` +
    `${opts.showClock ? clockBlock() : ''}` +
    `</div></div>`
  )
}

function welcomeStrip(visitor: Feed['visitors'][number], portrait = false): string {
  const suffix = visitor.note ? ` — ${esc(visitor.note)}` : ' — thanks for visiting today'
  return `<div class="cic-welcome${portrait ? ' portrait' : ''}">${confettiIcon()}<span>Welcome, <b>${esc(visitor.name)}</b>${suffix}</span></div>`
}

function tickerBar(opts: {
  items: string[]
  portrait?: boolean
  show: boolean
  pill: string
  fallback: string
}): string {
  if (!opts.show) return ''
  const text = opts.items.length ? opts.items.join('   •   ') : opts.fallback
  return (
    `<div class="cic-ticker${opts.portrait ? ' portrait' : ''}">` +
    `<span class="cic-ticker-pill" aria-hidden>${esc(opts.pill)}</span>` +
    `<div class="cic-ticker-scroll"><div class="cic-tickin">${esc(text)}</div></div></div>`
  )
}

function announcementRow(ann: Feed['announcements'][number]): string {
  const scope = ann.scope_label ? `<span class="cic-spill">${esc(ann.scope_label)}</span>` : ''
  const sub = ann.subtitle ? `<div class="cic-annsub">${esc(ann.subtitle)}</div>` : ''
  return (
    `<div class="cic-ann"><span class="cic-ann-icon" aria-hidden>${esc(announcementIconEmoji(ann.icon))}</span>` +
    `<div><div class="cic-anntop">${esc(ann.title)}${scope}</div>${sub}</div></div>`
  )
}

function wayfindingDirectory(
  entries: Feed['wayfinding'],
  opts: { portrait?: boolean; compact?: boolean; prominent?: boolean } = {},
): string {
  const className = ['cic-dir', opts.portrait ? 'portrait' : '', opts.compact ? 'compact' : '', opts.prominent ? 'prominent' : '']
    .filter(Boolean)
    .join(' ')
  if (!entries.length) {
    return `<div class="${className}"><div class="cic-empty-muted">Directory coming soon</div></div>`
  }
  const rows = entries
    .map(w => {
      const arrow = WAYFINDING_ARROWS[w.direction as WayfindingDirection] || '→'
      const rowClass = opts.prominent ? 'cic-dir-card' : 'cic-dir-row cic-dir-row-compact'
      const badgeClass = `cic-dir-arrow-badge${opts.prominent ? ' hero' : ' compact'}`
      const labelClass = opts.prominent ? 'cic-dir-label' : 'cic-dir-label-compact'
      return `<div class="${rowClass}"><span class="${badgeClass}" aria-hidden>${esc(arrow)}</span><span class="${labelClass}">${esc(w.destination)}</span></div>`
    })
    .join('')
  return `<div class="${className}">${rows}</div>`
}

function wayfindingVisitorWelcome(visitor: Feed['visitors'][number], portrait = false): string {
  const suffix = visitor.note ? ` — ${esc(visitor.note)}` : ' — thanks for visiting today'
  return `<div class="cic-wayfind-welcome${portrait ? ' portrait' : ''}">${confettiIcon()}<span>Welcome, <b>${esc(visitor.name)}</b>${suffix}</span></div>`
}

function announcementsRail(
  announcements: Feed['announcements'],
  wayfinding: Feed['wayfinding'],
): string {
  const annRows = announcements.map(announcementRow).join('')
  const annEmpty = announcements.length ? '' : '<div class="cic-empty-muted">No announcements</div>'
  const dir =
    wayfinding.length > 0
      ? `<div class="cic-rail cic-rail-dir"><div class="cic-railhd">Directory</div>${wayfindingDirectory(wayfinding, { compact: true })}</div>`
      : ''
  return (
    `<div class="cic-railcol"><div class="cic-rail cic-rail-ann"><div class="cic-railhd">Announcements</div>` +
    `${annRows}${annEmpty}</div>${dir}</div>`
  )
}

/** One media slide's inner content (image or sanitized html; video is excluded). */
function slideInner(item: Feed['media'][number]): string {
  if (item.type === 'image' && item.url) {
    return `<img src="${esc(item.url)}" alt="${esc(item.title || '')}">`
  }
  if (item.type === 'html' && item.html) {
    return `<div class="cic-html-slide">${item.html}</div>`
  }
  return ''
}

function mediaCarousel(
  media: Feed['media'],
  opts: { fill?: boolean; portrait?: boolean; wayfindMedia?: boolean } = {},
): string {
  const className = ['cic-media16', opts.fill ? 'fill' : '', opts.portrait && !opts.fill ? 'portrait-top' : '', opts.wayfindMedia ? 'wayfind-media' : '']
    .filter(Boolean)
    .join(' ')
  const first = media[0]
  const layer = first
    ? `<div class="cic-media-layer">${slideInner(first)}</div>`
    : '<div class="cic-media-overlay"><div class="cic-msub">No media scheduled</div></div>'
  const dots =
    media.length > 1
      ? `<div class="cic-dots" data-dots>${media.map((m, i) => `<span class="cic-dot${i === 0 ? ' on' : ''}"></span>`).join('')}</div>`
      : ''
  const prog =
    media.length > 1
      ? `<div class="cic-mediaprog" aria-hidden><span class="cic-mediaprog-fill" data-prog style="animation-duration:${Math.max(3, first?.display_seconds ?? DEFAULT_IMAGE_SECONDS)}s"></span></div>`
      : ''
  return `<div class="${className}" data-carousel style="--crossfade-ms:${CROSSFADE_MS}ms">${layer}${dots}${prog}</div>`
}

// ---------------------------------------------------------------------------
// Theme / color vars (mirror siteColorVars + ensureDarkBg)
// ---------------------------------------------------------------------------

function ensureDarkBg(hex: string): string {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  if (full.length !== 6) return hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 110 ? `color-mix(in srgb, ${hex} 52%, #0a0a0a)` : hex
}

function siteStyleAttr(colors: Feed['screen']['colors']): string {
  if (!colors?.bg) return ''
  const bg = ensureDarkBg(colors.bg)
  const parts = [`--navy:${bg}`, `--panel:${colors.panel || `color-mix(in srgb, ${bg} 78%, #ffffff)`}`]
  if (colors.accent) parts.push(`--accent:${colors.accent}`)
  return ` style="${parts.join(';')}"`
}

// ---------------------------------------------------------------------------
// Body composition (mirror the layout branches in ScreenClient.tsx)
// ---------------------------------------------------------------------------

function composeBody(feed: Feed): string {
  const s = feed.screen
  const portrait = s.orientation === 'portrait'
  const layout = s.layout ?? 'zoned'
  const tpl = feed.template
  const showWeather = tpl?.show_weather !== false
  const showClock = tpl?.show_clock !== false
  const showTicker = tpl?.show_ticker !== false
  const showVisitor = tpl?.show_visitor_welcome !== false
  const visitor = showVisitor ? feed.visitors[0] : undefined

  const areaLabel = s.area?.name || s.name
  const centerSub = s.center_name === 'Canyons Innovation Center' ? 'Innovation Center' : s.center_name
  const brandTitle = s.brand_title || s.name
  const brandSub = s.brand_subtitle || centerSub
  const tickerPill =
    (s.brand_title || s.center_name || 'CIC')
      .split(/\s+/)
      .map(w => w[0])
      .join('')
      .slice(0, 4)
      .toUpperCase() || 'CIC'
  const tickerFallback = s.center_name
  const weatherIcon = feed.weather.icon
  const tempF = feed.weather.tempF

  const currentMedia = feed.media[0]
  const takeoverContent = !!currentMedia?.full_screen
  const ticker = tickerBar({ items: feed.ticker, portrait, show: showTicker, pill: tickerPill, fallback: tickerFallback })

  // Full-screen content takeover (image/html only) — overrides the zoned layout.
  if (takeoverContent) {
    return mediaCarousel(feed.media, { fill: true })
  }

  if (layout === 'full_bleed') {
    const welchip = visitor ? `<div class="cic-welchip">${confettiIcon()} Welcome ${esc(visitor.name)}</div>` : ''
    return (
      `<div class="cic-fill">${mediaCarousel(feed.media, { fill: true })}` +
      `<div class="cic-locchip">${esc(areaLabel)}</div>${welchip}</div>${ticker}`
    )
  }

  if ((layout === 'zoned' || layout === 'zoned2') && !portrait) {
    return (
      `<div class="cic-zoned-stage${layout === 'zoned2' ? ' cic-zoned2-stage' : ''}">` +
      zonedHeader({ centerName: s.center_name, areaLabel, weatherIcon, tempF, visitor, logoUrl: s.logo_url, showWeather, showClock }) +
      `<div class="cic-body">${mediaCarousel(feed.media)}${announcementsRail(feed.announcements, feed.wayfinding)}</div>` +
      `${ticker}</div>`
    )
  }

  if ((layout === 'zoned' || layout === 'zoned2') && portrait) {
    const annRows = feed.announcements.map(announcementRow).join('')
    const annEmpty = feed.announcements.length ? '' : '<div class="cic-empty-muted">No announcements</div>'
    const dir =
      feed.wayfinding.length > 0
        ? `<div class="cic-rail-divider"></div><div class="cic-railhd">Directory</div>${wayfindingDirectory(feed.wayfinding, { portrait: true, compact: true })}`
        : ''
    return (
      screenHeader({ portrait: true, brandTitle, brandSub, weatherIcon, tempF, logoUrl: s.logo_url, showWeather, showClock }) +
      `${visitor ? welcomeStrip(visitor, true) : ''}` +
      mediaCarousel(feed.media, { portrait: true }) +
      `<div class="cic-portrait-ann"><div class="cic-railhd">Announcements</div>${annRows}${annEmpty}${dir}</div>` +
      ticker
    )
  }

  if (layout === 'wayfinding' && !portrait) {
    const annRows = feed.announcements.map(announcementRow).join('')
    const annEmpty = feed.announcements.length ? '' : '<div class="cic-empty-muted">No announcements</div>'
    return (
      screenHeader({ brandTitle: s.heading || brandTitle, brandSub: 'Find your way', weatherIcon, tempF, wayfindingHeading: s.heading || brandTitle, logoUrl: s.logo_url, showWeather, showClock }) +
      `<div class="cic-body cic-body-wayfind">` +
      `<div class="cic-wayfind-dir"><div class="cic-railhd cic-wayfind-dir-title">Directory</div>` +
      `<div class="cic-wayfind-dir-scroll">${wayfindingDirectory(feed.wayfinding, { prominent: true })}</div>` +
      `${visitor ? wayfindingVisitorWelcome(visitor) : ''}</div>` +
      `<div class="cic-wayfind-side"><div class="cic-wayfind-media-wrap">${mediaCarousel(feed.media, { wayfindMedia: true })}</div>` +
      `<aside class="cic-wayfind-ann-rail" aria-label="Announcements"><div class="cic-railhd cic-wayfind-ann-title">Announcements</div>` +
      `<div class="cic-wayfind-ann-list">${annRows}${annEmpty}</div></aside></div></div>${ticker}`
    )
  }

  // wayfinding portrait
  if (layout === 'wayfinding' && portrait) {
    const annRows = feed.announcements.map(announcementRow).join('')
    return (
      screenHeader({ portrait: true, brandTitle: s.heading || brandTitle, brandSub: 'Find your way', weatherIcon, tempF, wayfindingHeading: s.heading || brandTitle, logoUrl: s.logo_url, showWeather, showClock }) +
      mediaCarousel(feed.media, { portrait: true }) +
      `<div class="cic-portrait-section cic-wayfind-portrait-dir"><div class="cic-railhd tight">Directory</div>${wayfindingDirectory(feed.wayfinding, { portrait: true, prominent: true })}${visitor ? wayfindingVisitorWelcome(visitor, true) : ''}</div>` +
      `<div class="cic-portrait-ann"><div class="cic-railhd">Announcements</div>${annRows}</div>` +
      ticker
    )
  }

  // Fallback (should be unreachable) — render the zoned landscape stage.
  return (
    `<div class="cic-zoned-stage">` +
    zonedHeader({ centerName: s.center_name, areaLabel, weatherIcon, tempF, visitor, logoUrl: s.logo_url, showWeather, showClock }) +
    `<div class="cic-body">${mediaCarousel(feed.media)}${announcementsRail(feed.announcements, feed.wayfinding)}</div></div>`
  )
}

// ---------------------------------------------------------------------------
// Baked runtime JS (clock + slide rotation + heading rotation; no network)
// ---------------------------------------------------------------------------

function runtimeScript(feed: Feed): string {
  // Only the data the runtime needs — keep the baked payload small.
  const data = {
    media: feed.media
      .filter(m => (m.type === 'image' && m.url) || (m.type === 'html' && m.html))
      .map(m => ({ type: m.type, url: m.url, html: m.html, display_seconds: m.display_seconds })),
    layout: feed.screen.layout,
    headings: (() => {
      const list: string[] = []
      if (feed.screen.heading) list.push(feed.screen.heading)
      const where = feed.screen.center_name?.trim() || 'campus'
      list.push(`Find your way around ${where}`)
      return list
    })(),
    crossfadeMs: CROSSFADE_MS,
    headingRotateMs: HEADING_ROTATE_MS,
    defaultSeconds: DEFAULT_IMAGE_SECONDS,
  }

  // The JSON is embedded inside a <script> tag — neutralize "</" so a value can
  // never close the script element early.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')

  return `<script>
(function(){
  var DATA = JSON.parse(${JSON.stringify(json)});

  // ---- Clock (always Mountain Time, never the device timezone) ----
  var clockEls = document.querySelectorAll('[data-clock]');
  function fmtClock(){
    try {
      return new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Denver'});
    } catch(e){
      return new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    }
  }
  function renderClock(){
    if(!clockEls.length) return;
    var parts = fmtClock().split(':');
    var html = '';
    for(var i=0;i<parts.length;i++){
      if(i>0) html += '<span class="cic-clk-colon">:</span>';
      html += '<span>'+parts[i]+'</span>';
    }
    for(var j=0;j<clockEls.length;j++){ clockEls[j].innerHTML = html; }
  }
  renderClock();
  setInterval(renderClock, 1000);

  // ---- Wayfinding heading rotation ----
  var headingEl = document.querySelector('[data-wayheading]');
  if(headingEl && DATA.layout === 'wayfinding' && DATA.headings.length > 1){
    var hi = 0;
    setInterval(function(){
      hi = (hi + 1) % DATA.headings.length;
      headingEl.textContent = DATA.headings[hi];
    }, DATA.headingRotateMs);
  }

  // ---- Media slide rotation (crossfade, dots, progress) ----
  var carousel = document.querySelector('[data-carousel]');
  var media = DATA.media;
  if(carousel && media.length > 1){
    var dotsWrap = carousel.querySelector('[data-dots]');
    var dots = dotsWrap ? dotsWrap.querySelectorAll('.cic-dot') : [];
    var index = 0;
    var advanceTimer = null;

    function slideMarkup(item){
      if(item.type === 'image' && item.url){
        var img = document.createElement('img');
        img.src = item.url; img.alt = '';
        return img;
      }
      var div = document.createElement('div');
      div.className = 'cic-html-slide';
      div.innerHTML = item.html || '';
      return div;
    }
    function setDots(){
      for(var i=0;i<dots.length;i++){
        if(i === index) dots[i].classList.add('on'); else dots[i].classList.remove('on');
      }
    }
    function restartProgress(item){
      var old = carousel.querySelector('[data-prog]');
      if(!old) return;
      var fresh = old.cloneNode(false);
      fresh.style.animationDuration = Math.max(3, item.display_seconds || DATA.defaultSeconds) + 's';
      old.parentNode.replaceChild(fresh, old);
    }
    function preload(item){
      if(item && item.type === 'image' && item.url){ var im = new Image(); im.src = item.url; }
    }
    function scheduleNext(item){
      if(advanceTimer) clearTimeout(advanceTimer);
      var secs = Math.max(3, item.display_seconds || DATA.defaultSeconds);
      advanceTimer = setTimeout(advance, secs * 1000);
    }
    function advance(){
      var from = index;
      var to = (index + 1) % media.length;
      var outLayer = carousel.querySelector('.cic-media-layer');
      // New incoming layer starts transparent, fades in over crossfadeMs.
      var inLayer = document.createElement('div');
      inLayer.className = 'cic-media-layer cic-media-layer--in';
      inLayer.appendChild(slideMarkup(media[to]));
      carousel.insertBefore(inLayer, outLayer.nextSibling);
      if(outLayer) outLayer.classList.add('cic-media-layer--out');
      // double rAF so the transition actually runs
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          inLayer.classList.add('is-fading');
          if(outLayer) outLayer.classList.add('is-fading');
        });
      });
      setTimeout(function(){
        if(outLayer && outLayer.parentNode) outLayer.parentNode.removeChild(outLayer);
        inLayer.className = 'cic-media-layer';
        index = to;
        setDots();
        restartProgress(media[index]);
        preload(media[(index + 1) % media.length]);
        scheduleNext(media[index]);
      }, DATA.crossfadeMs);
    }

    restartProgress(media[0]);
    preload(media[1]);
    scheduleNext(media[0]);
  }
})();
</script>`
}

// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------

function renderScreenDocument(feed: Feed): string {
  const s = feed.screen
  const portrait = s.orientation === 'portrait'
  const layout = s.layout ?? 'zoned'
  const screenClass = `cic-screen${portrait ? ' portrait' : ''} layout-${layout} cic-theme-${s.theme}`
  const background =
    '<div class="sig-glow" aria-hidden="true"><div class="sig-glow__blob sig-glow__b1"></div>' +
    '<div class="sig-glow__blob sig-glow__b2"></div><div class="sig-glow__blob sig-glow__b3"></div></div>'

  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${esc(s.name)} — ${esc(s.code)}</title>` +
    `<style>${SCREEN_INLINE_CSS}</style></head>` +
    `<body><div class="${screenClass}"${siteStyleAttr(s.colors)}>${background}` +
    `<div class="cic-screen-content">${composeBody(feed)}</div></div>` +
    runtimeScript(feed) +
    '</body></html>'
  )
}

/**
 * Build a self-contained HTML document for a screen, with all assets inlined.
 * Returns the HTML string and its byte size (UTF-8).
 */
export async function buildScreenHtml(
  service: SupabaseClient,
  code: string,
): Promise<{ html: string; bytes: number } | { error: 'not_found' | 'server_error' }> {
  const result = await buildScreenFeed(service, code)
  if ('error' in result) return { error: result.error }

  const inlined = await inlineFeedAssets(result.feed)
  const html = renderScreenDocument(inlined)
  const bytes = Buffer.byteLength(html, 'utf8')
  return { html, bytes }
}
