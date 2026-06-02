import { BoardBlankFullscreen } from '@/app/board/components/BoardBlankOutput'

export default function BoardPlaceholder({
  channelNumber: _channelNumber,
  viewLabel: _viewLabel,
  channelName: _channelName,
}: {
  channelNumber: number
  viewLabel: string
  channelName: string
}) {
  return <BoardBlankFullscreen />
}
