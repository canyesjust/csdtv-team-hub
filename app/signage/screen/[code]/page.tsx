import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { buildScreenFeed } from '@/lib/signage/build-screen-feed'
import { CIC_PALETTE } from '@/lib/signage/constants'
import ScreenClient from './ScreenClient'

type PageProps = {
  params: Promise<{ code: string }>
  searchParams: Promise<{ seconds?: string }>
}

function parseImageSeconds(raw: string | undefined): number {
  const n = parseInt(raw ?? '10', 10)
  return Number.isNaN(n) ? 10 : Math.min(120, Math.max(3, n))
}

export default async function SignageScreenPage({ params, searchParams }: PageProps) {
  const { code } = await params
  const { seconds } = await searchParams
  const imageSeconds = parseImageSeconds(seconds)

  const service = getServiceSupabaseClient()
  if (!service) {
    return (
      <div style={{ minHeight: '100vh', background: CIC_PALETTE.navy, color: CIC_PALETTE.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        Signage server is not configured.
      </div>
    )
  }

  const result = await buildScreenFeed(service, code)
  if ('error' in result) {
    return (
      <div style={{ minHeight: '100vh', background: CIC_PALETTE.navy, color: CIC_PALETTE.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        Screen &ldquo;{code}&rdquo; was not found or is inactive.
      </div>
    )
  }

  return (
    <ScreenClient
      code={code}
      initialFeed={result.feed}
      imageSeconds={imageSeconds}
    />
  )
}
