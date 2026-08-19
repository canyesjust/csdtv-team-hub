import type { SupabaseClient } from '@supabase/supabase-js'
import type { GraphicPayload } from '@/lib/graphics/types'
import { templateById } from '@/lib/graphics/templates'

export type Chapter = { offset_seconds: number; stamp: string; title: string }

/** YouTube wants h:mm:ss past the first hour and m:ss before it. */
export function chapterStamp(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/**
 * Chapters from the as-run log, which is already there because every take
 * stamps its row. YouTube needs the first one at 0:00, so the show start is
 * whatever actually went first rather than the scheduled air time.
 */
export async function buildChapters(
  service: SupabaseClient,
  showId: string,
): Promise<Chapter[]> {
  const { data: rows } = await service
    .from('graphics_rows')
    .select('slug, page, started_at, floated, is_break')
    .eq('show_id', showId)
    .not('started_at', 'is', null)
    .order('started_at', { ascending: true })

  const run = (rows || []).filter(r => !r.floated && !r.is_break && r.started_at)
  if (run.length === 0) return []

  const t0 = Date.parse(run[0].started_at as string)
  const chapters: Chapter[] = []
  for (const row of run) {
    const offset = Math.max(0, Math.round((Date.parse(row.started_at as string) - t0) / 1000))
    const title = (row.slug || row.page || 'Untitled').trim()
    // YouTube ignores a chapter that repeats the previous timestamp.
    if (chapters.length > 0 && chapters[chapters.length - 1].offset_seconds === offset) continue
    chapters.push({ offset_seconds: offset, stamp: chapterStamp(offset), title })
  }
  if (chapters.length > 0) {
    chapters[0] = { ...chapters[0], offset_seconds: 0, stamp: chapterStamp(0) }
  }
  return chapters
}

export type SponsorLine = {
  name: string
  takes: number
  seconds: number
}

/**
 * Takes and on-screen seconds per sponsor, counted off the same log. This is
 * the sellable artifact, and it costs nothing because the data is already here.
 */
export async function buildSponsorReport(
  service: SupabaseClient,
  showId: string,
): Promise<SponsorLine[]> {
  const [{ data: log }, { data: show }] = await Promise.all([
    service
      .from('graphics_air_log')
      .select('graphic, took_at, out_at')
      .eq('show_id', showId)
      .order('took_at', { ascending: true }),
    service.from('graphics_shows').select('sponsors, ended_at').eq('id', showId).maybeSingle(),
  ])

  const known = new Set(
    ((show?.sponsors || []) as { name?: string }[])
      .map(s => (s.name || '').trim().toLowerCase())
      .filter(Boolean),
  )
  const showEnd = show?.ended_at ? Date.parse(show.ended_at) : Date.now()
  const tally = new Map<string, SponsorLine>()

  for (const entry of log || []) {
    const graphic = entry.graphic as GraphicPayload | null
    if (!graphic) continue
    const template = templateById(graphic.tid)
    if (!template) continue

    // A sponsor graphic names its sponsor in one of these fields.
    const candidate = [graphic.data.name, graphic.data.title, graphic.data.names]
      .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))

    for (const raw of candidate) {
      // A rotation carries several names on one line each.
      for (const piece of raw.split('\n').map(p => p.trim()).filter(Boolean)) {
        if (!known.has(piece.toLowerCase())) continue
        const started = Date.parse(entry.took_at)
        const ended = entry.out_at ? Date.parse(entry.out_at) : showEnd
        const seconds = Math.max(0, Math.round((ended - started) / 1000))
        const line = tally.get(piece) || { name: piece, takes: 0, seconds: 0 }
        line.takes += 1
        line.seconds += seconds
        tally.set(piece, line)
      }
    }
  }

  return [...tally.values()].sort((a, b) => b.seconds - a.seconds)
}
