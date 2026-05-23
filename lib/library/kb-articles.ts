import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages } from '@/lib/supabase/fetch-all-pages'

export type KbArticleRow = {
  id: string
  title: string
  content: string
  category: string
  created_by: string | null
  updated_by: string | null
  updated_at: string
  pinned: boolean
}

export type KbArticleWithAuthors = KbArticleRow & {
  author?: { name: string } | null
  editor?: { name: string } | null
}

function teamNameMap(rows: { id: string; name: string }[] | null): Map<string, string> {
  return new Map((rows ?? []).map((t) => [t.id, t.name]))
}

function normalizeRow(row: Record<string, unknown>): KbArticleRow {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    category: String(row.category ?? 'Other'),
    created_by: row.created_by != null ? String(row.created_by) : null,
    updated_by: row.updated_by != null ? String(row.updated_by) : null,
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    pinned: Boolean(row.pinned),
  }
}

export function attachKbArticleAuthors(
  row: KbArticleRow,
  names: Map<string, string>,
): KbArticleWithAuthors {
  return {
    ...row,
    author: row.created_by ? { name: names.get(row.created_by) ?? '' } : null,
    editor: row.updated_by ? { name: names.get(row.updated_by) ?? '' } : null,
  }
}

/**
 * Load Library articles without PostgREST embeds.
 * (Production DB may not have knowledge_base → team foreign keys.)
 */
export async function fetchKnowledgeBaseArticles(supabase: SupabaseClient): Promise<{
  data: KbArticleWithAuthors[]
  error: string | null
}> {
  const [articlesResult, teamRes] = await Promise.all([
    fetchAllPages<Record<string, unknown>>(async (from, to) => {
      const res = await supabase
        .from('knowledge_base')
        .select('*')
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .range(from, to)
      return { data: res.data, error: res.error }
    }),
    supabase.from('team').select('id, name'),
  ])

  if (articlesResult.error) {
    return { data: [], error: articlesResult.error }
  }

  const names = teamNameMap(teamRes.data)
  const data = articlesResult.data.map((row) =>
    attachKbArticleAuthors(normalizeRow(row), names),
  )
  return { data, error: null }
}
