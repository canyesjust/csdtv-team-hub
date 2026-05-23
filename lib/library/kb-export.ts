import type { KbArticleCategory } from './kb-import'

export type KbExportArticle = {
  title: string
  category: string
  content: string
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function articlesToJson(articles: KbExportArticle[]): string {
  return JSON.stringify(
    articles.map((a) => ({
      title: a.title,
      category: a.category,
      content: a.content,
    })),
    null,
    2,
  )
}

export function articlesToCsv(articles: KbExportArticle[]): string {
  const lines = ['title,category,content']
  for (const a of articles) {
    lines.push(
      [escapeCsvField(a.title), escapeCsvField(a.category), escapeCsvField(a.content)].join(','),
    )
  }
  return lines.join('\n')
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadArticlesExport(
  articles: KbExportArticle[],
  format: 'json' | 'csv',
  filenamePrefix = 'library-articles',
) {
  const date = new Date().toISOString().slice(0, 10)
  if (format === 'json') {
    downloadTextFile(
      `${filenamePrefix}-${date}.json`,
      articlesToJson(articles),
      'application/json;charset=utf-8',
    )
  } else {
    downloadTextFile(
      `${filenamePrefix}-${date}.csv`,
      articlesToCsv(articles),
      'text/csv;charset=utf-8',
    )
  }
}

export function mapArticlesForExport(
  rows: { title: string; category: string; content: string }[],
): KbExportArticle[] {
  return rows.map((r) => ({
    title: r.title,
    category: r.category as KbArticleCategory,
    content: r.content,
  }))
}
