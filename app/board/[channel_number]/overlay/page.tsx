import { notFound } from 'next/navigation'
import BoardOverlayView from '@/app/board/components/BoardOverlayView'
import { getOutputChannelByNumber } from '@/lib/board-meetings/public-channel'

export default async function OverlayPage({
  params,
}: {
  params: Promise<{ channel_number: string }>
}) {
  const { channel_number } = await params
  const num = parseInt(channel_number, 10)
  if (!Number.isFinite(num) || num < 1) notFound()

  const channel = await getOutputChannelByNumber(num)
  if (!channel) notFound()

  return <BoardOverlayView channelNumber={num} initialChannelName={channel.channel_name} />
}
