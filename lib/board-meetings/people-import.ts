import type { SupabaseClient } from '@supabase/supabase-js'

const ALLOWED_CATEGORIES = ['board_member', 'staff', 'presenter', 'other'] as const
export type PeopleCategory = (typeof ALLOWED_CATEGORIES)[number]

/** Role placeholders from inferred presenters — not real people. */
const INFERRED_ROLE_NAMES = new Set(
  ['board president', 'superintendent', 'business administrator'].map(s => s.toLowerCase()),
)

const HONORIFIC_RE = /\b(dr|mr|mrs|ms|miss|prof|hon)\.?\s*/gi
const SUFFIX_RE = /\s*,?\s*\b(jr|sr|ii|iii|iv|esq)\.?\s*$/i

export type PeopleImportRow = {
  display_name: string
  primary_title: string | null
  affiliation: string | null
  category: PeopleCategory
  officer_position: string | null
  error?: string
}

/** Canonical key for deduplicating person names (import, lock sync, etc.). */
export function normalizePersonName(name: string): string {
  let s = name.trim().replace(/\s+/g, ' ')
  if (!s) return ''

  const commaMatch = s.match(/^([^,]+),\s*(.+)$/)
  if (commaMatch) {
    s = `${commaMatch[2].trim()} ${commaMatch[1].trim()}`
  }

  s = s.replace(HONORIFIC_RE, '').replace(SUFFIX_RE, '')
  s = s.replace(/[.'"]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return s
}

/** Extra lookup keys for the same person (e.g. "Last, First" vs "First Last"). */
export function personNameLookupKeys(name: string): string[] {
  const norm = normalizePersonName(name)
  if (!norm) return []

  const keys = new Set<string>([norm])
  const parts = norm.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    const firstParts = parts.slice(0, -1)
    keys.add(`${last} ${firstParts.join(' ')}`)
    keys.add(normalizePersonName(`${last}, ${firstParts.join(' ')}`))
  }
  return [...keys]
}

export type PersonNameIndex = Map<string, string>

export function buildPeopleNameIndex(
  people: { id: string; display_name: string }[],
): PersonNameIndex {
  const index: PersonNameIndex = new Map()
  for (const p of people) {
    for (const key of personNameLookupKeys(p.display_name)) {
      if (!index.has(key)) index.set(key, p.id)
    }
  }
  return index
}

export function findPersonIdByName(index: PersonNameIndex, rawName: string): string | undefined {
  for (const key of personNameLookupKeys(rawName)) {
    const id = index.get(key)
    if (id) return id
  }
  return undefined
}

export function registerPersonInIndex(
  index: PersonNameIndex,
  id: string,
  displayName: string,
): void {
  for (const key of personNameLookupKeys(displayName)) {
    if (!index.has(key)) index.set(key, id)
  }
}

export function isInferredRolePresenter(name: string): boolean {
  return INFERRED_ROLE_NAMES.has(normalizePersonName(name))
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

export function parsePeopleImportCsv(input: string): PeopleImportRow[] {
  const lines = input.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headerLower = lines[0].toLowerCase()
  const hasHeader =
    headerLower.includes('name') ||
    headerLower.includes('display') ||
    headerLower.includes('title') ||
    headerLower.includes('category')

  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map(line => {
    const cells = parseCSVLine(line, delimiter)
    const display_name = (cells[0] || '').trim()
    const primary_title = (cells[1] || '').trim() || null
    const affiliation = (cells[2] || '').trim() || null
    const categoryRaw = (cells[3] || 'presenter').trim().toLowerCase().replace(/\s+/g, '_')
    const category = (
      ALLOWED_CATEGORIES.includes(categoryRaw as PeopleCategory) ? categoryRaw : 'presenter'
    ) as PeopleCategory
    const officer_position =
      category === 'board_member' ? (cells[4] || '').trim() || null : null

    const row: PeopleImportRow = {
      display_name,
      primary_title,
      affiliation,
      category,
      officer_position,
    }
    if (!display_name) row.error = 'Missing display name'
    else if (isInferredRolePresenter(display_name)) row.error = 'Skipped role placeholder'
    return row
  })
}

export type PeopleImportResult = {
  created: number
  updated: number
  skipped: number
  matched_existing: number
  errors: string[]
}

export async function importPeopleRows(
  service: SupabaseClient,
  rows: PeopleImportRow[],
  createdBy: string,
): Promise<PeopleImportResult> {
  const result: PeopleImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    matched_existing: 0,
    errors: [],
  }

  const { data: existing } = await service
    .from('lower_third_people')
    .select('id, display_name, primary_title, affiliation, category, officer_position')

  const index = buildPeopleNameIndex(existing || [])
  const byId = new Map((existing || []).map(p => [p.id, p]))

  for (const row of rows) {
    if (row.error) {
      result.skipped++
      result.errors.push(row.error)
      continue
    }

    const matchId = findPersonIdByName(index, row.display_name)

    if (matchId) {
      const current = byId.get(matchId)
      const patch: Record<string, unknown> = {
        is_active: true,
        updated_at: new Date().toISOString(),
      }
      if (row.primary_title) patch.primary_title = row.primary_title
      if (row.affiliation) patch.affiliation = row.affiliation
      if (row.category) patch.category = row.category
      if (row.officer_position) patch.officer_position = row.officer_position

      const { error } = await service.from('lower_third_people').update(patch).eq('id', matchId)
      if (error) {
        result.errors.push(`${row.display_name}: ${error.message}`)
        continue
      }
      result.matched_existing++
      if (Object.keys(patch).length > 2) result.updated++
      registerPersonInIndex(index, matchId, row.display_name)
      continue
    }

    const { data: inserted, error } = await service
      .from('lower_third_people')
      .insert({
        display_name: row.display_name,
        primary_title: row.primary_title,
        affiliation: row.affiliation,
        category: row.category,
        officer_position: row.officer_position,
        is_active: true,
        created_by: createdBy,
      })
      .select('id, display_name')
      .single()

    if (error || !inserted) {
      result.errors.push(`${row.display_name}: ${error?.message || 'Insert failed'}`)
      continue
    }
    registerPersonInIndex(index, inserted.id, inserted.display_name)
    byId.set(inserted.id, {
      id: inserted.id,
      display_name: inserted.display_name,
      primary_title: row.primary_title,
      affiliation: row.affiliation,
      category: row.category,
      officer_position: row.officer_position,
    })
    result.created++
  }

  return result
}

export type PresenterSyncResult = {
  created: number
  linked: number
  matched_existing: number
  skipped_placeholders: number
}

type AgendaPresenterRow = {
  id: string
  agenda_item_id: string
  name: string
  title: string | null
  affiliation: string | null
  person_id: string | null
}

/** On agenda lock: add extracted presenters to people library and link person_id on agenda presenters. */
export async function syncAgendaPresentersToPeopleLibrary(
  service: SupabaseClient,
  boardMeetingId: string,
  createdBy: string,
): Promise<PresenterSyncResult> {
  const result: PresenterSyncResult = {
    created: 0,
    linked: 0,
    matched_existing: 0,
    skipped_placeholders: 0,
  }

  const { data: items } = await service
    .from('board_meeting_agenda_items')
    .select('id')
    .eq('board_meeting_id', boardMeetingId)

  const itemIds = (items || []).map(i => i.id)
  if (itemIds.length === 0) return result

  const { data: presenters } = await service
    .from('board_meeting_presenters')
    .select('id, agenda_item_id, name, title, affiliation, person_id')
    .in('agenda_item_id', itemIds)

  const rows = (presenters || []) as AgendaPresenterRow[]
  if (rows.length === 0) return result

  const { data: people } = await service
    .from('lower_third_people')
    .select('id, display_name, primary_title, affiliation')

  const index = buildPeopleNameIndex(people || [])
  const peopleById = new Map((people || []).map(p => [p.id, p]))

  const uniqueByNorm = new Map<
    string,
    { name: string; title: string | null; affiliation: string | null; personId?: string }
  >()

  for (const row of rows) {
    const name = row.name?.trim()
    if (!name) continue
    if (isInferredRolePresenter(name)) {
      result.skipped_placeholders++
      continue
    }

    const norm = normalizePersonName(name)
    let personId: string | undefined

    if (row.person_id && peopleById.has(row.person_id)) {
      personId = row.person_id
    } else {
      personId = findPersonIdByName(index, name)
    }

    const existing = uniqueByNorm.get(norm)
    if (!existing) {
      uniqueByNorm.set(norm, {
        name,
        title: row.title ?? null,
        affiliation: row.affiliation ?? null,
        personId,
      })
    } else if (!existing.personId && personId) {
      existing.personId = personId
    }
  }

  for (const [, person] of uniqueByNorm) {
    let personId = person.personId

    if (!personId) {
      personId = findPersonIdByName(index, person.name)
    }

    if (personId) {
      result.matched_existing++
      const record = peopleById.get(personId)
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), is_active: true }
      if (person.title && !record?.primary_title) patch.primary_title = person.title
      if (person.affiliation && !record?.affiliation) patch.affiliation = person.affiliation
      if (Object.keys(patch).length > 2) {
        await service.from('lower_third_people').update(patch).eq('id', personId)
      }
    } else {
      const { data: inserted, error } = await service
        .from('lower_third_people')
        .insert({
          display_name: person.name,
          primary_title: person.title,
          affiliation: person.affiliation,
          category: 'presenter',
          is_active: true,
          created_by: createdBy,
        })
        .select('id, display_name, primary_title, affiliation')
        .single()
      if (error || !inserted) continue
      personId = inserted.id
      peopleById.set(personId, inserted)
      registerPersonInIndex(index, personId, inserted.display_name)
      result.created++
    }

    const norm = normalizePersonName(person.name)
    const toLink = rows.filter(
      r => !isInferredRolePresenter(r.name) && normalizePersonName(r.name) === norm,
    )
    for (const pres of toLink) {
      if (pres.person_id === personId) continue
      const { error } = await service
        .from('board_meeting_presenters')
        .update({ person_id: personId })
        .eq('id', pres.id)
      if (!error) result.linked++
    }
  }

  return result
}
