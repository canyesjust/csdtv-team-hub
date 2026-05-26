/** Strip Outlook/room-booking prefixes so we can match Hub production titles. */
export function normalizeOutlookTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(video|livestream|equipment|recording|csd|canyons?)\s*[-–—:]\s*/i, '')
    .replace(/\b(csd|canyons?|district|school|elementary|middle|high)\b/gi, '')
    .replace(/\d{4}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Hide Outlook row when a Hub production on the same day is the same booking. */
export function outlookEventMatchesProduction(outlookTitle: string, productionTitle: string): boolean {
  const a = normalizeOutlookTitle(outlookTitle)
  const b = normalizeOutlookTitle(productionTitle)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}
