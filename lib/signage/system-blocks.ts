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

function ndLum(hex: string): number {
  const m = (hex || '').replace('#', '')
  const f = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  if (f.length < 6) return 0.5
  return (0.299 * parseInt(f.slice(0, 2), 16) + 0.587 * parseInt(f.slice(2, 4), 16) + 0.114 * parseInt(f.slice(4, 6), 16)) / 255
}

export function buildNationalDayHtml(p: NationalDayParams): string {
  const onP = ndLum(p.primary) > 0.62 ? '#0b0e13' : '#ffffff'
  const footLogo = p.logoDataUri ? `<img class="logo" src="${esc(p.logoDataUri)}" alt="">` : '<span></span>'
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;background:#0f1319;color:#f0f4ff;font-family:'Barlow',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}
  #app{display:grid;grid-template-columns:37% 1fr;width:100vw;height:100vh}
  .cal{background:${esc(p.primary)};color:${onP};display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden}
  .cal::before{content:'';position:absolute;top:0;left:0;right:0;height:8vh;background:rgba(0,0,0,0.17)}
  .ring{position:absolute;top:3vh;width:1.5vh;height:5vh;border-radius:1vh;background:${onP};opacity:0.9}
  .ring.l{left:31%}.ring.r{right:31%}
  .cal .mo{position:relative;font-size:6vh;font-weight:800;letter-spacing:0.3vw;text-transform:uppercase;line-height:1;margin-top:2vh}
  .cal .dy{font-size:30vh;font-weight:800;line-height:0.8;letter-spacing:-0.6vw}
  .side{position:relative;display:flex;flex-direction:column;padding:5.5vh 5.5vw}
  .side::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 75% 65% at 92% 8%, ${esc(p.accent)}1f, transparent 60%);pointer-events:none}
  .side header{position:relative;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
  .side header .who{font-size:2.1vh;font-weight:800;color:#f0f4ff;letter-spacing:0.03vw}
  .side header .date{font-size:1.9vh;font-weight:700;letter-spacing:0.16vw;text-transform:uppercase;color:#8a99b5}
  .hero{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center}
  .hero .eyebrow{display:inline-flex;align-items:center;gap:1.1vw;font-size:2.9vh;font-weight:800;letter-spacing:0.24vw;text-transform:uppercase;color:${esc(p.accent)};margin-bottom:1.8vh}
  .hero .eyebrow::before{content:'';width:4.5vw;height:0.55vh;background:${esc(p.accent)};border-radius:1vh}
  .hero .name{font-size:${p.nameFontVh}vh;font-weight:800;line-height:1.02;letter-spacing:-0.03vw;color:#fff}
  .hero .sub{font-size:2.4vh;font-weight:600;color:#8a99b5;margin-top:2.6vh}
  .side footer{position:relative;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
  .side footer .logo{max-height:6.4vh;max-width:15vw;object-fit:contain;background:#fff;border-radius:1.1vh;padding:0.9vh 1.1vw}
  .side footer .tag{font-size:1.6vh;font-weight:800;letter-spacing:0.3vw;text-transform:uppercase;color:#61708c}
</style></head>
<body><div id="app">
  <div class="cal">
    <span class="ring l"></span><span class="ring r"></span>
    <div class="mo">${esc(p.month)}</div>
    <div class="dy">${esc(p.day)}</div>
  </div>
  <div class="side">
    <header><span class="who">${esc(p.fallbackText)}</span><span class="date">${esc(p.dateLine)}</span></header>
    <div class="hero">
      <span class="eyebrow">Today is</span>
      <div class="name">${esc(p.name)}</div>
      <div class="sub">A little something to celebrate — check back tomorrow for a new one.</div>
    </div>
    <footer>${footLogo}<span class="tag">National Day Calendar</span></footer>
  </div>
</div></body></html>`
}

// ── Website preview ─────────────────────────────────────────────────────────
// Renders a live district web page full-bleed. NOTE: only works for pages that
// permit being embedded in a frame (no X-Frame-Options / frame-ancestors block).
export function buildWebsiteEmbedHtml(url: string): string {
  const safe = esc(url)
  // Preview-only embed (dashboard). On real screens the website is rendered as a
  // distinct `type:'website'` media item in a direct iframe at the zone's native
  // size. Here we mirror that: fill the zone 1:1 and give the inner frame a
  // permissive sandbox so SPAs (which need same-origin to boot) actually render
  // instead of showing blank.
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0}
  html,body{width:100%;height:100%;background:#0b0e13;overflow:hidden}
  iframe{border:0;display:block;width:100vw;height:100vh}
</style></head>
<body><iframe src="${safe}" scrolling="no" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"></iframe></body></html>`
}
