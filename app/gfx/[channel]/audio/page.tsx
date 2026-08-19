import { notFound } from 'next/navigation'
import { getChannelBySlug } from '@/lib/graphics/output-state'
import { timingSafeEqualStr } from '@/lib/server/security'
import AudioClient from './AudioClient'

export const dynamic = 'force-dynamic'

/**
 * The audio browser source. Its own OBS source, so it gets an independent
 * fader and the graphics source stays muted.
 */
export default async function AudioOutputPage({
  params, searchParams,
}: {
  params: Promise<{ channel: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { channel: slug } = await params
  const sp = await searchParams

  const channel = await getChannelBySlug(slug)
  if (!channel) notFound()

  const raw = sp.k
  const token = Array.isArray(raw) ? raw[0] : raw
  if (!timingSafeEqualStr(token || null, channel.output_token)) notFound()

  return <AudioClient channelSlug={channel.slug} channelName={channel.name} token={token || ''} />
}
