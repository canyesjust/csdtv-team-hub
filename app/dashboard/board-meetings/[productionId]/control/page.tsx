import { redirect } from 'next/navigation'

export default async function LegacyControlSurfaceRedirect({
  params,
}: {
  params: Promise<{ productionId: string }>
}) {
  const { productionId } = await params
  redirect(`/control/${productionId}`)
}
