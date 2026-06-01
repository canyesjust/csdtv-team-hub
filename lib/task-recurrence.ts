import type { SupabaseClient } from '@supabase/supabase-js'

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Days from the "show" weekday forward to the "due" weekday within the same cycle
 * (e.g. Wed=3 -> Fri=5 is 2). Wrapping is allowed so Fri -> Mon rolls into next week.
 */
export function weekdayOffset(showWeekday: number, dueWeekday: number): number {
  return ((dueWeekday - showWeekday) % 7 + 7) % 7
}

export interface RecurrenceFormState {
  frequency: '' | RecurrenceFrequency
  showWeekday: number
  dueWeekday: number
  showMonthday: number
  dueOffsetDays: number
  startDate: string
  endDate: string
}

export function defaultRecurrenceForm(): RecurrenceFormState {
  return {
    frequency: '',
    showWeekday: 3, // Wednesday
    dueWeekday: 5, // Friday
    showMonthday: new Date().getDate(),
    dueOffsetDays: 0,
    startDate: localDateStr(),
    endDate: '',
  }
}

export interface RecurrenceInsert {
  title: string
  description: string | null
  priority: string
  production_id: string | null
  needs_equipment: boolean
  hide_from_signage: boolean
  frequency: RecurrenceFrequency
  interval: number
  show_weekday: number | null
  show_monthday: number | null
  due_offset_days: number
  start_date: string
  end_date: string | null
  assignment_mode: 'fanout'
  active: boolean
  created_by: string
}

/** Build the task_recurrences insert payload from form state. */
export function buildRecurrenceInsert(
  base: {
    title: string
    description: string | null
    priority: string
    production_id: string | null
    needs_equipment: boolean
    hide_from_signage: boolean
    createdBy: string
  },
  rec: RecurrenceFormState,
): RecurrenceInsert | null {
  if (!rec.frequency) return null
  const dueOffset =
    rec.frequency === 'weekly'
      ? weekdayOffset(rec.showWeekday, rec.dueWeekday)
      : Math.max(0, rec.dueOffsetDays)
  return {
    title: base.title,
    description: base.description,
    priority: base.priority,
    production_id: base.production_id,
    needs_equipment: base.needs_equipment,
    hide_from_signage: base.hide_from_signage,
    frequency: rec.frequency,
    interval: 1,
    show_weekday: rec.frequency === 'weekly' ? rec.showWeekday : null,
    show_monthday: rec.frequency === 'monthly' ? rec.showMonthday : null,
    due_offset_days: dueOffset,
    start_date: rec.startDate || localDateStr(),
    end_date: rec.endDate || null,
    assignment_mode: 'fanout',
    active: true,
    created_by: base.createdBy,
  }
}

/** Human-readable summary of a recurrence for the create form. */
export function describeRecurrence(rec: RecurrenceFormState, assigneeCount: number): string {
  if (!rec.frequency) return ''
  let cadence: string
  if (rec.frequency === 'weekly') {
    const offset = weekdayOffset(rec.showWeekday, rec.dueWeekday)
    const dueSameWeek = offset >= rec.dueWeekday - rec.showWeekday && rec.dueWeekday >= rec.showWeekday
    cadence = `Every week: appears ${WEEKDAY_SHORT[rec.showWeekday]}, due ${WEEKDAY_SHORT[rec.dueWeekday]}${dueSameWeek ? '' : ' (next week)'}`
  } else if (rec.frequency === 'monthly') {
    cadence = `Every month on day ${rec.showMonthday}${rec.dueOffsetDays > 0 ? `, due ${rec.dueOffsetDays}d later` : ''}`
  } else {
    cadence = `Every day${rec.dueOffsetDays > 0 ? `, due ${rec.dueOffsetDays}d later` : ''}`
  }
  const until = rec.endDate ? ` until ${rec.endDate}` : ' (no end date)'
  const who =
    assigneeCount === 0
      ? ' — no one selected yet'
      : ` — each of ${assigneeCount} ${assigneeCount === 1 ? 'person' : 'people'} gets their own copy`
  return `${cadence}${until}.${who}`
}

/**
 * Create a recurrence series + its assignees, then materialize today's cycle if due.
 * Returns the new recurrence id.
 */
export async function createRecurrence(
  supabase: SupabaseClient,
  payload: RecurrenceInsert,
  assigneeIds: string[],
): Promise<string> {
  const { data, error } = await supabase
    .from('task_recurrences')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const recurrenceId = data.id as string

  const unique = [...new Set(assigneeIds.filter(Boolean))]
  if (unique.length > 0) {
    const { error: aErr } = await supabase
      .from('task_recurrence_assignees')
      .insert(unique.map(team_id => ({ recurrence_id: recurrenceId, team_id })))
    if (aErr) throw new Error(aErr.message)
  }

  // Materialize the current cycle immediately if today is a show day (idempotent server-side).
  try {
    await supabase.rpc('generate_recurring_tasks', { p_run_date: localDateStr() })
  } catch {
    // Non-fatal: the daily cron will still pick it up.
  }

  return recurrenceId
}
