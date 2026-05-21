import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeArticleHtml } from '@/lib/sanitize-article-html'

export const KB_ARTICLE_CATEGORIES = ['Process', 'Reference', 'Policy', 'Workflow', 'Other'] as const
export type KbArticleCategory = (typeof KB_ARTICLE_CATEGORIES)[number]

export type KbImportRow = {
  row: number
  title: string
  category: KbArticleCategory
  content: string
  error?: string
}

const MAX_IMPORT_ROWS = 200

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function normalizeKbCategory(raw: string): KbArticleCategory {
  const t = raw.trim()
  const match = KB_ARTICLE_CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase())
  return match || 'Other'
}

/** Plain text → paragraphs; existing HTML is sanitized. */
export function normalizeKbContent(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '<p></p>'
  if (/<\s*[a-z][\s\S]*>/i.test(trimmed)) {
    return sanitizeArticleHtml(trimmed)
  }
  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return '<p></p>'
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function rowFromFields(rowNum: number, title: string, category: string, content: string): KbImportRow {
  const t = title.trim()
  if (!t) {
    return { row: rowNum, title: '', category: 'Other', content: '', error: 'Missing title' }
  }
  if (!content.trim()) {
    return { row: rowNum, title: t, category: normalizeKbCategory(category), content: '', error: 'Missing content' }
  }
  return {
    row: rowNum,
    title: t,
    category: normalizeKbCategory(category),
    content: normalizeKbContent(content),
  }
}

function headerIndex(headers: string[], names: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (names.some((n) => h === n || h.includes(n))) return i
  }
  return -1
}

export function parseKbImportCsv(input: string): KbImportRow[] {
  const lines = input.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const firstCells = parseCSVLine(lines[0], delimiter)
  const headerLower = lines[0].toLowerCase()
  const hasHeader =
    headerLower.includes('title') ||
    headerLower.includes('content') ||
    headerLower.includes('category')

  let titleIdx = 0
  let categoryIdx = 1
  let contentIdx = 2
  let startLine = 0

  if (hasHeader) {
    const headers = firstCells.map((c) => c.toLowerCase())
    titleIdx = headerIndex(headers, ['title', 'name', 'article'])
    categoryIdx = headerIndex(headers, ['category', 'type', 'topic'])
    contentIdx = headerIndex(headers, ['content', 'body', 'html', 'text', 'article'])
    if (titleIdx < 0) titleIdx = 0
    if (categoryIdx < 0) categoryIdx = 1
    if (contentIdx < 0) contentIdx = 2
    startLine = 1
  }

  const rows: KbImportRow[] = []
  for (let i = startLine; i < lines.length && rows.length < MAX_IMPORT_ROWS; i++) {
    const cells = parseCSVLine(lines[i], delimiter)
    const title = cells[titleIdx] ?? ''
    const category = cells[categoryIdx] ?? 'Other'
    const content = cells[contentIdx] ?? cells.slice(Math.max(titleIdx, categoryIdx, contentIdx) + 1).join('\n')
    rows.push(rowFromFields(i + 1, title, category, content))
  }
  return rows
}

export function parseKbImportJson(input: string): KbImportRow[] {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch {
    return [{ row: 1, title: '', category: 'Other', content: '', error: 'Invalid JSON' }]
  }
  if (!Array.isArray(data)) {
    return [{ row: 1, title: '', category: 'Other', content: '', error: 'JSON must be an array of articles' }]
  }
  const rows: KbImportRow[] = []
  for (let i = 0; i < data.length && rows.length < MAX_IMPORT_ROWS; i++) {
    const item = data[i] as Record<string, unknown>
    const title = String(item.title ?? item.name ?? '')
    const category = String(item.category ?? item.type ?? 'Other')
    const content = String(item.content ?? item.body ?? item.html ?? item.text ?? '')
    rows.push(rowFromFields(i + 1, title, category, content))
  }
  return rows
}

export function parseKbImportPayload(input: string, format: 'csv' | 'json'): KbImportRow[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  if (format === 'json') return parseKbImportJson(trimmed)
  return parseKbImportCsv(trimmed)
}

export const KB_IMPORT_CSV_TEMPLATE = `title,category,content
Livestream setup,Process,"Step 1: Check audio levels.

Step 2: Start the encoder."
Equipment policy,Policy,"All gear must be checked out through the team portal."`

export async function importKbArticles(
  supabase: SupabaseClient,
  rows: KbImportRow[],
  userId: string,
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const valid = rows.filter((r) => !r.error)
  const errors = rows.filter((r) => r.error).map((r) => `Row ${r.row}: ${r.error}`)

  if (valid.length === 0) {
    return { created: 0, skipped: rows.length, errors }
  }

  const now = new Date().toISOString()
  const payloads = valid.map((r) => ({
    title: r.title,
    category: r.category,
    content: r.content,
    created_by: userId,
    updated_by: userId,
    updated_at: now,
    pinned: false,
  }))

  const { data, error } = await supabase.from('knowledge_base').insert(payloads).select('id')
  if (error) {
    return { created: 0, skipped: rows.length, errors: [...errors, error.message] }
  }

  return {
    created: data?.length ?? 0,
    skipped: rows.length - valid.length,
    errors,
  }
}
