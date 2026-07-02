// Renders the digital-signage "Upcoming broadcasts" board as a self-contained,
// script-free HTML slide. It is built SERVER-SIDE with the data already filled
// in, so it needs no JavaScript (signage slides can't run scripts anyway) and
// stays offline-safe. The result is injected into the screen feed's media
// rotation like any other HTML slide, so both renderers display it unchanged.

export type BroadcastBoardItem = {
  title: string
  typeLabel: string // e.g. "Livestream" / "Board Meeting"
  dateLabel: string // e.g. "Thu, Jul 9"
  timeLabel: string // e.g. "6:00 PM"
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build the board slide. `items` should already be filtered (flagged, upcoming,
 * capped) and sorted soonest-first by the caller.
 */
export function buildBroadcastBoardHtml(items: BroadcastBoardItem[]): string {
  const RED = '#e8212a'
  const cards = items.slice(0, 8).map((it, i) => `
      <div class="bc-card">
        <div class="bc-index">${String(i + 1).padStart(2, '0')}</div>
        <div class="bc-body">
          <div class="bc-type">${esc(it.typeLabel)}</div>
          <div class="bc-name">${esc(it.title)}</div>
        </div>
        <div class="bc-when">
          <div class="bc-date">${esc(it.dateLabel)}</div>
          <div class="bc-time">${esc(it.timeLabel)}</div>
        </div>
      </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--red:${RED};--dark:#080a0e;--card:#11151b;--border:rgba(255,255,255,0.08);--text:#f0f4ff;--muted:#8090ab}
  html,body{width:100%;height:100%;background:var(--dark);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}
  #app{width:100vw;height:100vh;display:flex;flex-direction:column;padding:4.5vh 5vw}
  header{display:flex;align-items:center;justify-content:space-between;padding-bottom:2.6vh;border-bottom:0.25vh solid var(--border);flex-shrink:0}
  .brand{display:flex;align-items:center;gap:2vw}
  .logo{background:var(--red);color:#fff;font-weight:800;letter-spacing:0.15vw;padding:1vh 1.6vw;border-radius:0.6vh;font-size:4.2vh;line-height:1}
  .head-txt .eyebrow{font-size:1.7vh;font-weight:600;letter-spacing:0.4vw;text-transform:uppercase;color:var(--muted);margin-bottom:0.5vh}
  .head-txt .title{font-size:4.2vh;font-weight:800;letter-spacing:0.1vw;line-height:1}
  .head-txt .title span{color:var(--red)}
  .live{display:flex;align-items:center;gap:1vw;background:rgba(232,33,42,0.12);border:0.2vh solid rgba(232,33,42,0.35);border-radius:6vh;padding:1.3vh 2vw;font-size:1.9vh;font-weight:700;letter-spacing:0.25vw;text-transform:uppercase;color:#ff5760}
  .live .dot{width:1.5vh;height:1.5vh;border-radius:50%;background:var(--red)}
  #list{flex:1;display:flex;flex-direction:column;gap:1.6vh;padding-top:3vh;overflow:hidden}
  .bc-card{display:flex;align-items:center;background:var(--card);border:0.2vh solid var(--border);border-left:0.6vh solid var(--red);border-radius:1.2vh;padding:2.2vh 2.4vw;gap:2vw;flex:1;min-height:0}
  .bc-index{font-size:3.4vh;font-weight:800;color:var(--red);opacity:0.5;flex:0 0 auto;width:4vw}
  .bc-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:0.8vh}
  .bc-type{font-size:1.7vh;font-weight:700;letter-spacing:0.3vw;text-transform:uppercase;color:var(--muted)}
  .bc-name{font-size:3.4vh;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bc-when{flex:0 0 auto;text-align:right}
  .bc-date{font-size:2.8vh;font-weight:700;color:var(--text)}
  .bc-time{font-size:2.2vh;font-weight:600;color:var(--red)}
  footer{flex-shrink:0;padding-top:2.4vh;text-align:center;font-size:1.7vh;font-weight:600;letter-spacing:0.3vw;text-transform:uppercase;color:var(--muted)}
  footer span{color:var(--red)}
</style></head>
<body><div id="app">
  <header>
    <div class="brand">
      <div class="logo">CSDtv</div>
      <div class="head-txt">
        <div class="eyebrow">Canyons School District</div>
        <div class="title">What's coming up <span>on air</span></div>
      </div>
    </div>
    <div class="live"><span class="dot"></span>Live Broadcasts</div>
  </header>
  <div id="list">${cards}</div>
  <footer>Watch live at <span>csdtv.org</span></footer>
</div></body></html>`
}
