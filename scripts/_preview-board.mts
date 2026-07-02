import { buildBroadcastBoardHtml, type BroadcastBoardItem } from '../lib/signage/broadcast-board'
import QR from 'qrcode'
import { writeFileSync } from 'fs'

const qr1 = await QR.toDataURL('https://csdtv.org/live', { margin: 1, width: 240 })
const qr2 = await QR.toDataURL('https://csdtv.org/live', { margin: 1, width: 240 })

// sample thumbnail (gradient) so the thumbnail slot is visible in the preview
const thumb = 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2b4a"/><stop offset="1" stop-color="#0a1424"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><text x="50%" y="52%" font-family="Arial" font-size="54" font-weight="800" fill="#3a5a90" text-anchor="middle">BOARD ROOM</text></svg>`
).toString('base64')

const items: BroadcastBoardItem[] = [
  { title: 'Board of Education Meeting', typeLabel: 'Board Meeting', dateLabel: 'Tue, Jul 7, 2026', timeLabel: '4:00 PM', countdownLabel: 'In 5 days', imageDataUri: thumb, qrDataUri: qr1, watchLabel: 'csdtv.org' },
  { title: 'Truth in Taxation Hearing', typeLabel: 'Board Meeting', dateLabel: 'Tue, Aug 4, 2026', timeLabel: '4:00 PM', countdownLabel: 'In 33 days', imageDataUri: null, qrDataUri: qr2, watchLabel: 'csdtv.org' },
  { title: 'Corner Canyon vs. Alta — Football', typeLabel: 'Livestream', dateLabel: 'Fri, Jul 11, 2026', timeLabel: '7:00 PM', countdownLabel: 'In 9 days', imageDataUri: thumb, qrDataUri: qr1, watchLabel: 'csdtv.org' },
]

const html = buildBroadcastBoardHtml(items, 'Thursday, July 2, 2026')
writeFileSync('/sessions/pensive-wizardly-ritchie/mnt/outputs/broadcast-board-preview.html', html)
console.log('wrote preview,', html.length, 'chars')
