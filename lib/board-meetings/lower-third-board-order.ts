import type { LowerThirdPerson } from '@/lib/board-meetings/types'

/** Board member lower-third quick picks (first-name match, display order). */
export const BOARD_LOWER_THIRD_ORDER = [
  'holly',
  'jackson',
  'andrew',
  'amber',
  'amanda',
  'katie',
  'karen',
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

export function boardMembersInOrder(people: LowerThirdPerson[]): (LowerThirdPerson | null)[] {
  const boardOnly = people.filter(p => p.category === 'board_member')
  return BOARD_LOWER_THIRD_ORDER.map(name => findBoardMemberByFirstName(boardOnly, name) ?? null)
}
