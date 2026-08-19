/**
 * Prompter seek.
 *
 * The scroll position lives in the browser source, so the control surface
 * cannot set it directly. It issues a numbered command instead and the output
 * applies it exactly once, which is what makes a repeated poll safe.
 */
export const PROMPTER_SEEK_KINDS = ['back', 'forward', 'row', 'air', 'top'] as const
export type PrompterSeekKind = (typeof PROMPTER_SEEK_KINDS)[number]

export type PrompterSeek = {
  n: number
  kind: PrompterSeekKind | null
  value: string | null
}

/** One line at the prompter's reading size. Back is a nudge, not a jump. */
export const PROMPTER_LINE_PX = 92

export function isPrompterSeekKind(value: unknown): value is PrompterSeekKind {
  return typeof value === 'string' && (PROMPTER_SEEK_KINDS as readonly string[]).includes(value)
}

export function sanitizePrompterSeek(input: unknown): { kind: PrompterSeekKind; value: string | null } | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as { kind?: unknown; value?: unknown }
  if (!isPrompterSeekKind(raw.kind)) return null
  const value = typeof raw.value === 'string' ? raw.value.slice(0, 64) : null
  if (raw.kind === 'row' && !value) return null
  return { kind: raw.kind, value }
}

export type SeekTarget =
  /** Move by this many pixels. Negative is back up the script. */
  | { type: 'delta'; px: number }
  /** Snap to a row's top, by row id. */
  | { type: 'row'; rowId: string }
  /** Snap to whatever is on air. */
  | { type: 'air' }
  /** Back to the very top. */
  | { type: 'top' }

/**
 * What a command means to the output. `lines` is how far a back or forward step
 * moves, so a single control can be a nudge or a whole paragraph.
 */
export function resolveSeek(
  seek: Pick<PrompterSeek, 'kind' | 'value'>,
  linePx = PROMPTER_LINE_PX,
): SeekTarget | null {
  switch (seek.kind) {
    case 'back': {
      const lines = Number(seek.value)
      return { type: 'delta', px: -(Number.isFinite(lines) && lines > 0 ? lines : 1) * linePx }
    }
    case 'forward': {
      const lines = Number(seek.value)
      return { type: 'delta', px: (Number.isFinite(lines) && lines > 0 ? lines : 1) * linePx }
    }
    case 'row':
      return seek.value ? { type: 'row', rowId: seek.value } : null
    case 'air':
      return { type: 'air' }
    case 'top':
      return { type: 'top' }
    default:
      return null
  }
}
