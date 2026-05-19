import { notFound } from 'next/navigation'
import BoardPlaceholder from '@/app/board/components/BoardPlaceholder'
import BoardOverlayView from '@/app/board/components/BoardOverlayView'
import BoardPrerollView from '@/app/board/components/BoardPrerollView'
import { getOutputChannelByNumber, type BoardViewSlug } from '@/lib/board-meetings/public-channel'

const VIEW_LABELS: Record<BoardViewSlug, string> = {
  overlay: 'Overlay',
  preroll: 'Pre-roll',
  live: 'Second screen',
  dais: 'Dais',
}

const VALID_VIEWS = new Set<string>(['overlay', 'preroll', 'live', 'dais'])

export default async function BoardPublicViewPage({
  params,
}: {
  params: Promise<{ channel_number: string; view: string }>
}) {
  const { channel_number, view } = await params
  const num = parseInt(channel_number, 10)
  if (!Number.isFinite(num) || num < 1) notFound()
  if (!VALID_VIEWS.has(view)) notFound()

  const slug = view as BoardViewSlug
  const channel = await getOutputChannelByNumber(num)
  if (!channel) notFound()

  if (slug === 'overlay') {
    return <BoardOverlayView channelNumber={num} />
  }
  if (slug === 'preroll') {
    return <BoardPrerollView channelNumber={num} />
  }

  return (
    <BoardPlaceholder
      channelNumber={num}
      viewLabel={VIEW_LABELS[slug]}
      channelName={channel.channel_name}
    />
  )
}
