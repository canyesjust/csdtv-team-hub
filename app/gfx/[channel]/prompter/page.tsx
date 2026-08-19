import { notFound } from 'next/navigation'
import { getChannelBySlug } from '@/lib/graphics/output-state'
import { timingSafeEqualStr } from '@/lib/server/security'
import PrompterClient from './PrompterClient'

export const dynamic = 'force-dynamic'

/**
 * Prompter output. A clean page with no chrome, because the controls live in
 * the show screen. One URL per channel, and it follows the rundown cursor.
 */
export default async function PrompterPage({
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

  return <PrompterClient channelSlug={channel.slug} token={token || ''} />
}
