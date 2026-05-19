import type { SupabaseClient } from '@supabase/supabase-js'
import { isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

/** Managers and staff may update any production; others must be on the production team. */
export async function teamUserCanUpdateProduction(
  service: SupabaseClient,
  teamUser: { id: string; role: string },
  productionId: string,
): Promise<boolean> {
  if (isManagerRole(teamUser.role) || teamUser.role === 'Staff') return true
  const { data } = await service
    .from('production_members')
    .select('production_id')
    .eq('production_id', productionId)
    .eq('user_id', teamUser.id)
    .maybeSingle()
  return !!data
}

export function getServiceSupabase(): SupabaseClient | null {
  return getServiceSupabaseClient()
}
