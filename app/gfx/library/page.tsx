import { redirect } from 'next/navigation'
import { getStaffOrManagerUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import LibraryClient from './LibraryClient'
import './library.css'

export const dynamic = 'force-dynamic'

/**
 * The third screen. Visited when you are building a package, not when you are
 * running a game.
 */
export default async function GraphicsLibraryPage() {
  const user = await getStaffOrManagerUser()
  if (!user) redirect('/login?next=/gfx/library')

  const service = getServiceSupabaseClient()
  const [audio, rosters, sponsors, channels, schools] = await Promise.all([
    service!.from('graphics_audio_assets').select('id, name, kind, duration_seconds, file_size_bytes').order('name'),
    service!.from('graphics_rosters').select('id, name, school_code, sport, season, players').order('name'),
    service!.from('graphics_sponsors').select('id, name, tagline, scope, school_code, active').order('sort_order').order('name'),
    service!.from('graphics_channels').select('id, slug, name, note, output_token, control_token, listening, panel_enabled').order('sort_order'),
    service!.from('schools').select('code, short_name, name')
      .eq('type', 'school').eq('active', true).order('level').order('name'),
  ])

  return (
    <LibraryClient
      audio={audio.data || []}
      rosters={(rosters.data || []).map(r => ({ ...r, count: Array.isArray(r.players) ? r.players.length : 0 }))}
      sponsors={sponsors.data || []}
      channels={channels.data || []}
      schools={schools.data || []}
    />
  )
}
