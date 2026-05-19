import { notFound } from 'next/navigation'
import BoardDaisView from '@/app/board/components/BoardDaisView'
import { getOutputChannelByNumber } from '@/lib/board-meetings/public-channel'

export default async function BoardDaisPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel_number: string }>
  searchParams: Promise<{ fullscreen?: string }>
}) {
  const { channel_number } = await params
  const sp = await searchParams
  const num = parseInt(channel_number, 10)
  if (!Number.isFinite(num) || num < 1) notFound()
  const channel = await getOutputChannelByNumber(num)
  if (!channel) notFound()
  return <BoardDaisView channelNumber={num} autoFullscreen={sp?.fullscreen === '1'} />
}
