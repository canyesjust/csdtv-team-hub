const ALLOWED_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'UL',
  'OL',
  'LI',
  'STRONG',
  'EM',
  'HR',
  'BR',
  'A',
  'BLOCKQUOTE',
  'DIV',
])
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href', 'target', 'rel']),
}

function stripElementAttributes(el: HTMLElement) {
  const tag = el.tagName.toUpperCase()
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

/** Sanitize rich text for safe display (iterative — avoids stack overflow on deep HTML). */
export function sanitizeArticleHtml(input: string): string {
  if (!input) return ''
  if (typeof window === 'undefined') return input

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(input, 'text/html')
    const container = doc.body
    const queue: Node[] = Array.from(container.childNodes)

    while (queue.length > 0) {
      const node = queue.shift()
      if (!node || node.nodeType !== Node.ELEMENT_NODE) continue

      const el = node as HTMLElement
      const tag = el.tagName.toUpperCase()

      if (!ALLOWED_TAGS.has(tag)) {
        const parent = el.parentNode
        if (parent) {
          const children = Array.from(el.childNodes)
          for (const child of children) parent.insertBefore(child, el)
          parent.removeChild(el)
          queue.unshift(...children)
        }
        continue
      }

      stripElementAttributes(el)
      queue.unshift(...Array.from(el.childNodes))
    }

    return container.innerHTML
  } catch {
    return stripArticleHtml(input)
  }
}

export function stripArticleHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
