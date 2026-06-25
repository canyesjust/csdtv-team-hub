import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildScreenHtml } from './build-screen-html'
import { pushScreenHtmlWebApp, writeAbleSignLog } from './ablesign-helpers'
import { getSiteAbleSignCreds } from './ablesign-creds'

export type PushTrigger = 'manual' | 'content' | 'cron-dirty' | 'cron-due'

export type PushScreenResult =
  | { ok: true; skipped: true; reason: 'unchanged' | 'not_linked'; bytes?: number }
  | { ok: true; skipped: false; webappId: number; bytes: number; replacedOldId: number | null }
  | { ok: false; error: string; bytes?: number }

type ScreenRow = {
  id: string
  code: string
  name: string
  site_id: string | null
  ablesign_screen_id: number | null
  ablesign_html_webapp_id: number | null
  ablesign_html_hash: string | null
  ablesign_html_dirty_at: string | null
}

const SCREEN_COLUMNS =
  'id, code, name, site_id, ablesign_screen_id, ablesign_html_webapp_id, ablesign_html_hash, ablesign_html_dirty_at'

/**
 * Render a screen's self-contained HTML and push it to AbleSign as an HTML web
 * app — but only when the rendered HTML actually changed (content hash skip), so
 * the periodic cron doesn't create a new web app every cycle for no reason.
 *
 * `force` bypasses the hash skip (used by the manual Regenerate & Push button).
 */
export async function renderAndPushScreen(
  service: SupabaseClient,
  code: string,
  opts: { trigger: PushTrigger; force?: boolean } = { trigger: 'manual' },
): Promise<PushScreenResult> {
  const { data: screen, error } = await service
    .from('signage_screens')
    .select(SCREEN_COLUMNS)
    .eq('code', code)
    .maybeSingle<ScreenRow>()

  if (error || !screen) {
    return { ok: false, error: error?.message || `Screen ${code} not found` }
  }

  // Unlinked screens have no AbleSign target — nothing to push (not an error).
  if (!screen.ablesign_screen_id) {
    await clearDirty(service, screen.id, screen.ablesign_html_dirty_at)
    return { ok: true, skipped: true, reason: 'not_linked' }
  }

  const built = await buildScreenHtml(service, code)
  if ('error' in built) {
    await logPush(service, screen.id, 'error', { trigger: opts.trigger, detail: built.error })
    return { ok: false, error: built.error }
  }

  const hash = createHash('sha256').update(built.html).digest('hex')

  // Capture the dirty timestamp now so edits arriving during the push survive.
  const dirtyAtStart = screen.ablesign_html_dirty_at

  if (!opts.force && hash === screen.ablesign_html_hash) {
    await clearDirty(service, screen.id, dirtyAtStart)
    return { ok: true, skipped: true, reason: 'unchanged', bytes: built.bytes }
  }

  try {
    const creds = await getSiteAbleSignCreds(service, screen.site_id)
    const result = await pushScreenHtmlWebApp(
      service,
      {
        id: screen.id,
        code: screen.code,
        name: screen.name,
        ablesign_screen_id: screen.ablesign_screen_id,
        ablesign_html_webapp_id: screen.ablesign_html_webapp_id,
      },
      built.html,
      creds,
    )

    await service
      .from('signage_screens')
      .update({ ablesign_html_hash: hash })
      .eq('id', screen.id)
    await clearDirty(service, screen.id, dirtyAtStart)

    await logPush(service, screen.id, 'ok', {
      trigger: opts.trigger,
      webappId: result.webappId,
      bytes: result.bytes,
      replacedOldId: result.replacedOldId,
    })

    return { ok: true, skipped: false, webappId: result.webappId, bytes: result.bytes, replacedOldId: result.replacedOldId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'HTML push failed'
    await logPush(service, screen.id, 'error', { trigger: opts.trigger, bytes: built.bytes, detail: message })
    return { ok: false, error: message, bytes: built.bytes }
  }
}

/** Clear the dirty flag only if no newer edit landed during the push. */
async function clearDirty(service: SupabaseClient, screenId: string, dirtyAtStart: string | null): Promise<void> {
  if (!dirtyAtStart) return
  await service
    .from('signage_screens')
    .update({ ablesign_html_dirty_at: null })
    .eq('id', screenId)
    .eq('ablesign_html_dirty_at', dirtyAtStart)
}

async function logPush(
  service: SupabaseClient,
  screenId: string,
  status: 'ok' | 'error',
  info: { trigger: PushTrigger; webappId?: number; bytes?: number; replacedOldId?: number | null; detail?: string },
): Promise<void> {
  const parts: string[] = [`trigger=${info.trigger}`]
  if (info.webappId != null) parts.push(`webApp=${info.webappId}`)
  if (info.bytes != null) parts.push(`bytes=${info.bytes}`)
  if (info.replacedOldId != null) parts.push(`replaced=${info.replacedOldId}`)
  if (info.detail) parts.push(info.detail)
  await writeAbleSignLog(service, {
    screen_id: screenId,
    action: 'html-push',
    status,
    detail: parts.join(' '),
  })
}
