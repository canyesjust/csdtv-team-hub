import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { loadControlBundle } from '@/lib/board-meetings/broadcast-control'
import ControlSurfaceClient from '@/app/dashboard/board-meetings/[productionId]/control/ControlSurfaceClient'

type Props = {
  params: Promise<{ productionId: string }>
}

export default async function ControlSurfacePage({ params }: Props) {
  const { productionId } = await params
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  const service = getServiceSupabaseClient()
  const initialBundle = service ? await loadControlBundle(service, productionId, { slim: true }) : null

  return (
    <div className="control-page">
      <ControlSurfaceClient productionId={productionId} initialBundle={initialBundle} />
    </div>
  )
}
