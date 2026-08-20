/**
 * How much structure a show wants.
 *
 * From the original concept, before the rundown swallowed everything:
 *
 *   "A concert is a spine and the job is advancing. A game is a bank of
 *    triggers with no order. A parade is one long list. A graduation is 400
 *    names where the reader skips. Four different jobs. A single panel that
 *    tries all four does none of them well."
 *
 * That is still true. What is shared is the expensive part: the renderer, the
 * motion system, the layer policy, the theme engine, the template schema, the
 * outputs, the packages and the as-run. The control surface is the cheap part
 * and it should fit the job.
 *
 * So depth is a property of the show, not of the product. A Friday game is a
 * board of cards and nothing else. A graduation is one long list you advance.
 * A concert with a host is the full rundown. You pick, and you can change your
 * mind later without losing anything.
 */
export const GRAPHICS_DEPTHS = ['board', 'list', 'rundown'] as const
export type GraphicsDepth = (typeof GRAPHICS_DEPTHS)[number]

export function isGraphicsDepth(value: unknown): value is GraphicsDepth {
  return typeof value === 'string' && (GRAPHICS_DEPTHS as readonly string[]).includes(value)
}

export type DepthCapabilities = {
  /** An ordered list of rows exists and can be advanced. */
  rundown: boolean
  /** Timing strip, estimates, front and back times. */
  timing: boolean
  /** Named segments with anchors. */
  blocks: boolean
  /** Script and IFB per row, which is also what feeds the prompter. */
  script: boolean
  /** Per-role column sets and read-only follower views. */
  roles: boolean
  /** The card bank is the primary surface rather than a side shelf. */
  board: boolean
  /** Chapter export needs row timestamps; a board has none. */
  chapters: boolean
}

const CAPABILITIES: Record<GraphicsDepth, DepthCapabilities> = {
  board: {
    rundown: false, timing: false, blocks: false, script: false,
    roles: false, board: true, chapters: false,
  },
  list: {
    rundown: true, timing: false, blocks: false, script: false,
    roles: false, board: false, chapters: true,
  },
  rundown: {
    rundown: true, timing: true, blocks: true, script: true,
    roles: true, board: false, chapters: true,
  },
}

export function capabilitiesFor(depth: GraphicsDepth): DepthCapabilities {
  return CAPABILITIES[depth] ?? CAPABILITIES.rundown
}

export const DEPTH_LABEL: Record<GraphicsDepth, string> = {
  board: 'Just graphics',
  list: 'An ordered list',
  rundown: 'A full rundown',
}

export const DEPTH_BLURB: Record<GraphicsDepth, string> = {
  board: 'A bank of cards you hit. No order, no clock. What a game actually is.',
  list: 'One list you advance through. Entries, names, pieces. No clock, no script.',
  rundown: 'Segments, timing, script and prompter. For a show with a host and a hard out.',
}

/**
 * What a given kind of event usually wants. A default, never a rule: the picker
 * is right there and every show can change depth later.
 */
export function defaultDepthFor(eventType: string): GraphicsDepth {
  switch (eventType) {
    case 'game': return 'board'
    case 'parade': return 'list'
    case 'ceremony': return 'list'
    case 'concert': return 'rundown'
    default: return 'board'
  }
}

/**
 * Changing depth never deletes anything. Rows survive a move down to board and
 * come back if you move up again, which is what makes the choice safe to get
 * wrong on a Tuesday.
 */
export function depthChangeNote(from: GraphicsDepth, to: GraphicsDepth, rowCount: number): string | null {
  if (from === to) return null
  const caps = capabilitiesFor(to)
  if (!caps.rundown && rowCount > 0) {
    const rows = rowCount === 1 ? '1 row stays' : `${rowCount} rows stay`
    return `The ${rows} saved. They come back if you switch to a list or a rundown again.`
  }
  if (caps.rundown && from === 'board') {
    return 'Your cards stay on the shelf. Add rows for anything that belongs in a running order.'
  }
  return null
}
