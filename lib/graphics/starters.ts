import type { GraphicPayload, GraphicsEventType } from '@/lib/graphics/types'

/**
 * Starter rundowns. Nobody should face an empty grid at 6:45 on a Friday, so a
 * new show arrives with its blocks, its breaks and its shelf already there.
 * Everything is editable; this is a head start, not a constraint.
 */
export type StarterBlock = {
  label: string
  anchor_type: 'none' | 'hard_start' | 'hard_out' | 'soft_target'
}
export type StarterRow = {
  block: string
  page: string
  slug: string
  form: string
  est_seconds: number
  is_break?: boolean
  graphic?: GraphicPayload | null
}
export type Starter = {
  blocks: StarterBlock[]
  rows: StarterRow[]
  shelf: { label: string; graphic: GraphicPayload }[]
}

const g = (tid: string, data: Record<string, string>): GraphicPayload => ({ tid, data })

const OPEN = g('title_slate', { logo: 'school', kick: 'Canyons District TV', title: '', sub: '' })
const BUG = g('corner_bug', { logo: 'school', text: '', live: 'yes' })
const BRB = g('message', { title: 'We will be right back', sub: '', logo: 'school' })
const SPONSOR = g('sponsor_bug', { kick: 'Brought to you by', name: '', logo: 'sponsor' })

