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
          <div class="cal-sub"><span class="cal-dot" style="background:${esc(it.accent)}"></span>${esc(it.typeLabel)}</div>
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
  primary: string // site brand dark — day number + band
  bandFrom: string // band gradient start
  bandTo: string // band gradient end
  accent: string // pill background
  pillText: string // readable text on the pill
  highlight: string // "Today is" + month (readable on the light card)
  logoDataUri: string | null // inlined site logo for the band
  fallbackText: string // shown in the band when there is no logo
}

export function buildNationalDayHtml(p: NationalDayParams): string {
  const logo = p.logoDataUri
    ? `<div class="logo-chip"><img src="${esc(p.logoDataUri)}" alt=""></div>`
    : `<div class="fallback">${esc(p.fallbackText)}</div>`
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;font-family:'Barlow',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}
  body{background:#f4f5f9}
  #app{width:100vw;height:100vh;display:flex;flex-direction:column}
  .stage{flex:1;display:flex;align-items:center;justify-content:center;gap:4vw;padding:6vh 8vw 3vh}
  .cal{flex:0 0 auto;width:26vh;background:#fff;border-radius:3vh;box-shadow:0 2vh 5vh rgba(20,30,60,0.16);overflow:hidden;border:0.3vh solid #eef0f6}
  .cal-top{position:relative;height:5vh;background:#fff;border-bottom:0.3vh solid #eef0f6}
  .cal-top::before,.cal-top::after{content:'';position:absolute;top:-1.6vh;width:1.2vh;height:3.4vh;border-radius:1vh;background:${esc(p.primary)};border:0.3vh solid #fff}
  .cal-top::before{left:32%}.cal-top::after{right:32%}
  .cal-mo{text-align:center;font-size:4.4vh;font-weight:800;letter-spacing:0.2vw;color:${esc(p.highlight)};padding:1.2vh 0 0.4vh}
  .cal-day{text-align:center;font-size:12vh;font-weight:800;line-height:0.9;color:${esc(p.primary)};padding:0 0 2.4vh}
  .msg{flex:1;min-width:0}
  .msg .eyebrow{font-size:3.4vh;font-weight:800;letter-spacing:0.15vw;text-transform:uppercase;color:${esc(p.highlight)};margin-bottom:0.6vh}
  .msg .name{font-size:${p.nameFontVh}vh;font-weight:800;line-height:1.04;color:#20233a;letter-spacing:-0.02vw}
  .band{flex:0 0 auto;height:26vh;background:linear-gradient(120deg,${esc(p.bandFrom)} 0%,${esc(p.bandTo)} 100%);border-radius:14vh 14vh 0 0;display:flex;align-items:center;justify-content:space-between;padding:0 6vw;position:relative}
  .band .left{color:rgba(255,255,255,0.82);font-size:1.9vh;font-weight:700;line-height:1.35;max-width:22vw}
  .band .center{position:absolute;left:50%;top:50%;transform:translate(-50%,-56%);text-align:center}
  .band .pill{display:inline-block;background:${esc(p.accent)};color:${esc(p.pillText)};font-size:2.4vh;font-weight:800;letter-spacing:0.2vw;text-transform:uppercase;padding:1vh 2.6vw;border-radius:6vh;box-shadow:0 1vh 3vh rgba(0,0,0,0.18);margin-bottom:1vh}
  .band .big{font-size:6.4vh;font-weight:800;letter-spacing:0.35vw;text-transform:uppercase;color:#fff;line-height:1}
  .logo-chip{background:#fff;border-radius:1.4vh;padding:1.4vh 1.8vw;display:flex;align-items:center;box-shadow:0 1vh 3vh rgba(0,0,0,0.18)}
  .logo-chip img{max-height:7vh;max-width:12vw;object-fit:contain;display:block}
  .fallback{color:#fff;font-size:2.2vh;font-weight:800;letter-spacing:0.06vw;text-align:right;max-width:16vw;line-height:1.15}
</style></head>
<body><div id="app">
  <div class="stage">
    <div class="cal">
      <div class="cal-top"></div>
      <div class="cal-mo">${esc(p.month)}</div>
      <div class="cal-day">${esc(p.day)}</div>
    </div>
    <div class="msg">
      <div class="eyebrow">Today is</div>
      <div class="name">${esc(p.name)}</div>
    </div>
  </div>
  <div class="band">
    <div class="left">Check back tomorrow<br>to see what&rsquo;s new!</div>
    <div class="center"><div class="pill">National Day</div><div class="big">Calendar</div></div>
    <div class="right">${logo}</div>
  </div>
</div></body></html>`
}

// ── Website preview ─────────────────────────────────────────────────────────
// Renders a live district web page full-bleed. NOTE: only works for pages that
// permit being embedded in a frame (no X-Frame-Options / frame-ancestors block).
export function buildWebsiteEmbedHtml(url: string): string {
  const safe = esc(url)
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#0b0e13;overflow:hidden}iframe{border:0;width:100vw;height:100vh;display:block}</style></head>
<body><iframe src="${safe}" scrolling="no" referrerpolicy="no-referrer"></iframe></body></html>`
}
