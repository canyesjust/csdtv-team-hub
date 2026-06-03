import type { SupabaseClient } from '@supabase/supabase-js'

/** Task ids where this team member appears in task_assignments. */
export async function loadStudentInternTaskAssignmentIds(
  supabase: SupabaseClient,
  teamId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('task_assignments')
    .select('task_id')
    .eq('team_id', teamId)
  if (error) return []
  return [...new Set((data || []).map(row => row.task_id as string))]
}

/** PostgREST `.or()` filter: legacy assigned_to plus multi-assignee task ids. */
export function buildStudentInternTasksOrFilter(
  teamId: string,
  assignmentTaskIds: string[],
): string {
  if (assignmentTaskIds.length > 0) {
    return `assigned_to.eq.${teamId},id.in.(${assignmentTaskIds.join(',')})`
  }
  return `assigned_to.eq.${teamId}`
}
