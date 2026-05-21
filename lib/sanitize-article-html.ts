const ALLOWED_TAGS = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'HR', 'BR', 'A'])
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href', 'target', 'rel']),
}

/** Sanitize rich text from TipTap for safe display. */
export function sanitizeArticleHtml(input: string): string {
  if (!input) return ''
  if (typeof window === 'undefined') return input

  const parser = new DOMParser()
  const doc = parser.parseFromString(input, 'text/html')

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName.toUpperCase()

      if (!ALLOWED_TAGS.has(tag)) {
        const parent = el.parentNode
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el)
          parent.removeChild(el)
        }
        return
      }

      const allowed = ALLOWED_ATTRS[tag] || new Set<string>()
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        if (!allowed.has(attr.name)) {
          el.removeAttribute(attr.name)
          continue
        }
        if (name === 'href') {
          const href = (attr.value || '').trim()
          if (!/^https?:\/\//i.test(href) && !href.startsWith('/')) {
            el.removeAttribute('href')
          }
        }
      }
      if (tag === 'A') {
        el.setAttribute('rel', 'noopener noreferrer')
        if (!el.getAttribute('target')) el.setAttribute('target', '_blank')
      }
    }

    for (const child of Array.from(node.childNodes)) walk(child)
  }

  walk(doc.body)
  return doc.body.innerHTML
}

export function stripArticleHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
