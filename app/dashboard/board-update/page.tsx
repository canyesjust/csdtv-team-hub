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
  lastBoardMeeting: string | null
  windowStart: string
  windowEnd: string
  upcomingEvents: UpcomingEvent[]
  recentVideos: RecentVideo[]
}

const DEFAULT_NOTE = `Hello board members,
Ahead of tonight's meeting, here's a quick look at what's coming up at CSDtv over the next two weeks and the videos we've published since we last met. As always, if any livestream below would be helpful as a short reel for your school's social channels, just reply and let me know — happy to put one together.
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

function renderIntroParagraphs(note: string): string {
  return note
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(
      p =>
        `<p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2C3E50;">${escapeHtml(
          p
        )}</p>`
    )
    .join('')
}

function buildBoardUpdateHtml(
  payload: BoardUpdatePayload | null,
  personalNote: string,
  now: Date
): string {
  const headerDate = formatLongDate(now)
  const sectionSubtitle = payload?.lastBoardMeeting
    ? `Since ${formatSinceDate(payload.lastBoardMeeting)}`
    : 'In the last two weeks'

  const upcomingHtml =
    !payload || payload.upcomingEvents.length === 0
      ? `<tr><td style="padding:0 40px 16px 40px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#6B7280;font-style:italic;">No events scheduled in the next two weeks.</td></tr>`
      : payload.upcomingEvents
          .map(evt => {
            const href = evt.link?.trim() || 'https://csdtv.org'
            const image = escapeHtml(evt.image || 'https://via.placeholder.com/180x101?text=CSDtv')
            return `<tr>
  <td style="padding:16px 40px 16px 40px;">
    <a href="${escapeHtml(href)}" style="text-decoration:none;color:inherit;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td width="180" valign="top" style="width:180px;">
            <img src="${image}" width="180" height="101" alt="${escapeHtml(evt.title)}" style="display:block;border:0;border-radius:6px;outline:none;text-decoration:none;">
          </td>
          <td valign="middle" style="padding-left:20px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;font-weight:bold;color:#0A2342;margin:0 0 8px 0;">${escapeHtml(
              evt.title
            )}</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:1.4;color:#FBB040;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px 0;">${escapeHtml(
              formatEventLine(evt.date, evt.time)
            )}</div>
            ${
              evt.link?.trim()
                ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#14315E;text-decoration:underline;">Watch live →</div>`
                : ''
            }
          </td>
        </tr>
      </table>
    </a>
  </td>
</tr>`
          })
          .join('')

  const recentVideosHtml =
    !payload || payload.recentVideos.length === 0
      ? `<tr><td style="padding:0 40px 16px 40px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#6B7280;font-style:italic;">No new videos published since the last meeting.</td></tr>`
      : payload.recentVideos
          .map(v => {
            const thumb = escapeHtml(v.youtubeThumbnail || 'https://via.placeholder.com/180x101?text=YouTube')
            const url = escapeHtml(v.youtubeUrl)
            return `<tr>
  <td style="padding:16px 40px 16px 40px;">
    <a href="${url}" style="text-decoration:none;color:inherit;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td width="180" valign="top" style="width:180px;">
            <img src="${thumb}" width="180" height="101" alt="${escapeHtml(v.title)}" style="display:block;border:0;border-radius:6px;outline:none;text-decoration:none;">
          </td>
          <td valign="middle" style="padding-left:20px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;font-weight:bold;color:#0A2342;margin:0 0 8px 0;">${escapeHtml(
              v.title
            )}</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:1.4;color:#FBB040;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">${escapeHtml(
              formatVideoPostedLine(v.datePublished)
            )}</div>
            <div style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.3;color:#6B7280;border:1px solid #E5E5DC;border-radius:999px;padding:3px 10px;margin:0 0 10px 0;">Length ${escapeHtml(
              v.youtubeDuration || ''
            )}</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#14315E;text-decoration:underline;">Watch on YouTube →</div>
          </td>
        </tr>
      </table>
    </a>
  </td>
</tr>`
          })
          .join('')

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#F5F5F0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#F5F5F0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:600px;max-width:600px;background:#FFFFFF;border:1px solid #E5E5DC;">
          <tr>
            <td style="background:#0A2342;padding:32px 40px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:4px;text-transform:uppercase;color:#FBB040;margin:0 0 14px 0;">CSDTV BOARD UPDATE</div>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:#FFFFFF;margin:0 0 10px 0;">Coming Up &amp; Recently Posted</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#FBB040;font-style:italic;">${escapeHtml(
                headerDate
              )}</div>
            </td>
          </tr>

          <tr>
            <td style="background:#FFFFFF;padding:28px 40px;">
              ${renderIntroParagraphs(personalNote)}
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 12px 40px;background:#FFFFFF;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;font-weight:bold;color:#0A2342;">Coming Up on CSDtv</div>
              <div style="padding-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.3;color:#FBB040;text-transform:uppercase;letter-spacing:2px;">Next 14 days</div>
              <div style="margin-top:10px;width:60px;height:2px;background:#FBB040;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          ${upcomingHtml}

          <tr>
            <td style="padding:24px 40px 12px 40px;background:#FFFFFF;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;font-weight:bold;color:#0A2342;">Recently Posted</div>
              <div style="padding-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.3;color:#FBB040;text-transform:uppercase;letter-spacing:2px;">${escapeHtml(
                sectionSubtitle
              )}</div>
              <div style="margin-top:10px;width:60px;height:2px;background:#FBB040;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          ${recentVideosHtml}

          <tr>
            <td style="padding:24px 40px;background:#FBF8F0;border-top:2px solid #FBB040;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.3;font-weight:bold;color:#0A2342;margin:0 0 10px 0;">Want a reel for your school's social media?</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#2C3E50;">If any of the livestreams above would help promote an event at your school, reply to this email and let me know which one. I'll cut a short reel you can share.</div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px;background:#0A2342;">
              <div style="margin:0 0 10px 0;"><a href="https://csdtv.org" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;color:#FBB040;font-weight:bold;text-decoration:underline;">Watch live at csdtv.org</a></div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#F4F1EA;letter-spacing:2px;text-transform:uppercase;opacity:0.7;">CSDtv · Canyons School District</div>
            </td>
          </tr>
        </table>
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

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const res = await fetch('/api/board-update', { cache: 'no-store' })
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
  }, [router])

  const now = useMemo(() => new Date(), [])
  const subject = useMemo(
    () => `CSDtv Update — Board Meeting ${formatSubjectDate(now)}`,
    [now]
  )
  const emailHtml = useMemo(() => buildBoardUpdateHtml(payload, note, now), [payload, note, now])
  const emailText = useMemo(() => {
    const lines = [
      note,
      '',
      'Coming Up on CSDtv (Next 14 days)',
      ...(payload?.upcomingEvents || []).map(e => `${e.title} — ${formatEventLine(e.date, e.time)}`),
      '',
      payload?.lastBoardMeeting
        ? `Recently Posted (Since ${formatSinceDate(payload.lastBoardMeeting)})`
        : 'Recently Posted (In the last two weeks)',
      ...(payload?.recentVideos || []).map(v => `${v.title} — ${v.youtubeUrl}`),
    ]
    return lines.join('\n')
  }, [payload, note])

  const windowLabel = useMemo(() => {
    if (!payload) return 'Loading...'
    if (payload.lastBoardMeeting) {
      return `Showing content from ${formatSinceDate(payload.lastBoardMeeting)} to today`
    }
    return 'Showing content from the last two weeks to today'
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
