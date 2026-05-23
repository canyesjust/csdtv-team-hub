/** Normalize titles for fuzzy matching between checklist items and Library articles. */
export function normalizeTitleForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Extract article name from checklist titles like "Read Equipment Checkout Policy in Library".
 */
export function extractLibraryTitleFromChecklistItem(itemTitle: string): string | null {
  const readMatch = itemTitle.match(/read\s+(.+?)\s+in\s+library/i)
  if (readMatch) return readMatch[1].trim()
  if (/review\s+all\s+library/i.test(itemTitle)) return null
  return null
}

export function matchArticleIdForTemplateItem(
  itemTitle: string,
  articles: { id: string; title: string }[],
): string | null {
  if (!articles.length) return null

  const lookup = articles.map((a) => ({
    id: a.id,
    norm: normalizeTitleForMatch(a.title),
  }))

  const candidates = [
    extractLibraryTitleFromChecklistItem(itemTitle),
    itemTitle.trim(),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const norm = normalizeTitleForMatch(candidate)
    if (!norm) continue

    const exact = lookup.find((a) => a.norm === norm)
    if (exact) return exact.id

    const contains = lookup.find((a) => a.norm.includes(norm) || norm.includes(a.norm))
    if (contains) return contains.id
  }

  return null
}

export function planLibraryLinksForTemplateItems(
  items: { id: string; title: string; library_article_id: string | null; active: boolean }[],
  articles: { id: string; title: string }[],
): { itemId: string; articleId: string; articleTitle: string }[] {
  const planned: { itemId: string; articleId: string; articleTitle: string }[] = []
  for (const item of items) {
    if (!item.active || item.library_article_id) continue
    const articleId = matchArticleIdForTemplateItem(item.title, articles)
    if (!articleId) continue
    const articleTitle = articles.find((a) => a.id === articleId)?.title ?? ''
    planned.push({ itemId: item.id, articleId, articleTitle })
  }
  return planned
}
