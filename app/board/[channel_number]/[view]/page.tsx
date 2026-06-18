import { notFound } from 'next/navigation'
import BoardPlaceholder from '@/app/board/components/BoardPlaceholder'
import BoardPrerollView from '@/app/board/components/BoardPrerollView'
import BoardLiveView from '@/app/board/components/BoardLiveView'
import BoardDaisView from '@/app/board/components/BoardDaisView'
import BoardStreamView from '@/app/board/components/BoardStreamView'
import { getOutputChannelByNumber, type BoardViewSlug } from '@/lib/board-meetings/public-channel'

const VIEW_LABELS: Record<Exclude<BoardViewSlug, 'overlay'>, string> = {
  preroll: 'Pre-roll',
  live: 'Second screen',
  dais: 'Dais',
}

const VALID_VIEWS = new Set<string>(['preroll', 'live', 'dais'])

export default async function BoardPublicViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel_number: string; view: string }>
  searchParams: Promise<{ fullscreen?: string; audio?: string }>
}) {
  const { channel_number, view } = await params
  const sp = await searchParams
  const num = parseInt(channel_number, 10)
  if (!Number.isFinite(num) || num < 1) notFound()
  if (view !== 'stream' && !VALID_VIEWS.has(view)) notFound()

  const channel = await getOutputChannelByNumber(num)
  if (!channel) notFound()

  const channelName = channel.channel_name

  // District-screen live takeover: stream + agenda sidebar.
  if (view === 'stream') {
    return <BoardStreamView channelNumber={num} audio={sp?.audio === '1'} />
  }

  const slug = view as Exclude<BoardViewSlug, 'overlay'>

  if (slug === 'preroll') {
    return <BoardPrerollView channelNumber={num} initialChannelName={channelName} />
  }
  if (slug === 'live') {
    return <BoardLiveView channelNumber={num} initialChannelName={channelName} />
  }
  if (slug === 'dais') {
    return (
      <BoardDaisView
        channelNumber={num}
        initialChannelName={channelName}
        autoFullscreen={sp?.fullscreen === '1'}
      />
    )
  }

  return (
    <BoardPlaceholder
      channelNumber={num}
      viewLabel={VIEW_LABELS[slug]}
      channelName={channel.channel_name}
    />
  )
}
