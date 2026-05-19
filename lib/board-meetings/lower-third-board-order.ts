import type { LowerThirdPerson } from '@/lib/board-meetings/types'

/**
 * Priority lower-third quick picks for the control surface picker.
 * Includes the 7 board members plus 2 staff who frequently appear on lower thirds.
 * Lookup is by first name (case-insensitive) against the People library.
 *
 * Adding a name here means it always appears as a slot. If no matching person
 * exists in the People library, the slot renders as a disabled placeholder so
 * the operator can see what's missing.
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