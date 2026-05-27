/** Board meetings + livestreams that use synced production (livestream) URLs and organizer emails. */

export interface YtFollowUpProduction {
  id: string
  request_type_label?: string | null
  type?: string | null
  status?: string | null
  livestream_url?: string | null
  youtube_link_email_sent_at?: string | null
}

export function isBoardOrLivestreamProduction(p: {
  request_type_label?: string | null
  type?: string | null
}): boolean {
  const t = `${p.request_type_label || ''} ${p.type || ''}`.toLowerCase()
  return t.includes('livestream') || t.includes('live stream') || t.includes('board')
}

/** Approved / scheduled or in progress — same cohort as dashboard manager ops. */
export function isYtFollowUpEligibleStatus(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase()
  return s.includes('approved') || s.includes('in progress')
}

export function hasSyncedProductionLink(p: { livestream_url?: string | null }): boolean {
  return !!(p.livestream_url || '').trim()
}

export function organizerYoutubeEmailLogged(
  p: { id: string; youtube_link_email_sent_at?: string | null },
  activityEmailedIds?: ReadonlySet<string>,
): boolean {
  if (p.youtube_link_email_sent_at) return true
  return activityEmailedIds?.has(p.id) ?? false
}

export function isYtEmailPendingProduction(
  p: YtFollowUpProduction,
  activityEmailedIds?: ReadonlySet<string>,
): boolean {
  if (p.status === 'Abandoned') return false
  if (!isBoardOrLivestreamProduction(p)) return false
  if (!isYtFollowUpEligibleStatus(p.status)) return false
  if (!hasSyncedProductionLink(p)) return false
  return !organizerYoutubeEmailLogged(p, activityEmailedIds)
}

export function isYtMissingLinkProduction(p: YtFollowUpProduction): boolean {
  if (p.status === 'Abandoned') return false
  if (!isBoardOrLivestreamProduction(p)) return false
  if (!isYtFollowUpEligibleStatus(p.status)) return false
  return !hasSyncedProductionLink(p)
}

/** Activity rows that count as organizer YouTube link email sent. */
export function productionIdsFromOrganizerYoutubeActivity(
  rows: { production_id: string; detail: string | null }[],
): Set<string> {
  const ids = new Set<string>()
  for (const row of rows) {
    const det = (row.detail || '').toLowerCase()
    if (det.includes('youtube') || (det.includes('template:') && det.includes('livestream'))) {
      ids.add(row.production_id)
    }
  }
  return ids
}
