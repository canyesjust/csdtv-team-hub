import { sanitizeArticleHtml } from '@/lib/sanitize-article-html'

export type PrintableArticle = {
  title: string
  category: string
  content: string
  updated_at?: string
  authorName?: string | null
}

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    color: #111;
    line-height: 1.6;
    margin: 0;
    padding: 24px 32px;
    max-width: 8.5in;
  }
  .meta {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    color: #555;
    margin: 0 0 8px;
  }
  .category {
    display: inline-block;
    font-family: system-ui, sans-serif;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #1e6cb5;
    margin-bottom: 8px;
  }
  h1 {
    font-family: system-ui, sans-serif;
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 20px;
    line-height: 1.25;
  }
  .article-content h2 {
    font-family: system-ui, sans-serif;
    font-size: 16px;
    font-weight: 600;
    margin: 24px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #ddd;
  }
  .article-content h3 {
    font-family: system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    margin: 18px 0 6px;
  }
  .article-content p { margin: 0 0 12px; }
  .article-content ul, .article-content ol {
    margin: 0 0 14px;
    padding-left: 24px;
  }
  .article-content li { margin-bottom: 6px; }
  .article-content hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 20px 0;
  }
  .article-content a { color: #1e6cb5; }
  @media print {
    body { padding: 0.5in; }
  }
`

/** Open a print-friendly window for a Library article. */
export function printLibraryArticle(article: PrintableArticle): boolean {
  if (typeof window === 'undefined') return false

  const safeHtml = sanitizeArticleHtml(article.content || '')
  const updated = article.updated_at
    ? new Date(article.updated_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  const metaParts = [
    article.authorName ? `By ${article.authorName}` : null,
    updated ? `Updated ${updated}` : null,
  ].filter(Boolean)

  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!win) return false

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(article.title)} — CSDTV Library</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="category">${escapeHtml(article.category)}</div>
  <h1>${escapeHtml(article.title)}</h1>
  ${metaParts.length ? `<p class="meta">${escapeHtml(metaParts.join(' · '))}</p>` : ''}
  <div class="article-content">${safeHtml}</div>
  <script>
    window.onload = function() {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`)
  win.document.close()
  return true
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
