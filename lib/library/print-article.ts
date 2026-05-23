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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPrintDocument(article: PrintableArticle): string {
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

  return `<!DOCTYPE html>
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
</body>
</html>`
}

/**
 * Print via hidden off-screen iframe (avoids popup blockers and noopener null window issues).
 */
export function printLibraryArticle(article: PrintableArticle): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false

  const html = buildPrintDocument(article)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Print article')
  // Sized for layout; positioned off-screen so print preview is not blank.
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:8.5in;height:11in;border:0;visibility:hidden;'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    return false
  }

  let printed = false
  const cleanup = () => {
    if (iframe.parentNode) iframe.remove()
  }

  const runPrint = () => {
    if (printed) return true
    printed = true
    try {
      win.focus()
      win.print()
    } catch {
      cleanup()
      return false
    }
    win.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(cleanup, 60_000)
    return true
  }

  const schedulePrint = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => runPrint())
    })
  }

  iframe.onload = schedulePrint

  doc.open()
  doc.write(html)
  doc.close()

  // Fallback if onload already fired or never fires (e.g. cached about:blank).
  setTimeout(schedulePrint, 400)

  return true
}
