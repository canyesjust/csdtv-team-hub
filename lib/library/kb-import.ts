import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages } from '@/lib/supabase/fetch-all-pages'
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

/** How to handle rows whose title already exists in Library. */
export type KbImportDuplicateMode = 'skip' | 'update' | 'allow'

const MAX_IMPORT_ROWS = 200

export function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase()
}

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

function fieldToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** Accept `[...]` or `{ "articles": [...] }`. */
export function unwrapKbImportJsonRoot(parsed: unknown): unknown[] | { error: string } {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    const articles = (parsed as { articles?: unknown }).articles
    if (Array.isArray(articles)) return articles
  }
  return { error: 'JSON must be an array of articles, or { "articles": [ ... ] }' }
}

function rowFromFields(
  rowNum: number,
  title: string,
  category: string,
  content: string,
  opts?: { normalizeContent?: boolean },
): KbImportRow {
  const t = title.trim()
  if (!t) {
    return { row: rowNum, title: '', category: 'Other', content: '', error: 'Missing title' }
  }
  if (!content.trim()) {
    return { row: rowNum, title: t, category: normalizeKbCategory(category), content: '', error: 'Missing content' }
  }
  const normalizeContent = opts?.normalizeContent !== false
  return {
    row: rowNum,
    title: t,
    category: normalizeKbCategory(category),
    content: normalizeContent ? normalizeKbContent(content) : content.trim(),
  }
}

function rowFromJsonItem(rowNum: number, item: unknown, opts?: { normalizeContent?: boolean }): KbImportRow {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return {
      row: rowNum,
      title: '',
      category: 'Other',
      content: '',
      error: 'Each entry must be an object with title and content',
    }
  }
  const record = item as Record<string, unknown>
  const title = fieldToString(record.title ?? record.name)
  const category = fieldToString(record.category ?? record.type ?? 'Other')
  const rawContent = record.content ?? record.body ?? record.html ?? record.text
  if (rawContent != null && typeof rawContent === 'object') {
    return {
      row: rowNum,
      title: title.trim(),
      category: normalizeKbCategory(category),
      content: '',
      error: 'content must be a string (HTML or plain text), not an object',
    }
  }
  const content = fieldToString(rawContent)
  return rowFromFields(rowNum, title, category, content, opts)
}

function headerIndex(headers: string[], names: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (names.some((n) => h === n || h.includes(n))) return i
  }
  return -1
}

export function parseKbImportCsv(
  input: string,
  opts?: { normalizeContent?: boolean },
): KbImportRow[] {
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
    rows.push(rowFromFields(i + 1, title, category, content, opts))
  }
  return rows
}

export function parseKbImportJson(
  input: string,
  opts?: { normalizeContent?: boolean },
): KbImportRow[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    return [{ row: 1, title: '', category: 'Other', content: '', error: 'Invalid JSON — check commas, quotes, and brackets' }]
  }
  const unwrapped = unwrapKbImportJsonRoot(parsed)
  if (!Array.isArray(unwrapped)) {
    return [{ row: 1, title: '', category: 'Other', content: '', error: unwrapped.error }]
  }
  const rows: KbImportRow[] = []
  for (let i = 0; i < unwrapped.length && rows.length < MAX_IMPORT_ROWS; i++) {
    rows.push(rowFromJsonItem(i + 1, unwrapped[i], opts))
  }
  return rows
}

export function parseKbImportPayload(
  input: string,
  format: 'csv' | 'json',
  opts?: { normalizeContent?: boolean },
): KbImportRow[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  if (format === 'json') return parseKbImportJson(trimmed, opts)
  return parseKbImportCsv(trimmed)
}

export const KB_IMPORT_CSV_TEMPLATE = `title,category,content
Livestream setup,Process,"Step 1: Check audio levels.

Step 2: Start the encoder."
Equipment policy,Policy,"All gear must be checked out through the team portal."`

export const KB_IMPORT_JSON_TEMPLATE = JSON.stringify(
  [
    {
      title: 'Equipment Checkout Policy',
      category: 'Policy',
      content:
        '<h2>Overview</h2><p>All CSDTV gear must be checked out through the Team Hub equipment system.</p>',
    },
    {
      title: 'Livestream Setup Process',
      category: 'Process',
      content: '<h2>Day of show</h2><ol><li>Pack kit.</li><li>Test audio.</li><li>Go live.</li></ol>',
    },
  ],
  null,
  2,
)

export type KbImportResult = {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

export async function importKbArticles(
  supabase: SupabaseClient,
  rows: KbImportRow[],
  userId: string,
  duplicateMode: KbImportDuplicateMode = 'skip',
): Promise<KbImportResult> {
  const valid = rows.filter((r) => !r.error)
  const errors = rows.filter((r) => r.error).map((r) => `Row ${r.row}: ${r.error}`)

  if (valid.length === 0) {
    return { created: 0, updated: 0, skipped: rows.length, errors }
  }

  const existingResult = await fetchAllPages<{ id: string; title: string }>(async (from, to) => {
    const res = await supabase.from('knowledge_base').select('id, title').range(from, to)
    return { data: res.data, error: res.error }
  })

  if (existingResult.error) {
    return { created: 0, updated: 0, skipped: rows.length, errors: [...errors, existingResult.error] }
  }

  const existingByTitle = new Map<string, { id: string; title: string }>()
  for (const row of existingResult.data) {
    const key = normalizeTitleKey(row.title)
    if (!existingByTitle.has(key)) {
      existingByTitle.set(key, { id: row.id as string, title: row.title as string })
    }
  }

  const now = new Date().toISOString()
  let created = 0
  let updated = 0
  let skipped = rows.length - valid.length

  const toInsert: {
    title: string
    category: string
    content: string
    created_by: string
    updated_by: string
    updated_at: string
    pinned: boolean
  }[] = []

  for (const row of valid) {
    const key = normalizeTitleKey(row.title)
    const existing = existingByTitle.get(key)

    if (existing) {
      if (duplicateMode === 'skip') {
        skipped += 1
        continue
      }
      if (duplicateMode === 'update') {
        const { error: updateErr } = await supabase
          .from('knowledge_base')
          .update({
            category: row.category,
            content: row.content,
            updated_by: userId,
            updated_at: now,
          })
          .eq('id', existing.id)
        if (updateErr) {
          errors.push(`Row ${row.row}: ${updateErr.message}`)
          skipped += 1
        } else {
          updated += 1
        }
        continue
      }
    }

    toInsert.push({
      title: row.title,
      category: row.category,
      content: row.content,
      created_by: userId,
      updated_by: userId,
      updated_at: now,
      pinned: false,
    })
    if (!existing) {
      existingByTitle.set(key, { id: `pending-${key}`, title: row.title })
    }
  }

  if (toInsert.length > 0) {
    const { data, error } = await supabase.from('knowledge_base').insert(toInsert).select('id')
    if (error) {
      return {
        created: 0,
        updated,
        skipped: rows.length,
        errors: [...errors, error.message],
      }
    }
    created = data?.length ?? 0
  }

  return { created, updated, skipped, errors }
}
