import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import ProgramClient from './ProgramClient'

type Props = { params: Promise<{ productionId: string }> }

export default async function ProgramPage({ params }: Props) {
  const { productionId } = await params
  const session = await getServerSession()
  if (!session?.user) redirect('/login')
  return <ProgramClient productionId={productionId} />
}
