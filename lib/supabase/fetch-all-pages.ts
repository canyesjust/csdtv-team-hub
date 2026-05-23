const DEFAULT_PAGE_SIZE = 1000

type PageResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

/** Fetch all rows from a paginated Supabase query (PostgREST defaults to 1000 rows). */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { data: [], error: error.message }
    const page = data ?? []
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  return { data: all, error: null }
}
