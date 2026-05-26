import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  isOutlookIcalConfigured,
  readSignageOutlookEnabled,
} from '@/lib/signage-outlook-settings'

export const dynamic = 'force-dynamic'

/** Public config for wall displays (no session). */
export async function GET() {
  const configured = isOutlookIcalConfigured()
  let outlookEnabled = false

  if (configured) {
    const service = getServiceSupabaseClient()
    if (service) {
      outlookEnabled = await readSignageOutlookEnabled(service)
    }
  }

  return NextResponse.json({
    outlookEnabled,
    outlookConfigured: configured,
  })
}
