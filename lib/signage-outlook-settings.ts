import type { SupabaseClient } from '@supabase/supabase-js'

export const SIGNAGE_OUTLOOK_ENABLED_KEY = 'signage_outlook_enabled'

export function isOutlookIcalConfigured(): boolean {
  return Boolean(process.env.OUTLOOK_ICAL_URL?.trim())
}

export async function readSignageOutlookEnabled(service: SupabaseClient): Promise<boolean> {
  const { data } = await service
    .from('app_settings')
    .select('value')
    .eq('key', SIGNAGE_OUTLOOK_ENABLED_KEY)
    .maybeSingle()
  if (data == null) {
    // On by default when the server has an Outlook iCal URL (matches original signage behavior).
    return isOutlookIcalConfigured()
  }
  return data.value === '1'
}

export async function writeSignageOutlookEnabled(
  service: SupabaseClient,
  enabled: boolean,
): Promise<void> {
  await service.from('app_settings').upsert({
    key: SIGNAGE_OUTLOOK_ENABLED_KEY,
    value: enabled ? '1' : '0',
    updated_at: new Date().toISOString(),
  })
}