const STARTERS: Record<GraphicsEventType, Starter> = {
  concert: {
    blocks: [
      { label: 'PRE-SHOW', anchor_type: 'hard_start' },
      { label: 'FIRST HALF', anchor_type: 'hard_start' },
      { label: 'INTERMISSION', anchor_type: 'soft_target' },
      { label: 'SECOND HALF', anchor_type: 'soft_target' },
      { label: 'CLOSE', anchor_type: 'hard_out' },
    ],
    rows: [
      { block: 'PRE-SHOW', page: 'A1', slug: 'Pre-show countdown', form: 'GFX', est_seconds: 600,
        graphic: g('countdown', { kick: 'Concert begins', target: '', sub: '', logo: 'school', sponsors: '' }) },
      { block: 'PRE-SHOW', page: 'A2', slug: 'Show open', form: 'VT', est_seconds: 14, graphic: OPEN },
      { block: 'PRE-SHOW', page: 'A3', slug: 'Welcome', form: 'LIVE', est_seconds: 90,
        graphic: g('person_lt', { name: '', role: '', org: '', logo: 'school' }) },
      { block: 'FIRST HALF', page: 'B1', slug: 'First piece', form: 'MUSIC', est_seconds: 240,
        graphic: g('concert_piece', { title: '', movement: '', composer: '', dates: '', arranger: '', ensemble: '', conductor: '', soloist: '', logo: 'school' }) },
      { block: 'INTERMISSION', page: 'C1', slug: 'Intermission', form: 'GFX', est_seconds: 720,
        graphic: g('countdown', { kick: 'Intermission', target: '', sub: 'The second half begins shortly', logo: 'school', sponsors: '' }) },
      { block: 'SECOND HALF', page: 'D1', slug: 'First piece after the break', form: 'MUSIC', est_seconds: 240,
        graphic: g('concert_piece', { title: '', movement: '', composer: '', dates: '', arranger: '', ensemble: '', conductor: '', soloist: '', logo: 'school' }) },
      { block: 'CLOSE', page: 'E1', slug: 'Director thank-you', form: 'LIVE', est_seconds: 75 },
      { block: 'CLOSE', page: 'E2', slug: 'Credits', form: 'VT', est_seconds: 40 },
    ],
    shelf: [
      { label: 'Ensemble bug', graphic: BUG },
      { label: 'Next up', graphic: g('next_up', { title: '', composer: '' }) },
      { label: 'Hold applause', graphic: g('message', { title: 'Please hold applause until the end', sub: '', logo: 'school' }) },
      { label: 'Be right back', graphic: BRB },
      { label: 'Sponsor bug', graphic: SPONSOR },
    ],
  },
  game: {
    blocks: [
      { label: 'PREGAME', anchor_type: 'hard_start' },
      { label: 'FIRST HALF', anchor_type: 'hard_start' },
      { label: 'HALFTIME', anchor_type: 'soft_target' },
      { label: 'SECOND HALF', anchor_type: 'soft_target' },
      { label: 'POSTGAME', anchor_type: 'hard_out' },
    ],
    rows: [
      { block: 'PREGAME', page: 'A1', slug: 'Show open', form: 'VT', est_seconds: 18, graphic: OPEN },
      { block: 'PREGAME', page: 'A2', slug: 'Sponsor billboard', form: 'GFX', est_seconds: 20, graphic: SPONSOR },
      { block: 'PREGAME', page: 'A3', slug: 'Booth welcome', form: 'LIVE', est_seconds: 75,
        graphic: g('person_lt', { name: '', role: 'Play-by-play', org: 'CSDtv', logo: 'district' }) },
      { block: 'PREGAME', page: 'A4', slug: 'Matchup card', form: 'GFX', est_seconds: 15,
        graphic: g('matchup', { home: '', hrec: '', hlogo: 'school', away: '', arec: '', alogo: 'away', meta: '' }) },
      { block: 'PREGAME', page: 'A5', slug: 'Starting lineup', form: 'GFX', est_seconds: 25,
        graphic: g('lineup', { team: '', kick: 'Starting lineup', logo: 'school', rows: '' }) },
      { block: 'PREGAME', page: 'A6', slug: 'BREAK', form: 'BREAK', est_seconds: 90, is_break: true },
      { block: 'FIRST HALF', page: 'B1', slug: 'First half', form: 'LIVE', est_seconds: 1500, graphic: BUG },
      { block: 'HALFTIME', page: 'C1', slug: 'Halftime score', form: 'GFX', est_seconds: 15,
        graphic: g('halftime', { kick: 'Halftime', a: '', as: '', alg: 'school', b: '', bs: '', blg: 'away', note: '' }) },
      { block: 'HALFTIME', page: 'C2', slug: 'BREAK', form: 'BREAK', est_seconds: 120, is_break: true },
      { block: 'SECOND HALF', page: 'D1', slug: 'Second half', form: 'LIVE', est_seconds: 1500 },
      { block: 'POSTGAME', page: 'E1', slug: 'Final score', form: 'GFX', est_seconds: 15,
        graphic: g('halftime', { kick: 'Final', a: '', as: '', alg: 'school', b: '', bs: '', blg: 'away', note: '' }) },
      { block: 'POSTGAME', page: 'E2', slug: 'Booth wrap', form: 'LIVE', est_seconds: 60 },
    ],
    shelf: [
      { label: 'Player lower third', graphic: g('player_lt', { jersey: '', name: '', cls: '', pos: '', team: '', stat: '', logo: 'school' }) },
      { label: 'Stat callout', graphic: g('stat_callout', { name: '', sub: '', k1: 'PTS', v1: '', k2: 'REB', v2: '', k3: 'AST', v3: '', logo: 'school' }) },
      { label: 'Score bug', graphic: BUG },
      { label: 'Sponsor bug', graphic: SPONSOR },
      { label: 'Be right back', graphic: BRB },
    ],
  },
  parade: {
    blocks: [{ label: 'PRE-SHOW', anchor_type: 'hard_start' }, { label: 'LINEUP', anchor_type: 'none' }],
    rows: [
      { block: 'PRE-SHOW', page: 'A1', slug: 'Show open', form: 'VT', est_seconds: 14, graphic: OPEN },
      { block: 'LINEUP', page: '1', slug: 'First entry', form: 'LIVE', est_seconds: 60,
        graphic: g('parade_entry', { name: '', org: '', logo: 'district' }) },
    ],
    shelf: [
      { label: 'Coming up', graphic: g('next_up', { title: '', composer: '' }) },
      { label: 'CSDtv bug', graphic: g('corner_bug', { logo: 'district', text: 'CSDtv LIVE', live: 'yes' }) },
      { label: 'Sponsor bug', graphic: SPONSOR },
      { label: 'Be right back', graphic: BRB },
    ],
  },
  ceremony: {
    blocks: [
      { label: 'PRE-SHOW', anchor_type: 'hard_start' },
      { label: 'OPENING', anchor_type: 'hard_start' },
      { label: 'NAMES', anchor_type: 'none' },
      { label: 'CLOSE', anchor_type: 'hard_out' },
    ],
    rows: [
      { block: 'PRE-SHOW', page: 'A1', slug: 'Pre-show countdown', form: 'GFX', est_seconds: 600,
        graphic: g('countdown', { kick: 'Ceremony begins', target: '', sub: '', logo: 'school', sponsors: '' }) },
      { block: 'OPENING', page: 'B1', slug: 'Show open', form: 'VT', est_seconds: 14, graphic: OPEN },
      { block: 'OPENING', page: 'B2', slug: 'Principal welcome', form: 'LIVE', est_seconds: 120,
        graphic: g('person_lt', { name: '', role: 'Principal', org: '', logo: 'school' }) },
      { block: 'NAMES', page: 'C1', slug: 'Name reading', form: 'CEREM', est_seconds: 0,
        graphic: g('grad_name', { name: '', honors: '', logo: 'school' }) },
      { block: 'CLOSE', page: 'D1', slug: 'Credits', form: 'VT', est_seconds: 40 },
    ],
    shelf: [
      { label: 'Ceremony bug', graphic: BUG },
      { label: 'Hold applause', graphic: g('message', { title: 'Please hold applause until the end', sub: '', logo: 'school' }) },
      { label: 'Sponsor bug', graphic: SPONSOR },
    ],
  },
  other: {
    blocks: [{ label: 'SHOW', anchor_type: 'hard_start' }],
    rows: [
      { block: 'SHOW', page: 'A1', slug: 'Show open', form: 'VT', est_seconds: 14, graphic: OPEN },
      { block: 'SHOW', page: 'A2', slug: 'First item', form: 'LIVE', est_seconds: 60 },
    ],
    shelf: [
      { label: 'Bug', graphic: BUG },
      { label: 'Be right back', graphic: BRB },
    ],
  },
}

export function starterFor(eventType: GraphicsEventType): Starter {
  return STARTERS[eventType] ?? STARTERS.other
}
