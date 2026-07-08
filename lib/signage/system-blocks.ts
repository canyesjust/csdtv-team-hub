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
