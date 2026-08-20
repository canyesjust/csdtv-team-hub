import { notFound, redirect } from 'next/navigation'
import { getStaffOrManagerUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { loadShowBundle } from '@/lib/graphics/show-data'
import { capabilitiesFor } from '@/lib/graphics/depth'
import ShowClient from './ShowClient'
import BoardClient from './BoardClient'
import './show.css'

export const dynamic = 'force-dynamic'

export default async function ShowPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params

  const user = await getStaffOrManagerUser()
  if (!user) redirect(`/login?next=/gfx/show/${showId}`)

  const bundle = await loadShowBundle(showId)
  if (!bundle) notFound()

  const service = getServiceSupabaseClient()
  const [{ data: channels }, { data: schools }] = await Promise.all([
    service!.from('graphics_channels').select('id, slug, name, output_token').order('sort_order'),
    service!.from('schools')
      .select('code, short_name, name, primary_color, secondary_color, accent_color')
      .eq('type', 'school')
      .eq('active', true)
      .order('level')
      .order('name'),
  ])

  // A board is a different surface, not the rundown with things switched off.
  // The expensive machinery is shared; the control surface is the cheap part.
  const Surface = capabilitiesFor(bundle.show.depth).board ? BoardClient : ShowClient
  return <Surface bundle={bundle} channels={channels || []} schools={schools || []} />
}
