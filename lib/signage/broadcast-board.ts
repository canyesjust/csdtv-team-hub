// Renders the digital-signage "What's coming up on air" board as a self-contained,
// script-free HTML slide. Built SERVER-SIDE with the data (thumbnails + QR codes)
// already inlined as data URIs, so it needs no JavaScript and stays offline-safe.
// Injected into the screen feed's media rotation like any other HTML slide.

export type BroadcastBoardItem = {
  title: string
  typeLabel: string // "Livestream" / "Board Meeting"
  dateLabel: string // "Tue, Jul 7, 2026"
  timeLabel: string // "4:00 PM"
  countdownLabel: string // "Today" / "Tomorrow" / "In 5 days"
  imageDataUri: string | null // inlined thumbnail, or null → CSDtv watermark
  qrDataUri: string | null // inlined QR to the stream, or null → hidden
  watchLabel: string // "csdtv.org"
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const cal = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`
const clock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`

export function buildBroadcastBoardHtml(items: BroadcastBoardItem[], todayLabel: string): string {
  const cards = items.slice(0, 6).map(it => {
    const thumb = it.imageDataUri
      ? `<img class="bc-img" src="${esc(it.imageDataUri)}" alt="">`
      : `<div class="bc-img bc-img--ph"><span>CSDtv</span></div>`
    const qr = it.qrDataUri
      ? `<div class="bc-qr"><div class="bc-qr-box"><img src="${esc(it.qrDataUri)}" alt=""></div><div class="bc-qr-lbl">Scan to watch</div><div class="bc-qr-url">${esc(it.watchLabel)}</div></div>`
      : ''
    return `
      <div class="bc-card">
        <div class="bc-thumb">${thumb}</div>
        <div class="bc-body">
          <div class="bc-type">${esc(it.typeLabel)}</div>
          <div class="bc-name">${esc(it.title)}</div>
          <div class="bc-meta">
            <span class="bc-mi">${cal}${esc(it.dateLabel)}</span>
            <span class="bc-mi">${clock}${esc(it.timeLabel)}</span>
          </div>
          <span class="bc-countdown">${esc(it.countdownLabel)}</span>
        </div>
        ${qr}
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--red:#e8212a;--red2:#ff5760;--dark:#0b0e13;--card:#161b22;--card2:#1c222b;--border:rgba(255,255,255,0.08);--text:#f0f4ff;--muted:#8a99b5}
  html,body{width:100%;height:100%;background:var(--dark);color:var(--text);font-family:'Barlow',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden}
  body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 55% 45% at 12% 40%,rgba(232,33,42,0.10),transparent 60%),radial-gradient(ellipse 45% 40% at 88% 90%,rgba(232,33,42,0.06),transparent 60%);pointer-events:none}
  #app{position:relative;width:100vw;height:100vh;display:flex;flex-direction:column;padding:4vh 4vw}
  header{display:flex;align-items:center;justify-content:space-between;padding-bottom:2.4vh;border-bottom:0.22vh solid var(--border);flex-shrink:0}
  .brand{display:flex;align-items:center;gap:1.6vw}
  .logo{background:var(--red);color:#fff;font-weight:800;letter-spacing:0.14vw;padding:1vh 1.5vw;border-radius:0.7vh;font-size:4vh;line-height:1}
  .htxt{border-left:0.22vh solid var(--border);padding-left:1.6vw}
  .htxt .eyebrow{font-size:1.6vh;font-weight:700;letter-spacing:0.35vw;text-transform:uppercase;color:var(--muted);margin-bottom:0.5vh}
  .htxt .title{font-size:3.8vh;font-weight:800;letter-spacing:0.06vw;line-height:1}
  .htxt .title span{color:var(--red)}
  .live{display:flex;align-items:center;gap:0.9vw;background:rgba(232,33,42,0.12);border:0.2vh solid rgba(232,33,42,0.35);border-radius:6vh;padding:1.2vh 1.8vw;font-size:1.8vh;font-weight:700;letter-spacing:0.22vw;text-transform:uppercase;color:var(--red2)}
  .live .dot{width:1.4vh;height:1.4vh;border-radius:50%;background:var(--red)}
  .today{text-align:right;font-size:1.9vh;font-weight:700;letter-spacing:0.14vw;text-transform:uppercase;color:var(--muted)}
  #list{flex:1;display:flex;flex-direction:column;gap:1.8vh;padding-top:2.6vh;overflow:hidden;justify-content:center}
  .bc-card{display:flex;align-items:stretch;background:var(--card);border:0.2vh solid var(--border);border-left:0.6vh solid var(--red);border-radius:1.4vh;overflow:hidden;flex:0 1 30vh;min-height:0;max-height:30vh}
  .bc-thumb{flex:0 0 auto;height:100%;aspect-ratio:16/9;background:#0a0d12;position:relative;overflow:hidden}
  .bc-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
  .bc-img--ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:5vh;font-weight:800;color:rgba(255,255,255,0.07);letter-spacing:0.1vw}
  .bc-body{flex:1;min-width:0;padding:2.2vh 2.4vw;display:flex;flex-direction:column;justify-content:center;gap:1.2vh}
  .bc-type{font-size:1.6vh;font-weight:700;letter-spacing:0.3vw;text-transform:uppercase;color:var(--red2)}
  .bc-name{font-size:3.3vh;font-weight:800;line-height:1.1;letter-spacing:0.02vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bc-meta{display:flex;align-items:center;gap:2.4vw;flex-wrap:wrap}
  .bc-mi{display:flex;align-items:center;gap:0.7vw;font-size:2.3vh;font-weight:700;color:var(--text)}
  .bc-mi svg{width:2.3vh;height:2.3vh;color:var(--muted);flex-shrink:0}
  .bc-countdown{align-self:flex-start;background:rgba(232,33,42,0.12);border:0.18vh solid rgba(232,33,42,0.3);border-radius:5vh;padding:0.9vh 1.6vw;font-size:1.9vh;font-weight:700;color:var(--red2);letter-spacing:0.05vw}
  .bc-qr{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.9vh;padding:0 2.2vw;border-left:0.18vh solid var(--border)}
  .bc-qr-box{background:#fff;border-radius:1vh;padding:0.8vh;width:12vh;height:12vh}
  .bc-qr-box img{width:100%;height:100%;display:block}
  .bc-qr-lbl{font-size:1.3vh;font-weight:700;letter-spacing:0.2vw;text-transform:uppercase;color:var(--muted)}
  .bc-qr-url{font-size:1.9vh;font-weight:800;letter-spacing:0.1vw;text-transform:uppercase;color:var(--red2)}
  footer{flex-shrink:0;padding-top:2.2vh;text-align:center;font-size:1.6vh;font-weight:700;letter-spacing:0.3vw;text-transform:uppercase;color:var(--muted)}
  footer span{color:var(--red)}
</style></head>
<body><div id="app">
  <header>
    <div class="brand">
      <div class="logo">CSDTV</div>
      <div class="htxt">
        <div class="eyebrow">Canyons School District</div>
        <div class="title">What's coming up <span>on air</span></div>
      </div>
    </div>
    <div class="live"><span class="dot"></span>Live Broadcasts</div>
    <div class="today">${esc(todayLabel)}</div>
  </header>
  <div id="list">${cards}</div>
  <footer>Watch live at <span>csdtv.org</span></footer>
</div></body></html>`
}
