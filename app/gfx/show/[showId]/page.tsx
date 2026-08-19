import { notFound, redirect } from 'next/navigation'
import { getStaffOrManagerUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { loadShowBundle } from '@/lib/graphics/show-data'
import ShowClient from './ShowClient'
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
      .order('short_name'),
  ])

  return <ShowClient bundle={bundle} channels={channels || []} schools={schools || []} />
}
