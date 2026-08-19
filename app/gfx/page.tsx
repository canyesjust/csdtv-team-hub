import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getStaffOrManagerUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import NewShowButton from './NewShowButton'
import { groupShows, localDay, GRAPHICS_TZ } from './shows-grouping'

export const dynamic = 'force-dynamic'

type ShowRow = {
  id: string
  name: string
  event_type: string
  state: string
  show_date: string | null
  air_at: string | null
  graphics_channels: { name: string } | null
}

function timeLabel(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: GRAPHICS_TZ, hour: 'numeric', minute: '2-digit',
  })
}

function dayLabel(day: string | null): string {
  if (!day) return ''
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  })
}

/** Shows list. One of only two screens anyone navigates to. */
export default async function GraphicsShowsPage() {
  const user = await getStaffOrManagerUser()
  if (!user) redirect('/login?next=/gfx')

  const service = getServiceSupabaseClient()
  let shows: ShowRow[] = []
  let channels: { id: string; name: string }[] = []
  let schools: { code: string; short_name: string | null; name: string | null }[] = []
  if (service) {
    const [showsRes, channelsRes, schoolsRes] = await Promise.all([
      service
        .from('graphics_shows')
        .select('id, name, event_type, state, show_date, air_at, graphics_channels(name)')
        .order('show_date', { ascending: false, nullsFirst: false })
        .limit(80),
      service.from('graphics_channels').select('id, name').order('sort_order'),
      service.from('schools').select('code, short_name, name')
        .eq('type', 'school').eq('active', true).order('level').order('name'),
    ])
    shows = (showsRes.data || []) as unknown as ShowRow[]
    channels = channelsRes.data || []
    schools = schoolsRes.data || []
  }

  return (
    <>
      <div className="gfx-bar">
        <div className="brand">CSDtv<small>Graphics</small></div>
        <Link href="/dashboard" className="gfx-btn sm ghost" style={{ textDecoration: 'none' }}>← Hub</Link>
        <Link href="/gfx/library" className="gfx-btn sm ghost" style={{ textDecoration: 'none' }}>Library</Link>
        <div className="gfx-spacer" />
        <span className="gfx-note">{user.role}</span>
        <NewShowButton channels={channels} schools={schools} />
      </div>
      <div className="gfx-body">
        <div className="gfx-list">
          <h1 style={{ fontSize: 20, padding: '6px 2px 10px' }}>Shows</h1>
          {shows.length === 0 ? (
            <div className="gfx-empty">
              No shows yet.
              <div className="gfx-note" style={{ marginTop: 8 }}>
                Hit <b>New show</b>. It arrives with blocks, rows and a shelf already in it.
              </div>
            </div>
          ) : (
            groupShows(shows, localDay(new Date())).map(group => (
              <section key={group.bucket} className="gfx-group">
                <h2>
                  {group.label}
                  <span className="gfx-note">{group.shows.length}</span>
                </h2>
                {group.shows.map(show => (
                  <Link key={show.id} href={`/gfx/show/${show.id}`} className={`gfx-showrow${show.state === 'live' ? ' live' : ''}`}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="nm">{show.name}</span>
                      <span className="sub">
                        {show.event_type}
                        {show.show_date ? ` \u00b7 ${dayLabel(show.show_date)}` : ''}
                        {show.air_at ? ` \u00b7 air ${timeLabel(show.air_at)}` : ''}
                      </span>
                    </span>
                    <span className="gfx-rig">{show.graphics_channels?.name || 'no rig'}</span>
                    <span className={`gfx-chip ${show.state === 'live' ? 'onair' : 'idle'}`}>
                      {show.state === 'live' ? 'On air' : show.state}
                    </span>
                  </Link>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </>
  )
}
