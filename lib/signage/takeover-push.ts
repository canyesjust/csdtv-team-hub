import type { SupabaseClient } from '@supabase/supabase-js'
import { renderAndPushScreen } from './push-screen'
import { writeAbleSignLog } from './ablesign-helpers'

// Same pacing push-all uses to stay clear of AbleSign per-screen rate limits
// (see app/api/signage/push-all/route.ts).
const PUSH_PACE_MS = 400

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type TakeoverPushSummary = { pushed: number; skipped: number; failed: number }

/**
 * Push fresh HTML to a specific set of screens right after a takeover state
 * change (board-meeting preroll/live/off, CSDtv live on/off), so the switch
 * reaches the physical screen in seconds instead of waiting on its own poll
 * cycle. `force: true` because the takeover flag alone (and the poll-cadence
 * it bakes into the HTML, see build-screen-html.ts) can change the rendered
 * output even when nothing else on the screen changed.
 *
 * Best-effort by design: a failed push here just means that one screen falls
 * back to catching the change on its next poll — fast while a takeover is
 * actually live, TAKEOVER_POLL_IDLE_MS otherwise (lib/signage/takeover.ts).
 * It never throws, so it should never block the caller from reporting success
 * on the underlying takeover/live change itself.
 */
export async function pushTakeoverScreens(
  service: SupabaseClient,
  codes: string[],
): Promise<TakeoverPushSummary> {
  const summary: TakeoverPushSummary = { pushed: 0, skipped: 0, failed: 0 }

  for (const code of codes) {
    try {
      const result = await renderAndPushScreen(service, code, { trigger: 'takeover', force: true })
      if (!result.ok) {
        summary.failed += 1
        await writeAbleSignLog(service, {
          screen_id: null,
          action: 'html-push-takeover',
          status: 'error',
          detail: `code=${code} ${result.error}`,
        })
      } else if (result.skipped) {
        summary.skipped += 1
      } else {
        summary.pushed += 1
      }
    } catch (err) {
      summary.failed += 1
      const message = err instanceof Error ? err.message : 'Takeover push failed'
      await writeAbleSignLog(service, {
        screen_id: null,
        action: 'html-push-takeover',
        status: 'error',
        detail: `code=${code} ${message}`,
      })
    }
    await sleep(PUSH_PACE_MS)
  }

  return summary
}
