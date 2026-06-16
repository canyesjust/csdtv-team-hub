// Pull a board-meeting agenda straight from the iCompass / Diligent Community
// portal (e.g. canyonsdistrict.community.highbond.com) instead of LLM-parsing the
// PDF. The portal renders the agenda as clean, regularly-structured HTML:
//   <h2> = numbered sections (1..n), <h3> = lettered sub-items with "Title – Presenter",
//   <a>…file.pdf</a> = attached documents.
// We parse that into the same ExtractedAgendaResponse the PDF pipeline produces, so
// the rest of persist/enrich/diff is unchanged. The PDF path stays as a fallback.

import type {
  ExtractedAgendaResponse,
  ExtractedAgendaItem,
  ExtractedAgendaDocument,
  ExtractedAgendaPresenter,
} from './extraction'

const DEFAULT_ICOMPASS_BASE = 'https://canyonsdistrict.community.highbond.com'
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Accept either a bare meeting id ("478") or a portal URL and resolve base + id. */
export function resolveIcompassMeeting(input: string): { baseUrl: string; meetingId: string } | null {
  const s = (input || '').trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return { baseUrl: DEFAULT_ICOMPASS_BASE, meetingId: s }
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    const id = u.searchParams.get('Id') || u.searchParams.get('id')
    if (id && /^\d+$/.test(id)) return { baseUrl: `${u.protocol}//${u.host}`, meetingId: id }
  } catch {
    // not a URL
  }
  return null
}
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt)$/i

function decodeHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

type IcompassDocument = { Id: number; DocumentType: number; Type: number; Name: string }

/**
 * Fetch the rendered agenda HTML for an iCompass meeting.
 * `baseUrl` e.g. "https://canyonsdistrict.community.highbond.com", `meetingId` e.g. 478.
 * DocumentType 1 = the agenda; we render it via /document/{id}.
 */
export async function fetchIcompassAgendaHtml(
  baseUrl: string,
  meetingId: number | string,
): Promise<{ html: string; docId: number } | null> {
  const root = baseUrl.replace(/\/+$/, '')
  const docsRes = await fetch(`${root}/Services/MeetingsService.svc/meetings/${meetingId}/meetingDocuments`, {
    headers: { Accept: 'application/json' },
  })
  if (!docsRes.ok) return null
  const data = (await docsRes.json()) as { Documents?: IcompassDocument[] }
  const documents = data.Documents ?? []
  const agendaDoc = documents.find(d => d.DocumentType === 1) ?? documents[0]
  if (!agendaDoc) return null
  const htmlRes = await fetch(`${root}/document/${agendaDoc.Id}`)
  if (!htmlRes.ok) return null
  return { html: await htmlRes.text(), docId: agendaDoc.Id }
}

function parsePresenters(afterDash: string): ExtractedAgendaPresenter[] {
  // "Denise Haycock, Foundation Development Office" or
  // "Jeff Haney, Director, and Kirsten Stewart, Associate Director of Communications"
  return afterDash
    .split(/\s*,?\s+and\s+/i)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => {
      const comma = chunk.indexOf(',')
      if (comma === -1) return { name: chunk, title: null }
      return { name: chunk.slice(0, comma).trim(), title: chunk.slice(comma + 1).trim() || null }
    })
}

function classify(title: string): {
  type: ExtractedAgendaItem['type']
  action_requested: boolean
  suggested_motion_text: string | null
} {
  const t = title.toLowerCase()
  if (/\b(approv|adopt|authoriz|ratif|ratify|award|accept the)/.test(t)) {
    const subject = title.replace(/^\s*(approval of|approve|approval to|adopt|adoption of)\s+/i, '').trim()
    return { type: 'action', action_requested: true, suggested_motion_text: `Move to approve ${subject || title}.` }
  }
  if (/recogni/.test(t)) return { type: 'recognition', action_requested: false, suggested_motion_text: null }
  if (/\b(pledge|welcome|adjourn|call to order|roll call|patron comment|public comment)\b/.test(t)) {
    return { type: 'procedural', action_requested: false, suggested_motion_text: null }
  }
  return { type: 'information', action_requested: false, suggested_motion_text: null }
}

function extractDocuments(sliceHtml: string): ExtractedAgendaDocument[] {
  const docs: ExtractedAgendaDocument[] = []
  for (const m of sliceHtml.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = decodeHtml(m[1])
    if (DOC_EXT.test(text) && !docs.some(d => d.filename === text)) {
      docs.push({ title: text.replace(DOC_EXT, '').trim() || text, filename: text })
    }
  }
  return docs
}

export type IcompassMotion = { moverName: string | null; motionText: string; itemRefs: string[]; result: string | null }

/** HTML → line-preserving plain text (so we can read the minutes blocks). */
function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|li|tr|td|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#0*39;|&apos;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .split('\n')
    .map(l => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Pull the verbatim motions from a PAST meeting's minutes (present in the rendered
 * agenda once the meeting is over). Each "MOTION" block reads
 * "{Mover} moved to {text}. {Seconder} seconded the motion. {result}".
 */
