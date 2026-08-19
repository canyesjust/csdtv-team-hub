import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GraphicPayload, GraphicsEventType } from '@/lib/graphics/types'
import { templateById } from '@/lib/graphics/templates'

export type PackageShelf = { label: string; graphic: GraphicPayload }

/**
 * A package is a named set of templates with their per-show style already set,
 * plus the shelf. Build it once in the summer, recall it every Friday.
 */
export async function saveShowAsPackage(
  service: SupabaseClient,
  showId: string,
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: show } = await service
    .from('graphics_shows').select('event_type').eq('id', showId).maybeSingle()
  if (!show) return { ok: false, error: 'Show not found' }

  const [{ data: rows }, { data: shelf }] = await Promise.all([
    service.from('graphics_rows').select('graphic').eq('show_id', showId),
    service.from('graphics_shelf_items').select('label, graphic').eq('show_id', showId).order('sort_order'),
  ])

  const templateIds = [...new Set(
    (rows || [])
      .map(r => (r.graphic as GraphicPayload | null)?.tid)
      .filter((t): t is string => Boolean(t) && Boolean(templateById(t!))),
  )]

  // The style is what each template's non-content fields settled on, so a
  // recalled package carries "no mark on lower thirds" rather than just names.
  const style: Record<string, Record<string, string>> = {}
  for (const row of rows || []) {
    const graphic = row.graphic as GraphicPayload | null
    if (!graphic) continue
    const template = templateById(graphic.tid)
    if (!template) continue
    const styleFields: Record<string, string> = {}
    for (const field of template.fields) {
      // Style is the non-content part of a template: which mark it carries and
      // where it sits. Content stays with the row it was typed on.
      const isStyle = field.type === 'logo' || field.type === 'choice'
      if (isStyle && graphic.data[field.id]) styleFields[field.id] = graphic.data[field.id]
    }
    if (Object.keys(styleFields).length > 0) style[graphic.tid] = styleFields
  }

  const packageShelf: PackageShelf[] = (shelf || [])
    .filter(s => s.graphic)
    .map(s => ({ label: s.label, graphic: s.graphic as GraphicPayload }))

  const { data, error } = await service
    .from('graphics_packages')
    .insert({
      name: name.slice(0, 120),
      event_type: show.event_type as GraphicsEventType,
      template_ids: templateIds,
      style,
      shelf: packageShelf,
    })
    .select('id').single()
  if (error) return { ok: false, error: 'Could not save the package' }
  return { ok: true, id: data.id }
}

/**
 * Load a package onto a show. Replaces the shelf, applies the style defaults to
 * every matching row, and never touches the rundown order or the content.
 */
export async function applyPackageToShow(
  service: SupabaseClient,
  showId: string,
  packageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: pkg } = await service
    .from('graphics_packages').select('id, style, shelf').eq('id', packageId).maybeSingle()
  if (!pkg) return { ok: false, error: 'Package not found' }

  const style = (pkg.style || {}) as Record<string, Record<string, string>>
  const { data: rows } = await service
    .from('graphics_rows').select('id, graphic').eq('show_id', showId).not('graphic', 'is', null)

  for (const row of rows || []) {
    const graphic = row.graphic as GraphicPayload | null
    if (!graphic) continue
    const fields = style[graphic.tid]
    if (!fields) continue
    await service
      .from('graphics_rows')
      .update({ graphic: { ...graphic, data: { ...graphic.data, ...fields } } })
      .eq('id', row.id)
  }

  const shelf = (pkg.shelf || []) as PackageShelf[]
  if (shelf.length > 0) {
    await service.from('graphics_shelf_items').delete().eq('show_id', showId)
    await service.from('graphics_shelf_items').insert(
      shelf
        .filter(item => item.graphic && templateById(item.graphic.tid))
        .map((item, i) => ({
          show_id: showId,
          label: String(item.label).slice(0, 80),
          graphic: item.graphic,
          sort_order: (i + 1) * 10,
        })),
    )
  }

  await service.from('graphics_shows').update({ package_id: packageId }).eq('id', showId)
  await service.rpc('graphics_bump_package_uses', { p_id: packageId }).then(
    () => undefined,
    () => undefined,
  )
  return { ok: true }
}

/**
 * What the rundown asks for that the package does not carry. This is the check
 * that belongs on Tuesday, not at 6:52 on Friday.
 */
export async function packageReadyCheck(
  service: SupabaseClient,
  showId: string,
  packageId: string | null,
): Promise<{ template_id: string; name: string; covered: boolean }[]> {
  const { data: rows } = await service
    .from('graphics_rows').select('graphic').eq('show_id', showId).not('graphic', 'is', null)
  const used = [...new Set(
    (rows || []).map(r => (r.graphic as GraphicPayload | null)?.tid).filter((t): t is string => Boolean(t)),
  )]

  let covered: string[] = []
  if (packageId) {
    const { data: pkg } = await service
      .from('graphics_packages').select('template_ids').eq('id', packageId).maybeSingle()
    covered = (pkg?.template_ids || []) as string[]
  }

  return used.map(tid => ({
    template_id: tid,
    name: templateById(tid)?.name ?? tid,
    covered: covered.includes(tid),
  }))
}
