'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'

type UpcomingEvent = {
  productionId: string
  title: string
  link: string
  image: string
  date: string
  time: string
  day: string
}

type RecentVideo = {
  id: string
  title: string
  youtubeUrl: string
  youtubeThumbnail: string
  youtubeDuration: string
  datePublished: string
}

type BoardUpdatePayload = {
  referenceDate: string
  lastBoardMeeting: string | null
  recentWindowStart: string
  recentWindowEnd: string
  upcomingWindowStart: string
  upcomingWindowEnd: string
  upcomingEvents: UpcomingEvent[]
  recentVideos: RecentVideo[]
}

const DEFAULT_NOTE = `Hello board members,
Ahead of tonight's meeting, here's a quick look at what's coming up on CSDtv in the next fourteen days and what we've published in the fourteen days leading up to this meeting. If any livestream below would be helpful as a short reel for your school's social channels, just reply and let me know — happy to put one together.
See you tonight.`

function formatSinceDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatSubjectDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatEventLine(dateIso: string, time: string): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const monthDay = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
  return time ? `${day} · ${monthDay} · ${time.toUpperCase()}` : `${day} · ${monthDay}`
}

function formatVideoPostedLine(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const monthDay = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
  return `POSTED ${day} · ${monthDay}`
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Human-readable length for email (handles YouTube ISO 8601 durations). */
function formatVideoDuration(raw: string | null | undefined): string {
  const s = (raw || '').trim()
  if (!s || s === '0:00' || s === '0') return ''
  if (/^\d+$/.test(s)) {
    const total = parseInt(s, 10)
    if (total <= 0) return ''
    const h = Math.floor(total / 3600)
    const min = Math.floor((total % 3600) / 60)
    const sec = total % 60
    if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${min}:${String(sec).padStart(2, '0')}`
  }
  if (/^PT/i.test(s)) {
    const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i)
    if (!m) return s
    const h = parseInt(m[1] || '0', 10)
    const min = parseInt(m[2] || '0', 10)
    const sec = parseInt(m[3] || '0', 10)
    if (h === 0 && min === 0 && sec === 0) return ''
    if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${min}:${String(sec).padStart(2, '0')}`
  }
  return s
}

function formatDateRangeSubtitle(startIso: string, endIso: string): string {
  return `${formatSinceDate(startIso)} – ${formatSinceDate(endIso)}`
}

const EMAIL_BODY_WIDTH = 720
const EMAIL_PAD = 32

const TEXT_BODY = `font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.65;color:#2C3E50;word-wrap:break-word;overflow-wrap:break-word;`
const TITLE_SERIF = `font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;font-weight:bold;color:#0A2342;word-wrap:break-word;overflow-wrap:break-word;`
const META_ORANGE = `font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;line-height:1.45;color:#FBB040;text-transform:uppercase;letter-spacing:0.08em;`
const LINK_STYLE = `font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#14315E;font-weight:600;text-decoration:underline;`

function renderIntroParagraphs(note: string): string {
  const paras = note
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
  return paras
    .map(
      (p, i) =>
        `<p style="margin:0 0 ${i < paras.length - 1 ? '18' : '0'}px 0;${TEXT_BODY}">${escapeHtml(p)}</p>`
    )
    .join('')
}

function buildEventCard(evt: UpcomingEvent): string {
  const href = evt.link?.trim() || 'https://csdtv.org'
  const image = escapeHtml(evt.image || 'https://via.placeholder.com/1200x675?text=CSDtv')
  return `<a href="${escapeHtml(href)}" style="text-decoration:none;color:inherit;display:block;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;border:1px solid #D8D8CE;background:#FAFAF8;">
  <tr>
    <td style="padding:0;">
      <img src="${image}" width="${EMAIL_BODY_WIDTH}" alt="${escapeHtml(evt.title)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">
    </td>
  </tr>
  <tr>
    <td style="padding:20px ${EMAIL_PAD}px 22px ${EMAIL_PAD}px;">
      <div style="${TITLE_SERIF}margin:0 0 10px 0;">${escapeHtml(evt.title)}</div>
      <div style="${META_ORANGE}margin:0 0 14px 0;">${escapeHtml(formatEventLine(evt.date, evt.time))}</div>
      ${evt.link?.trim() ? `<div style="margin:0;"><span style="${LINK_STYLE}">Watch live →</span></div>` : ''}
    </td>
  </tr>
</table>
</a>`
}

function buildVideoCard(v: RecentVideo): string {
  const thumb = escapeHtml(v.youtubeThumbnail || 'https://via.placeholder.com/1200x675?text=YouTube')
  const url = escapeHtml(v.youtubeUrl)
  const dur = formatVideoDuration(v.youtubeDuration)
  const durBlock = dur
    ? `<span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35;color:#5C6370;border:1px solid #D8D8CE;border-radius:999px;padding:5px 12px;margin:0 0 14px 0;">${escapeHtml(dur)}</span>`
    : ''
  return `<a href="${url}" style="text-decoration:none;color:inherit;display:block;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;border:1px solid #D8D8CE;background:#FAFAF8;">
  <tr>
    <td style="padding:0;">
      <img src="${thumb}" width="${EMAIL_BODY_WIDTH}" alt="${escapeHtml(v.title)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">
    </td>
  </tr>
  <tr>
    <td style="padding:20px ${EMAIL_PAD}px 22px ${EMAIL_PAD}px;">
      <div style="${TITLE_SERIF}margin:0 0 10px 0;">${escapeHtml(v.title)}</div>
      <div style="${META_ORANGE}margin:0 0 10px 0;">${escapeHtml(formatVideoPostedLine(v.datePublished))}</div>
      ${durBlock ? `<div style="margin:0 0 14px 0;">${durBlock}</div>` : ''}
      <div style="margin:0;"><span style="${LINK_STYLE}">Watch on YouTube →</span></div>
    </td>
  </tr>
</table>
</a>`
}

function buildFullWidthItemRows<T>(items: T[], renderCard: (item: T) => string, emptyMessage: string): string {
  if (items.length === 0) {
    return `<tr><td style="padding:0 ${EMAIL_PAD}px 20px ${EMAIL_PAD}px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#6B7280;font-style:italic;">${emptyMessage}</td></tr>`
  }
  return items
    .map(
      item => `<tr>
  <td class="bu-item" style="padding:0 ${EMAIL_PAD}px 20px ${EMAIL_PAD}px;vertical-align:top;">${renderCard(item)}</td>
</tr>`
    )
    .join('')
}

function buildBoardUpdateHtml(
  payload: BoardUpdatePayload | null,
  personalNote: string,
  now: Date
): string {
  const headerDate = formatLongDate(now)
  const upcomingMeta = payload
    ? formatDateRangeSubtitle(payload.upcomingWindowStart, payload.upcomingWindowEnd)
    : 'Next 14 days'
  const recentMeta = payload
    ? formatDateRangeSubtitle(payload.recentWindowStart, payload.recentWindowEnd)
    : 'Previous 14 days'

  const upcomingHtml = buildFullWidthItemRows(
    payload?.upcomingEvents ?? [],
    buildEventCard,
    'No events scheduled in the next 14 days.'
  )
  const recentVideosHtml = buildFullWidthItemRows(
    payload?.recentVideos ?? [],
    buildVideoCard,
    'No new videos published in this 14-day window.'
  )

  const w = EMAIL_BODY_WIDTH
  const preheader = `CSDtv board briefing — ${headerDate}`
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style type="text/css">
body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
table { border-collapse: collapse !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
@media only screen and (max-width: 640px) {
  .bu-shell { width: 100% !important; max-width: 100% !important; }
  .bu-item { padding-left: 20px !important; padding-right: 20px !important; }
  .bu-pad { padding-left: 20px !important; padding-right: 20px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:#E8E8E2;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#E8E8E2;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#E8E8E2;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table class="bu-shell" role="presentation" width="${w}" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:${w}px;max-width:100%;background:#FFFFFF;border:1px solid #D0D0C8;box-shadow:0 1px 3px rgba(10,35,66,0.06);">
          <tr>
            <td class="bu-pad" style="background:linear-gradient(180deg,#0D2D52 0%,#0A2342 100%);background-color:#0A2342;padding:36px ${EMAIL_PAD}px 32px ${EMAIL_PAD}px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.28em;text-transform:uppercase;color:#FBB040;margin:0 0 16px 0;">CSDTV · BOARD UPDATE</div>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:#FFFFFF;margin:0 0 12px 0;word-wrap:break-word;">Coming Up &amp; Recently Posted</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#E8D5B0;font-weight:500;">${escapeHtml(headerDate)}</div>
            </td>
          </tr>

          <tr>
            <td class="bu-pad" style="background:#FFFFFF;padding:32px ${EMAIL_PAD}px 28px ${EMAIL_PAD}px;border-bottom:1px solid #ECECE4;">
              ${renderIntroParagraphs(personalNote)}
            </td>
          </tr>

          <tr>
            <td class="bu-pad" style="padding:32px ${EMAIL_PAD}px 8px ${EMAIL_PAD}px;background:#FFFFFF;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.25;font-weight:bold;color:#0A2342;margin:0;">Coming up on CSDtv</div>
              <div style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#C47A1A;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">${escapeHtml(upcomingMeta)}</div>
              <div style="margin-top:14px;width:48px;height:3px;background:#FBB040;font-size:0;line-height:0;border-radius:1px;">&nbsp;</div>
            </td>
          </tr>
          ${upcomingHtml}

          <tr>
            <td class="bu-pad" style="padding:36px ${EMAIL_PAD}px 8px ${EMAIL_PAD}px;background:#FFFFFF;border-top:8px solid #F5F5F0;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.25;font-weight:bold;color:#0A2342;margin:0;">Recently posted</div>
              <div style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#C47A1A;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">${escapeHtml(recentMeta)}</div>
              <div style="margin-top:14px;width:48px;height:3px;background:#FBB040;font-size:0;line-height:0;border-radius:1px;">&nbsp;</div>
            </td>
          </tr>
          ${recentVideosHtml}

          <tr>
            <td class="bu-pad" style="padding:28px ${EMAIL_PAD}px;background:#F7F4EC;border-top:1px solid #E5DFD0;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.35;font-weight:bold;color:#0A2342;margin:0 0 12px 0;">Want a reel for your school&rsquo;s social media?</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2C3E50;word-wrap:break-word;">If any of the livestreams above would help promote an event at your school, reply to this email and let me know which one. I&rsquo;ll cut a short reel you can share.</div>
            </td>
          </tr>

          <tr>
            <td class="bu-pad" style="padding:28px ${EMAIL_PAD}px;background:#0A2342;">
              <div style="margin:0 0 12px 0;"><a href="https://csdtv.org" target="_blank" rel="noopener noreferrer" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#FBB040;font-weight:700;text-decoration:underline;">Watch live at csdtv.org</a></div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#B8C5D6;letter-spacing:0.14em;text-transform:uppercase;">CSDtv · Canyons School District</div>
            </td>
          </tr>
        </table>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;color:#888880;padding:16px 8px 0 8px;max-width:${w}px;margin:0 auto;">You&rsquo;re receiving this as a member of the Canyons Board of Education. Questions? Reply to this message.</div>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export default function BoardUpdatePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [payload, setPayload] = useState<BoardUpdatePayload | null>(null)
  const [note, setNote] = useState(DEFAULT_NOTE)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/board-update?date=${encodeURIComponent(selectedDate)}`, { cache: 'no-store' })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(body.error || 'Failed to load board update data', 'error')
      } else if (!cancelled) {
        setPayload(body as BoardUpdatePayload)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router, selectedDate])

  const now = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [selectedDate])
  const subject = useMemo(
    () => `CSDtv Update — Board Meeting ${formatSubjectDate(now)}`,
    [now]
  )
  const emailHtml = useMemo(() => buildBoardUpdateHtml(payload, note, now), [payload, note, now])
  const emailText = useMemo(() => {
    if (!payload) return note
    const lines = [
      note,
      '',
      `Coming Up on CSDtv (${formatDateRangeSubtitle(payload.upcomingWindowStart, payload.upcomingWindowEnd)})`,
      ...(payload.upcomingEvents || []).map(e => `${e.title} — ${formatEventLine(e.date, e.time)}`),
      '',
      `Recently Posted (${formatDateRangeSubtitle(payload.recentWindowStart, payload.recentWindowEnd)})`,
      ...(payload.recentVideos || []).map(v => `${v.title} — ${v.youtubeUrl}`),
    ]
    return lines.join('\n')
  }, [payload, note])

  const windowLabel = useMemo(() => {
    if (!payload) return 'Loading...'
    return `Coming up: ${formatDateRangeSubtitle(payload.upcomingWindowStart, payload.upcomingWindowEnd)} · Recently posted: ${formatDateRangeSubtitle(payload.recentWindowStart, payload.recentWindowEnd)}`
  }, [payload])

  async function copySubject() {
    try {
      await navigator.clipboard.writeText(subject)
      toast('Subject copied', 'success')
    } catch {
      toast('Could not copy subject', 'error')
    }
  }

  async function copyEmailHtml() {
    try {
      if ('clipboard' in navigator && 'ClipboardItem' in window) {
        const item = new ClipboardItem({
          'text/html': new Blob([emailHtml], { type: 'text/html' }),
          'text/plain': new Blob([emailText], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } else {
        const ta = document.createElement('textarea')
        ta.value = emailText
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast('Copied — paste into Outlook.', 'success')
    } catch {
      toast('Copy failed. Try again.', 'error')
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
        Board Update Email
      </h1>
      <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '14px' }}>
        Generate the morning-of email to send to board members.
      </p>

      <section style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
        <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: '12px' }}>{windowLabel}</p>
        <div style={{ marginBottom: '10px' }}>
          <label htmlFor="board-date" style={{ display: 'block', marginBottom: '6px', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600 }}>
            Board meeting date (override)
          </label>
          <input
            id="board-date"
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ minHeight: '42px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', padding: '0 12px', fontFamily: 'inherit', fontSize: '14px' }}
          />
        </div>
        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
          <input
            value={subject}
            readOnly
            style={{ width: '100%', minHeight: '42px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', padding: '0 12px', fontFamily: 'inherit', fontSize: '14px' }}
          />
          <button onClick={copySubject} style={{ minHeight: '42px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            Copy
          </button>
        </div>
        <button onClick={copyEmailHtml} style={{ marginTop: '12px', minHeight: '46px', borderRadius: '10px', border: 'none', background: 'var(--brand-primary)', color: '#fff', padding: '0 18px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '14px' }}>
          Copy Email HTML for Outlook
        </button>
      </section>

      <section style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
        <label htmlFor="note" style={{ display: 'block', marginBottom: '8px', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>
          Personal note (optional)
        </label>
        <textarea
          id="note"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ width: '100%', minHeight: '150px', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)', padding: '12px', fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.5, resize: 'vertical' }}
        />
      </section>

      <section style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
        <h2 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700 }}>Live email preview</h2>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', overflow: 'hidden', background: '#f5f5f0' }}>
          {loading ? (
            <div style={{ padding: '28px', color: 'var(--text-muted)', fontSize: '14px' }}>Loading preview...</div>
          ) : (
            <iframe
              title="Board update email preview"
              srcDoc={emailHtml}
              sandbox="allow-same-origin"
              style={{ width: '100%', minHeight: '1200px', border: 'none', display: 'block', background: '#f5f5f0' }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
