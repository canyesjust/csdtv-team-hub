export type ShowSponsor = {
  id: string
  name: string
  scope: 'district' | 'school' | 'event'
  on: boolean
  /** Public URL of the sponsor's art. A sponsor bug without it is just text. */
  logo_url?: string | null
}

/**
 * The bug, the rotation slate, the intermission strip and the side panel all
 * read one list. Untick a district sponsor and all four update.
 */
export function activeSponsors(list: ShowSponsor[]): ShowSponsor[] {
  return (list || []).filter(s => s.on)
}

export function sponsorNames(list: ShowSponsor[]): string {
  return activeSponsors(list).map(s => s.name).join('\n')
}

export function sanitizeShowSponsors(input: unknown): ShowSponsor[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, 40).map(raw => {
    const s = (raw || {}) as Record<string, unknown>
    const scope = s.scope === 'district' || s.scope === 'school' ? s.scope : 'event'
    return {
      id: String(s.id ?? '').slice(0, 60),
      name: String(s.name ?? '').slice(0, 160),
      scope: scope as ShowSponsor['scope'],
      on: s.on !== false,
      logo_url: typeof s.logo_url === 'string' && s.logo_url ? s.logo_url.slice(0, 500) : null,
    }
  }).filter(s => s.name)
}

/**
 * Merge the library into a show's list without losing what the operator already
 * decided: a district sponsor that was ticked off stays off, and event-only
 * sponsors added on the show survive untouched.
 */
export function mergeLibraryIntoShow(
  current: ShowSponsor[],
  library: { id: string; name: string; scope: 'district' | 'school'; logo_url?: string | null }[],
): ShowSponsor[] {
  const byId = new Map(current.map(s => [s.id, s]))
  const merged: ShowSponsor[] = library.map(lib => {
    const existing = byId.get(lib.id)
    return {
      id: lib.id, name: lib.name, scope: lib.scope,
      on: existing ? existing.on : true,
      // Art always follows the library, so replacing a sponsor's logo updates
      // every show that carries it rather than only the next one.
      logo_url: lib.logo_url ?? null,
    }
  })
  for (const s of current) {
    if (s.scope === 'event') merged.push(s)
  }
  return merged
}
