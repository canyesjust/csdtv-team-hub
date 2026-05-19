import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import { loadMotionScreenBundle } from '@/lib/board-meetings/motion-api'
import MotionScreenClient from './MotionScreenClient'

type Props = {
  params: Promise<{ productionId: string }>
}

export default async function MotionScreenPage({ params }: Props) {
  const { productionId } = await params
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  const bundle = await loadMotionScreenBundle(productionId).catch(() => null)
  if (!bundle?.meeting) {
    redirect(`/control/${productionId}`)
  }

  return <MotionScreenClient productionId={productionId} initialBundle={bundle} />
}
