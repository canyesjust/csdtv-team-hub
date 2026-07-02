import type { Metadata } from 'next'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import SiteSubmitForm from '../../_components/SiteSubmitForm'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ slug: string }> }

async function resolveSite(slug: string) {
  const service = getServiceSupabaseClient()
  if (!service) return null
  const { data } = await service
    .from('signage_sites')
    .select('name, slug, active')
    .eq('slug', slug.toLowerCase())
    .maybeSingle()
  if (!data || data.active === false) return null
  return { name: data.name as string, slug: data.slug as string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const site = await resolveSite(slug)
  return { title: site ? `Submit to ${site.name} signage` : 'Digital signage submission' }
}

const notFoundBox = (
  <div style={{ minHeight: '100vh', background: '#f8f9fc', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
    <div>
      <p style={{ fontSize: 16, color: '#1a1f36', margin: '0 0 6px' }}>This signage location wasn&apos;t found.</p>
      <p style={{ fontSize: 13, margin: 0 }}>Double-check the link, or contact the signage team for the right address.</p>
    </div>
  </div>
)

export default async function SiteSubmitPage({ params }: PageProps) {
  const { slug } = await params
  const site = await resolveSite(slug)
  if (!site) return notFoundBox
  return <SiteSubmitForm siteSlug={site.slug} siteName={site.name} />
}
