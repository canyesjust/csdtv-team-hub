import { redirect } from 'next/navigation'
import MotionScreenClient from './MotionScreenClient'
<<<<<<< HEAD
import { getServerSession } from '@/lib/auth'
import { loadMotionScreenBundle } from '@/lib/board-meetings/motion-api'
=======
>>>>>>> 33c0c41 (Control surface and motion screen redesign)

type Props = {
  params: Promise<{ productionId: string }>
}

export default async function MotionScreenPage({ params }: Props) {
  const { productionId } = await params
<<<<<<< HEAD
  const session = await getServerSession()
  if (!session?.user) redirect('/login')

  const bundle = await loadMotionScreenBundle(productionId)
  if (!bundle) redirect(`/control/${productionId}`)

  return (
    <MotionScreenClient
      productionId={productionId}
      initialBundle={bundle}
    />
=======

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const res = await fetch(`${baseUrl}/api/board-meetings/${productionId}/motion/bundle`, {
    cache: 'no-store',
    headers: { 'x-internal-fetch': '1' },
  }).catch(() => null)

  if (!res || !res.ok) {
    redirect(`/control/${productionId}`)
  }

  const bundle = await res.json()
  if (!bundle?.meeting) {
    redirect(`/control/${productionId}`)
  }

  return (
    <MotionScreenClient productionId={productionId} initialBundle={bundle} />
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
  )
}
