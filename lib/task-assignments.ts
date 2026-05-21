import type { SupabaseClient } from '@supabase/supabase-js'

export type TaskAssignmentRow = { task_id: string; team_id: string }

/** Group assignment rows by task id. */
export function assignmentsByTaskId(rows: TaskAssignmentRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const list = map.get(row.task_id) || []
    list.push(row.team_id)
    map.set(row.task_id, list)
  }
  return map
}

export async function fetchTaskAssignments(
  service: SupabaseClient,
  taskIds: string[],
): Promise<Map<string, string[]>> {
  if (taskIds.length === 0) return new Map()
  const { data, error } = await service
    .from('task_assignments')
    .select('task_id, team_id')
    .in('task_id', taskIds)
  if (error) throw new Error(error.message)
  return assignmentsByTaskId((data as TaskAssignmentRow[]) || [])
}

/** Replace all assignees for a task; trigger syncs tasks.assigned_to to first assignee. */
export async function replaceTaskAssignees(
  service: SupabaseClient,
  taskId: string,
  teamIds: string[],
  assignedBy?: string | null,
): Promise<string[]> {
  const unique = [...new Set(teamIds.filter(Boolean))]

  const { error: delError } = await service.from('task_assignments').delete().eq('task_id', taskId)
  if (delError) throw new Error(delError.message)

  if (unique.length === 0) {
    await service.from('tasks').update({ assigned_to: null }).eq('id', taskId)
    return []
  }

  const { error: insError } = await service.from('task_assignments').insert(
    unique.map(team_id => ({
      task_id: taskId,
      team_id,
      assigned_by: assignedBy ?? null,
    })),
  )
  if (insError) throw new Error(insError.message)

  return unique
}

export function mergeAssigneeIds(
  assignedTo: string | null | undefined,
  assigneeIds: string[] | undefined,
): string[] {
  if (assigneeIds && assigneeIds.length > 0) return assigneeIds
  return assignedTo ? [assignedTo] : []
}

export function taskHasAssignee(
  assigneeIds: string[] | undefined,
  assignedTo: string | null | undefined,
  teamId: string | undefined,
): boolean {
  if (!teamId) return false
  if (assigneeIds?.includes(teamId)) return true
  return assignedTo === teamId
}

export function taskIsUnassigned(
  assigneeIds: string[] | undefined,
  assignedTo: string | null | undefined,
): boolean {
  if (assigneeIds && assigneeIds.length > 0) return false
  return !assignedTo
}
