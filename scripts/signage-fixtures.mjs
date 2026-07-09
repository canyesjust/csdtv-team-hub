// Shared fixtures for the signage golden-master harnesses (baked HTML + React).
export function baseFeed(layout, orientation = 'landscape') {
  return {
    screen: {
      name: 'West Front Entrance', code: 'westfront', orientation, layout,
      heading: null,
      area: { name: 'West Front', slug: 'west-front', building: 'Main', floor: 1 },
      center_name: 'Canyons Innovation Center', theme: 'primary',
      colors: { bg: '#162844', panel: '#1e3649', accent: '#96b7c8' },
      brand_title: 'CIC', brand_subtitle: 'Canyons Innovation Center',
      logo_url: 'https://example.org/logo.png',
    },
    template: { show_weather: true, show_clock: true, show_ticker: true, show_visitor_welcome: true },
    media: [
      { id: 'm1', type: 'image', title: 'Welcome', url: 'https://example.org/a.jpg', html: null, full_screen: false, display_seconds: 10 },
      { id: 'm2', type: 'html', title: null, url: '', html: '<h1>Hi</h1>', full_screen: false, display_seconds: 8 },
    ],
    announcements: [
      { id: 'a1', title: 'Picture Day', subtitle: 'Wear your best', in_ticker: true, icon: 'star', scope_label: 'All', all_screens: true },
      { id: 'a2', title: 'Late Start', subtitle: null, in_ticker: false, icon: 'clock', scope_label: null, all_screens: false },
    ],
    ticker: ['Go Cougars', 'Spirit week is here'],
    wayfinding: [
      { id: 'w1', destination: 'Front Office', direction: 'left' },
      { id: 'w2', destination: 'Gym', direction: 'right' },
    ],
    visitors: [{ id: 'v1', name: 'Dr. Smith', note: 'Room 204' }],
    live: { live: false },
    weather: { tempF: 72, condition: 'Sunny', icon: '☀', high: 80, low: 55, windMph: 6 },
    spotlight: [{ id: 's1', title: 'Board Recap', thumb: 'https://example.org/t.jpg', kind: 'news', views: 120, duration: '3:20' }],
    csdtv_live: null,
    news: [{ title: 'District wins award', image: 'https://example.org/n.jpg' }],
    closures: [{ date: '2026-07-24', label: 'Pioneer Day' }],
    board_next: { date: 'Jul 15', time: '6:00 PM', title: 'Board Meeting' },
  }
}

export const CASES = [
  ['zoned-landscape', baseFeed('zoned')],
  ['zoned-portrait', baseFeed('zoned', 'portrait')],
  ['zoned2-landscape', baseFeed('zoned2')],
  ['full_bleed-landscape', baseFeed('full_bleed')],
  ['wayfinding-landscape', baseFeed('wayfinding')],
  // State variants on the live layout (zoned2) so the gate covers the markup
  // paths a plain feed never exercises: live takeover, board takeover, empties.
  ['zoned2-live', liveFeed('zoned2')],
  ['zoned2-board', boardFeed('zoned2')],
  ['zoned2-empty', emptyFeed('zoned2')],
  ['zoned-empty', emptyFeed('zoned')],
  // Layout builder: a non-default arrangement (Directions in the middle rail cell,
  // Announcements in the bottom band). Exercises the config-driven zone rendering.
  ['zoned2-custom', customZoneFeed()],
]

function customZoneFeed() {
  const f = baseFeed('zoned2')
  f.screen.zone_config = { railTop: 'brand', railMid: 'directions', railBottom: 'board', band: 'announcements' }
  return f
}

/** A feed with a live CSDtv stream taking over the screen. */
function liveFeed(layout) {
  const f = baseFeed(layout)
  f.live = { live: true, hls_url: 'https://example.org/live.m3u8', label: 'CSDtv Live' }
  return f
}

/** A feed with a board-meeting takeover (preroll graphics). */
function boardFeed(layout) {
  const f = baseFeed(layout)
  f.board_takeover = { mode: 'preroll', url: 'https://example.org/board.png', audio: false, label: 'Board Meeting' }
  return f
}

/** A feed with everything empty — exercises the empty-state markup. */
function emptyFeed(layout) {
  const f = baseFeed(layout)
  f.media = []; f.announcements = []; f.ticker = []; f.wayfinding = []; f.visitors = []
  f.spotlight = []; f.news = []; f.closures = []; f.board_next = null; f.csdtv_live = null
  f.weather = { tempF: null, condition: 'Weather unavailable', icon: '🌤', high: null, low: null, windMph: null }
  return f
}
