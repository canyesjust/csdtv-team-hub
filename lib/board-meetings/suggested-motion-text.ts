import type { AgendaItem } from '@/lib/board-meetings/motion-types'

function suggestedTextFromTitleHeuristic(item: AgendaItem): string {
  const title = item.title
  if (item.type === 'action' || /approval of|approve /i.test(title)) {
    if (/^approval of /i.test(title)) {
      return `Move to approve ${title.replace(/^approval of /i, '')}`
    }
    return `Move to ${title.replace(/^approve /i, 'approve ').toLowerCase()}`
  }
  return `Move to approve ${title}`
}

/** Agenda template when set; otherwise title/type heuristics. */
export function resolveSuggestedMotionText(item: AgendaItem | null): string {
  if (!item) return 'Move to approve the item'
  const template = item.suggested_motion_text?.trim()
  if (template) return template
  return suggestedTextFromTitleHeuristic(item)
}
