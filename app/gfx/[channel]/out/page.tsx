import { notFound } from 'next/navigation'
import { getChannelBySlug } from '@/lib/graphics/output-state'
import { timingSafeEqualStr } from '@/lib/server/security'
import OutputClient from './OutputClient'

export const dynamic = 'force-dynamic'

/**
 * The OBS browser source. Transparent, chrome-free, 1920x1080.
 *
 * Query flags:
 *   k=<token>   required, view-only channel token
 *   motion=0    plain fades, for ruling graphics in or out when frames drop
 *   safe=1      safe-area guides
 *   debug=1     connection strip: realtime state, last update source, rev
 */
export default async function GraphicsOutputPage({
  params,
  searchParams,
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

  const flag = (key: string) => {
    const v = sp[key]
    return (Array.isArray(v) ? v[0] : v) === '1'
  }
  const motionOff = (Array.isArray(sp.motion) ? sp.motion[0] : sp.motion) === '0'

  return (
    <OutputClient
      channelSlug={channel.slug}
      token={token as string}
      reducedMotion={motionOff}
      safeArea={flag('safe')}
      debug={flag('debug')}
    />
  )
}
