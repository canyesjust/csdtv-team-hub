import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { loadMotionScreenBundle } from '@/lib/board-meetings/motion-api'
import MotionScreenClient from './MotionScreenClient'

type Props = {
  params: Promise<{ productionId: string }>
}

export default async function MotionScreenPage({ params }: Props) {
  const { productionId } = await params
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  const service = getServiceSupabaseClient()
  if (!service) {
    return (
      <div className="control-page" style={{ padding: 24 }}>
        <p style={{ color: 'var(--semantic-danger-text)' }}>
          Server configuration error: cannot load motion screen.
        </p>
        <Link href={`/control/${productionId}`} style={{ color: 'var(--brand-primary)' }}>
          ← Back to control surface
        </Link>
      </div>
    )
  }

  const bundle = await loadMotionScreenBundle(service, productionId)
  if (!bundle?.meeting) {
    return (
      <div className="control-page" style={{ padding: 24 }}>
        <p style={{ color: 'var(--text-muted)' }}>Board meeting not found for this production.</p>
        <Link href={`/control/${productionId}`} style={{ color: 'var(--brand-primary)' }}>
          ← Back to control surface
        </Link>
      </div>
    )
  }

  return (
    <div className="control-page">
      <MotionScreenClient productionId={bundle.meeting.production_id} initialBundle={bundle} />
    </div>
  )
}
