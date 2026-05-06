import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'

const BOARD_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRGyV2ebR1T6tpyRlMEll17VczOveAlBVGO2GiZuEWgwO5Bp6Dulph6Oo0gIpZVeFXcr8_303SVYsk/pub?gid=0&single=true&output=csv'
const DAY_MS = 86400000

type SheetRow = {
  productionId: string
  name: string
  link: string
  image: string
  dateIso: string | null
  dateObj: Date | null
  time: string
}

function toLocalIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  row.push(cell)
  rows.push(row)
  return rows.filter(r => r.some(c => c.trim().length > 0))
}

function toIsoDate(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const mmdd = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (mmdd) {
    const m = Number(mmdd[1])
    const d = Number(mmdd[2])
    const y = Number(mmdd[3].length === 2 ? `20${mmdd[3]}` : mmdd[3])
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, m - 1, d)
      if (!Number.isNaN(dt.getTime())) return toLocalIso(dt)
    }
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  const local = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  return toLocalIso(local)
}

function fromIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatTime(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  const hm = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/)
  if (hm) {
    let h = Number(hm[1])
    const m = hm[2]
    const ap = hm[3]?.toUpperCase()
    if (ap) {
      if (h === 12) h = 0
      if (ap === 'PM') h += 12
    }
    if (h >= 0 && h <= 23) {
      const dt = new Date()
      dt.setHours(h, Number(m), 0, 0)
      return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
  }
  const parsed = new Date(`1970-01-01 ${raw}`)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return raw
}

function normalizeDriveImageUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return ''
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i)
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w800`
  const openMatch = url.match(/[?&]id=([^&]+)/i)
  if (openMatch?.[1] && /drive\.google\.com\/open/i.test(url)) {
    return `https://drive.google.com/thumbnail?id=${openMatch[1]}&sz=w800`
  }
  return url
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Cache the public sheet briefly to reduce perceived slowness.
  const csvRes = await fetch(BOARD_SHEET_CSV_URL, { next: { revalidate: 300 } })
  if (!csvRes.ok) {
    return NextResponse.json({ error: 'Failed to load board sheet' }, { status: 502 })
  }
  const csvText = await csvRes.text()
  const csvRows = parseCsv(csvText)
  if (csvRows.length === 0) {
    return NextResponse.json({ error: 'Board sheet is empty' }, { status: 500 })
  }

  const header = csvRows[0].map(c => c.trim().toLowerCase())
  const idx = {
    productionId: header.indexOf('productionid'),
    name: header.indexOf('name'),
    link: header.indexOf('link'),
    image: header.indexOf('image'),
    date: header.indexOf('date'),
    time: header.indexOf('time'),
  }

  const sheetRows: SheetRow[] = csvRows.slice(1).map(r => {
    const dateIso = idx.date >= 0 ? toIsoDate(r[idx.date] || '') : null
    return {
      productionId: idx.productionId >= 0 ? String(r[idx.productionId] || '').trim() : '',
      name: idx.name >= 0 ? String(r[idx.name] || '').trim() : '',
      link: idx.link >= 0 ? String(r[idx.link] || '').trim() : '',
      image: idx.image >= 0 ? normalizeDriveImageUrl(String(r[idx.image] || '')) : '',
      dateIso,
      dateObj: dateIso ? fromIsoLocal(dateIso) : null,
      time: idx.time >= 0 ? formatTime(String(r[idx.time] || '')) : '',
    }
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = toLocalIso(today)

  const boardMeetingRows = sheetRows
    .filter(r => /board\s*meeting/i.test(r.name) && r.dateObj)
    .filter(r => (r.dateObj as Date).getTime() <= today.getTime())
    .sort((a, b) => (b.dateObj as Date).getTime() - (a.dateObj as Date).getTime())

  const lastBoardMeetingIso = boardMeetingRows[0]?.dateIso || null
  const windowStartDate = lastBoardMeetingIso ? fromIsoLocal(lastBoardMeetingIso) : addDays(today, -14)
  const windowStartIso = toLocalIso(windowStartDate)
  const windowEndIso = todayIso

  const upcomingEnd = addDays(today, 14)
  const upcomingEvents = sheetRows
    .filter(r => r.dateObj)
    .filter(r => {
      const d = r.dateObj as Date
      return d.getTime() >= today.getTime() && d.getTime() <= upcomingEnd.getTime()
    })
    .sort((a, b) => (a.dateObj as Date).getTime() - (b.dateObj as Date).getTime())
    .map(r => ({
      productionId: r.productionId,
      title: r.name,
      link: r.link,
      image: r.image,
      date: r.dateIso as string,
      time: r.time,
      day: (r.dateObj as Date).toLocaleDateString('en-US', { weekday: 'short' }),
    }))

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const supabase = createClient(url, key)

  const { data: videos, error } = await supabase
    .from('videos')
    .select('id, title, youtube_url, youtube_id, youtube_thumbnail, youtube_duration, date_published')
    .eq('status', 'Published')
    .not('youtube_id', 'is', null)
    .gte('date_published', windowStartIso)
    .lte('date_published', windowEndIso)
    .order('date_published', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const recentVideos = (videos || []).map(v => ({
    id: v.id,
    title: v.title || '',
    youtubeUrl: (v.youtube_url || '').trim() || `https://www.youtube.com/watch?v=${v.youtube_id}`,
    youtubeThumbnail: v.youtube_thumbnail || '',
    youtubeDuration: v.youtube_duration || '',
    datePublished: v.date_published || '',
  }))

  return NextResponse.json({
    lastBoardMeeting: lastBoardMeetingIso,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    upcomingEvents,
    recentVideos,
  })
}
