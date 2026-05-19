import { redirect } from 'next/navigation'
import MotionScreenClient from './MotionScreenClient'
import { getServerSession } from '@/lib/auth'
import { loadMotionScreenBundle } from '@/lib/board-meetings/motion-api'

type Props = {
  params: Promise<{ productionId: string }>
}

export default async function MotionScreenPage({ params }: Props) {
  const { productionId } = await params
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  const bundle = await loadMotionScreenBundle(productionId)
  if (!bundle) redirect(`/control/${productionId}`)

  return (
    <MotionScreenClient
      productionId={productionId}
      initialBundle={bundle}
    />
  )
}