export function extractIcompassMotions(html: string): IcompassMotion[] {
  const lines = htmlToText(html).split('\n')
  const out: IcompassMotion[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^MOTION$/i.test(lines[i])) continue
    const chunk: string[] = []
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
      if (/^MOTION$/i.test(lines[j])) break
      chunk.push(lines[j])
    }
    const block = chunk.join(' ').replace(/\s+/g, ' ').trim()
    // Trim from the seconder / a second mover / the result onward, so motion text
    // is only the first mover's motion (minutes sometimes list two movers).
    const cut = block.match(/\.\s+[A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3}\s+(?:seconded|moved)\b|\.\s+The motion\b|\s+\*|\s+passed unanimously\b/i)
    const head = cut ? block.slice(0, cut.index) : block
    const moved = head.match(/\bmoved\s+(to\b.*)/i)
    if (!moved) continue
    let motionText = `Move ${moved[1].replace(/[.;,\s]+$/, '')}.`.replace(/\s+/g, ' ').trim()
    if (!/[.!?]$/.test(motionText)) motionText += '.'
    const mover = block.match(/^([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3}?)\s+moved\b/)?.[1] ?? null
    const itemRefs = [...block.matchAll(/Item\s+(\d+\s*[A-Z])/gi)].map(m => m[1].replace(/\s+/g, '').toUpperCase())
    const result = block.match(/passed unanimously|carried unanimously|motion (?:carried|passed|failed)|\d+\s*Yea/i)?.[0] ?? null
    out.push({ moverName: mover, motionText, itemRefs, result })
  }
  return out
}

/** Parse iCompass agenda HTML into the same shape the PDF extractor returns. */
export function parseIcompassAgendaHtml(html: string): ExtractedAgendaResponse {
  const items: ExtractedAgendaItem[] = []
  const sections: NonNullable<ExtractedAgendaResponse['sections']> = []

  const h2matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
  for (let i = 0; i < h2matches.length; i++) {
    const m = h2matches[i]
    const sectionNumber = i + 1
    const rawTitle = decodeHtml(m[1])
    const timeMatch = rawTitle.match(/\s*[-–]\s*(\d{1,2}:\d{2}\s*[ap]\.?m\.?)\s*$/i)
    const sectionTitle = timeMatch ? rawTitle.slice(0, timeMatch.index).trim() : rawTitle
    sections.push({ number: sectionNumber, title: sectionTitle, broadcastable: true, start_time: timeMatch ? timeMatch[1] : null })

    const sliceStart = (m.index ?? 0) + m[0].length
    const sliceEnd = i + 1 < h2matches.length ? (h2matches[i + 1].index ?? html.length) : html.length
    const sectionHtml = html.slice(sliceStart, sliceEnd)

    const h3matches = [...sectionHtml.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)]
    const isConsent = /consent agenda/i.test(sectionTitle)

    // Parse each sub-item (h3) once.
    const parsed = h3matches.map((h3, j) => {
      const raw = decodeHtml(h3[1])
      const dash = raw.search(/\s–\s/)
      const title = dash > 0 ? raw.slice(0, dash).trim() : raw
      const presenters = dash > 0 ? parsePresenters(raw.slice(dash + 2).trim()) : []
      const subStart = (h3.index ?? 0) + h3[0].length
      const subEnd = j + 1 < h3matches.length ? (h3matches[j + 1].index ?? sectionHtml.length) : sectionHtml.length
      const documents = extractDocuments(sectionHtml.slice(subStart, subEnd))
      return { item_number: LETTERS[j] ?? String(j + 1), title, presenters, documents }
    })

    if (isConsent && parsed.length > 0) {
      // The consent agenda is ONE agenda item that votes as one motion, with each
      // member listed as a sub-item (and listed in the motion text).
      const listed = parsed.map(p => `${p.item_number}. ${p.title}`).join('; ')
      items.push({
        section_number: sectionNumber,
        section_title: sectionTitle,
        item_number: 'A',
        sort_order: items.length,
        title: 'Consent Agenda',
        original_title: 'Consent Agenda',
        type: 'action',
        action_requested: true,
        is_broadcastable: true,
        consent_block: sectionTitle,
        presenters: [],
        documents: parsed.flatMap(p => p.documents),
        subitems: parsed.map(p => ({ item_number: p.item_number, title: p.title })),
        suggested_motion_text: `Move to approve the Consent Agenda: ${listed}.`,
        needs_review: false,
      })
    } else {
      for (const p of parsed) {
        const cls = classify(p.title)
        items.push({
          section_number: sectionNumber,
          section_title: sectionTitle,
          item_number: p.item_number,
          sort_order: items.length,
          title: p.title,
          original_title: p.title,
          type: cls.type,
          action_requested: cls.action_requested,
          is_broadcastable: true,
          consent_block: null,
          presenters: p.presenters,
          documents: p.documents,
          suggested_motion_text: cls.suggested_motion_text,
          needs_review: false,
        })
      }
    }
  }

  // If this is a past meeting, the minutes carry the verbatim motions — prefer the
  // board's actual wording over our generated text, matched by item number (e.g. "7A").
  const motions = extractIcompassMotions(html)
  if (motions.length) {
    for (const it of items) {
      if (it.type !== 'action') continue
      const token = `${it.section_number}${it.item_number}`.toUpperCase()
      const m = motions.find(mo => mo.itemRefs.includes(token))
      if (m) it.suggested_motion_text = m.motionText
    }
  }

  return { sections, agenda_items: items }
}

/** Convenience: fetch + parse in one call. */
export async function importIcompassAgenda(
  baseUrl: string,
  meetingId: number | string,
): Promise<ExtractedAgendaResponse | null> {
  const fetched = await fetchIcompassAgendaHtml(baseUrl, meetingId)
  if (!fetched) return null
  return parseIcompassAgendaHtml(fetched.html)
}
