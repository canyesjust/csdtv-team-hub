// Renderers for stock/system signage blocks other than the broadcast board.
// Built server-side, script-free, self-contained. Injected into the feed's media
// rotation and scheduled/targeted like normal content.

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Calendar / agenda ───────────────────────────────────────────────────────
export type CalendarItem = {
  weekday: string // "TUE"
  day: string // "7"
  month: string // "JUL"
  timeLabel: string // "4:00 PM"
  title: string
  typeLabel: string // "Livestream" / "Board Meeting" / "Podcast" …
  accent: string // dot color for the type
}

export function buildCalendarBoardHtml(items: CalendarItem[], todayLabel: string): string {
  const rows = items.slice(0, 8).map(it => `
      <div class="cal-row">
        <div class="cal-date">
          <div class="cal-wd">${esc(it.weekday)}</div>
          <div class="cal-day">${esc(it.day)}</div>
          <div class="cal-mo">${esc(it.month)}</div>
        </div>
        <div class="cal-body">
          <div class="cal-title">${esc(it.title)}</div>
          ${it.typeLabel ? `<div class="cal-sub"><span class="cal-dot" style="background:${esc(it.accent)}"></span>${esc(it.typeLabel)}</div>` : ''}
        </div>
        <div class="cal-time">${esc(it.timeLabel)}</div>
      </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--red:#e8212a;--dark:#0b0e13;--card:#161b22;--border:rgba(255,255,255,0.08);--text:#f0f4ff;--muted:#8a99b5}
  html,body{width:100%;height:100%;background:var(--dark);color:var(--text);font-family:'Barlow',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}
  #app{width:100vw;height:100vh;display:flex;flex-direction:column;padding:4vh 4vw}
  header{display:flex;align-items:center;justify-content:space-between;padding-bottom:2.4vh;border-bottom:0.22vh solid var(--border);flex-shrink:0}
  .brand{display:flex;align-items:center;gap:1.5vw}
  .logo{background:var(--red);color:#fff;font-weight:800;letter-spacing:0.14vw;padding:1vh 1.5vw;border-radius:0.7vh;font-size:4vh;line-height:1}
  .htxt .eyebrow{font-size:1.6vh;font-weight:700;letter-spacing:0.35vw;text-transform:uppercase;color:var(--muted);margin-bottom:0.5vh}
  .htxt .title{font-size:3.8vh;font-weight:800;letter-spacing:0.06vw;line-height:1}
  .htxt .title span{color:var(--red)}
  .today{text-align:right;font-size:1.9vh;font-weight:700;letter-spacing:0.14vw;text-transform:uppercase;color:var(--muted)}
  #list{flex:1;display:flex;flex-direction:column;gap:1.4vh;padding-top:2.4vh;overflow:hidden;justify-content:flex-start}
  .cal-row{display:flex;align-items:center;gap:2vw;background:var(--card);border:0.2vh solid var(--border);border-radius:1.2vh;padding:1.6vh 2.2vw;flex:1 1 0;min-height:0;max-height:12vh}
  .cal-date{flex:0 0 auto;width:8vw;text-align:center;border-right:0.2vh solid var(--border);padding-right:1.4vw}
  .cal-wd{font-size:1.7vh;font-weight:700;letter-spacing:0.2vw;color:var(--red)}
  .cal-day{font-size:4.6vh;font-weight:800;line-height:1}
  .cal-mo{font-size:1.5vh;font-weight:700;letter-spacing:0.2vw;color:var(--muted)}
  .cal-body{flex:1;min-width:0}
  .cal-title{font-size:3vh;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cal-sub{display:flex;align-items:center;gap:0.7vw;font-size:1.9vh;font-weight:600;color:var(--muted);margin-top:0.6vh}
  .cal-dot{width:1.3vh;height:1.3vh;border-radius:50%;flex-shrink:0}
  .cal-time{flex:0 0 auto;font-size:2.8vh;font-weight:800;color:var(--text)}
  footer{flex-shrink:0;padding-top:2.2vh;text-align:center;font-size:1.6vh;font-weight:700;letter-spacing:0.3vw;text-transform:uppercase;color:var(--muted)}
</style></head>
<body><div id="app">
  <header>
    <div class="brand">
      <div class="logo">CSDtv</div>
      <div class="htxt"><div class="eyebrow">Canyons School District</div><div class="title">Coming up <span>this month</span></div></div>
    </div>
    <div class="today">${esc(todayLabel)}</div>
  </header>
  <div id="list">${rows || '<div style="color:var(--muted);font-size:2.4vh;padding:6vh 0;text-align:center">Nothing scheduled right now.</div>'}</div>
  <footer>Canyons School District · csdtv.org</footer>
</div></body></html>`
}

// ── National Day ────────────────────────────────────────────────────────────
export type NationalDayParams = {
  month: string // "MAR"
  day: string // "13"
  name: string // "National Good Samaritan Day"
  nameFontVh: number // adaptive size so long names still fit
  dateLine: string // "Wednesday, July 8"
  primary: string // reserved
  accent: string // site accent — highlights on the dark surface
  logoDataUri: string | null // inlined site logo (top-right)
  fallbackText: string // location name when no logo
}

export function buildNationalDayHtml(p: NationalDayParams): string {
  const a = p.accent
  const brand = p.logoDataUri
    ? `<div class="logo"><img src="${esc(p.logoDataUri)}" alt=""></div>`
    : `<div class="site">${esc(p.fallbackText)}</div>`
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;background:#0b0e13;color:#f0f4ff;font-family:'Barlow',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}
  body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 62% 60% at 16% 26%, ${esc(a)}26, transparent 60%),radial-gradient(ellipse 50% 45% at 92% 96%, ${esc(a)}12, transparent 60%);pointer-events:none}
  #app{position:relative;width:100vw;height:100vh;display:flex;flex-direction:column;padding:5vh 6vw}
  header{display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
  .logo{background:#fff;border-radius:1.2vh;padding:1vh 1.5vw;display:flex;align-items:center}
  .logo img{max-height:6vh;max-width:13vw;object-fit:contain;display:block}
  .site{font-size:2.2vh;font-weight:800;color:#f0f4ff;letter-spacing:0.04vw}
  .date{font-size:2vh;font-weight:700;letter-spacing:0.16vw;text-transform:uppercase;color:#8a99b5}
  .stage{flex:1;display:flex;align-items:center;gap:5vw}
  .cal{flex:0 0 auto;width:32vh;background:#12161d;border:0.3vh solid rgba(255,255,255,0.09);border-radius:2.6vh;overflow:hidden;text-align:center;box-shadow:0 2vh 6vh rgba(0,0,0,0.4)}
  .cal .bar{height:2.6vh;background:${esc(a)}}
  .cal .mo{font-size:4.8vh;font-weight:800;letter-spacing:0.2vw;color:${esc(a)};padding:2.2vh 0 0.2vh}
  .cal .dy{font-size:17vh;font-weight:800;line-height:0.82;color:#fff;padding:0 0 2.8vh}
  .msg{flex:1;min-width:0}
  .msg .eyebrow{font-size:3.4vh;font-weight:800;letter-spacing:0.2vw;text-transform:uppercase;color:${esc(a)};margin-bottom:1.2vh}
  .msg .name{font-size:${p.nameFontVh}vh;font-weight:800;line-height:1.03;color:#fff;letter-spacing:-0.02vw}
  .msg .sub{font-size:2.4vh;font-weight:700;letter-spacing:0.06vw;color:#8a99b5;margin-top:2vh}
  footer{flex-shrink:0;text-align:center;font-size:1.6vh;font-weight:700;letter-spacing:0.3vw;text-transform:uppercase;color:#6b7890}
</style></head>
<body><div id="app">
  <header>${brand}<div class="date">${esc(p.dateLine)}</div></header>
  <div class="stage">
    <div class="cal"><div class="bar"></div><div class="mo">${esc(p.month)}</div><div class="dy">${esc(p.day)}</div></div>
    <div class="msg">
      <div class="eyebrow">Today is</div>
      <div class="name">${esc(p.name)}</div>
      <div class="sub">Check back tomorrow for a new one</div>
    </div>
  </div>
  <footer>${esc(p.fallbackText)}</footer>
</div></body></html>`
}

// ── Website preview ─────────────────────────────────────────────────────────
// Renders a live district web page full-bleed. NOTE: only works for pages that
// permit being embedded in a frame (no X-Frame-Options / frame-ancestors block).
export function buildWebsiteEmbedHtml(url: string): string {
  const safe = esc(url)
  // Render the page at a desktop width inside the zone, then scale it down to
  // exactly fit the zone's width (via calc against 100vw of the slide's own
  // viewport). This shows the full-width layout instead of an oversized crop
  // that bleeds past the zone. overflow:hidden clips any height remainder.
  const DESKTOP_W = 1440
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0}
  html,body{width:100%;height:100%;background:#0b0e13;overflow:hidden}
  .wrap{position:absolute;inset:0;overflow:hidden}
  iframe{border:0;display:block;width:${DESKTOP_W}px;height:${Math.round(DESKTOP_W * 9 / 16)}px;transform-origin:top left;transform:scale(calc(100vw / ${DESKTOP_W}))}
</style></head>
<body><div class="wrap"><iframe src="${safe}" scrolling="no" referrerpolicy="no-referrer"></iframe></div></body></html>`
}
