import type { LowerThirdPerson } from '@/lib/board-meetings/types'

/**
 * Dais lineup left → right (includes staff at the ends).
 * Used for lower-third quick picks and as the source for board-member seat order.
 *
 * Adding a name here means it always appears as a lower-third slot. If no matching
 * person exists in the People library, the slot renders as a disabled placeholder.
 */
export const BOARD_LOWER_THIRD_ORDER = [
  'leon',
  'holly',
  'jackson',
  'andrew',
  'amber',
  'amanda',
  'katie',
  'karen',
  'mckay',
] as const

/** Staff dais positions — not shown on vote / mover grids. */
const DAIS_STAFF_FIRST_NAMES = new Set(['leon', 'mckay'])

/**
 * Seven voting board members in physical seat order (center dais, left → right).
 */
export const BOARD_MEMBER_SEAT_ORDER = BOARD_LOWER_THIRD_ORDER.filter(
  name => !DAIS_STAFF_FIRST_NAMES.has(name),
)

export function lowerThirdFirstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

export function findBoardMemberByFirstName(
  people: LowerThirdPerson[],
  firstName: string,
): LowerThirdPerson | undefined {
  const key = firstName.toLowerCase()
  return people.find(p => lowerThirdFirstName(p.display_name) === key)
}

/**
 * Returns priority lower-third people in display order.
 * No category filter — so 'staff' (like Leon, McKay) appear alongside 'board_member'.
 * The slot returns null if no person in the People library matches that first name.
 */
export function boardMembersInOrder(people: LowerThirdPerson[]): (LowerThirdPerson | null)[] {
  return BOARD_LOWER_THIRD_ORDER.map(name => findBoardMemberByFirstName(people, name) ?? null)
}

export function seatOrderRank(
  displayName: string,
  order: readonly string[] = BOARD_MEMBER_SEAT_ORDER,
): number {
  const first = lowerThirdFirstName(displayName)
  const idx = order.indexOf(first)
  return idx >= 0 ? idx : order.length
}

/** Sort board members (or any people rows) to match dais seating. Unknown names trail alphabetically. */
export function sortByBoardSeatOrder<T extends { display_name: string }>(
  people: T[],
  order: readonly string[] = BOARD_MEMBER_SEAT_ORDER,
): T[] {
  return [...people].sort((a, b) => {
    const cmp = seatOrderRank(a.display_name, order) - seatOrderRank(b.display_name, order)
    if (cmp !== 0) return cmp
    return a.display_name.localeCompare(b.display_name)
  })
}