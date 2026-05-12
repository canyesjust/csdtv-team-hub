import type { SupabaseClient } from '@supabase/supabase-js'

export const SIGNAGE_TASK_INTAKE_APP_SETTINGS_KEY = 'signage_task_intake_url' as const

export type PowerPolarityDb = 'center_positive' | 'center_negative' | 'na' | 'ac_passthrough'

export const POWER_POLARITY_OPTIONS: { label: string; value: PowerPolarityDb }[] = [
  { label: 'Center positive', value: 'center_positive' },
  { label: 'Center negative', value: 'center_negative' },
  { label: 'N/A', value: 'na' },
  { label: 'AC pass-through', value: 'ac_passthrough' },
]

export const POWER_INPUT_PRESETS = [
  'IEC C13',
  'IEC C5',
  'NEMA 5-15',
  'USB-A',
  'USB-C PD',
  'Hardwired',
  'Other',
] as const

export function isPowerCableRow(row: { is_power_cable?: boolean | null }): boolean {
  return row.is_power_cable === true
}

/** Next `PWR-###` tag (001–999). Caller ensures DB migration applied. */
export async function getNextPowerCableAssetTag(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('equipment')
    .select('asset_tag')
    .like('asset_tag', 'PWR-%')
    .order('asset_tag', { ascending: false })
    .limit(1)

  const last = data?.[0]?.asset_tag as string | undefined
  const lastNum = last && /^PWR-\d{1,3}$/i.test(last) ? parseInt(last.replace(/^PWR-/i, ''), 10) : 0
  const next = lastNum + 1
  if (next > 999) throw new Error('PWR tag sequence exceeded 999')
  return `PWR-${String(next).padStart(3, '0')}`
}

export function formatPowerSpecShort(row: {
  power_output_voltage?: string | null
  power_output_amperage?: string | null
  power_output_polarity?: string | null
}): string {
  const v = (row.power_output_voltage || '').trim()
  const a = (row.power_output_amperage || '').trim()
  const pol = (row.power_output_polarity || '').trim()
  const polShort =
    pol === 'center_positive' ? 'CP' : pol === 'center_negative' ? 'CN' : pol === 'ac_passthrough' ? 'AC' : ''
  const parts = [v, a].filter(Boolean).join(' ')
  return polShort ? `${parts} ${polShort}`.trim() : parts
}
