'use client'

import { useMemo } from 'react'
import { sanitizeArticleHtml, stripArticleHtml } from '@/lib/sanitize-article-html'

type Props = {
  html: string
  emptyLabel?: string
}

export default function ArticleBody({ html, emptyLabel = 'No content yet.' }: Props) {
  const safeHtml = useMemo(() => {
    try {
      return sanitizeArticleHtml(html || '')
    } catch {
      return ''
    }
  }, [html])

  const plainFallback = useMemo(() => stripArticleHtml(html || ''), [html])

  if (!safeHtml && !plainFallback) {
    return <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: 0 }}>{emptyLabel}</p>
  }

  if (!safeHtml) {
    return (
      <p style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>
        {plainFallback}
      </p>
    )
  }

  return <div className="article-content" dangerouslySetInnerHTML={{ __html: safeHtml }} />
}
