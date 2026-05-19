import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

/** Service-role Supabase client for server-side writes. */
export function createServiceClient(): SupabaseClient | null {
  return getServiceSupabaseClient()
}
