import BoardIdleBranding from '@/app/board/components/BoardIdleBranding'

export default function BoardPlaceholder({
  channelNumber,
  viewLabel,
  channelName,
}: {
  channelNumber: number
  viewLabel: string
  channelName?: string
}) {
  const screenName = channelName || `${viewLabel} · Channel ${channelNumber}`
  return <BoardIdleBranding screenName={screenName} variant="fullscreen" />
}
