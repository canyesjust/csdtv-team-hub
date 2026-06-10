import type { SupabaseClient } from '@supabase/supabase-js'

export type TickerItem = { text: string; priority: number }

export async function loadScheduleTickerItems(
  supabase: SupabaseClient,
  today: string,
  daysAhead = 7,
): Promise<TickerItem[]> {
  const end = new Date(`${today}T12:00:00`)
  end.setDate(end.getDate() + daysAhead)
  const endStr = end.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('calendar_events')
    .select('title, date, start_time')
    .gte('date', today)
    .lte('date', endStr)
    .order('date')
    .order('start_time')

  return (data ?? []).map(row => {
    const d = new Date(`${row.date}T12:00:00`)
    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const time = row.start_time ? ` ${String(row.start_time).slice(0, 5)}` : ''
    return { text: `${dateLabel}${time}: ${row.title}`, priority: 0 }
  })
}

export function mergeTickerItems(items: TickerItem[]): string[] {
  return [...items]
    .sort((a, b) => b.priority - a.priority)
    .map(i => i.text)
    .filter(Boolean)
}
