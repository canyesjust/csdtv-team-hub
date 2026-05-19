import { notFound } from 'next/navigation'
import BoardArchiveView from '@/app/board/components/BoardArchiveView'

export default async function BoardArchivePage({ params }: { params: Promise<{ production_number: string }> }) {
  const { production_number } = await params
  const num = parseInt(production_number, 10)
  if (!Number.isFinite(num)) notFound()
  return <BoardArchiveView productionNumber={num} />
}
