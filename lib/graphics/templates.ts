import type { GraphicsLayer, GraphicsMotion, GraphicsEventType } from '@/lib/graphics/types'

export type FieldType = 'text' | 'textarea' | 'logo' | 'number' | 'choice'

export type TemplateField = {
  id: string
  label: string
  type: FieldType
  placeholder?: string
  /** For 'choice'. The first entry is the default. */
  options?: { value: string; label: string }[]
}

export type GraphicTemplate = {
  id: string
  name: string
  layer: GraphicsLayer
  motion: GraphicsMotion
  eventTypes: GraphicsEventType[]
  /** Recommended on-screen seconds. Drives the auto-out and the "still up" nudge. */
  recommendedSeconds: number
  fields: TemplateField[]
  /** Short label for a rundown row. */
  summary: (data: Record<string, string>) => string
}

const f = (id: string, label: string, type: FieldType = 'text', placeholder = ''): TemplateField => ({
  id, label, type, placeholder,
})
const logo = (id = 'logo', label = 'Mark'): TemplateField => ({ id, label, type: 'logo', placeholder: 'school' })

/**
 * Where a lower third sits. Venues put things in the bottom of frame that we do
 * not control: a scoreboard feed, burned-in captions, a stage lip. Moving the
 * band is a style decision that belongs on the show, not a new template.
 */
export const LOWER_POSITIONS = [
  { value: 'left-low', label: 'Left, low' },
  { value: 'left-high', label: 'Left, raised' },
  { value: 'right-low', label: 'Right, low' },
  { value: 'right-high', label: 'Right, raised' },
] as const

const pos = (fallback = 'left-low'): TemplateField => ({
  id: 'pos', label: 'Position', type: 'choice',
  placeholder: fallback, options: [...LOWER_POSITIONS],
})

const ALL: GraphicsEventType[] = ['concert', 'game', 'parade', 'ceremony', 'other']

export const GRAPHIC_TEMPLATES: Record<string, GraphicTemplate> = {
  concert_piece: {
    id: 'concert_piece', name: 'Piece card', layer: 'lower', motion: 'wipeL',
    eventTypes: ['concert'], recommendedSeconds: 14,
    fields: [
      f('title', 'Title'), f('movement', 'Movement'), f('composer', 'Composer'),
      f('dates', 'Composer dates'), f('arranger', 'Arranger'), f('ensemble', 'Ensemble'),
      f('conductor', 'Conductor'), f('soloist', 'Soloist'), logo(), pos(),
    ],
    summary: d => d.title || 'Piece',
  },
  next_up: {
    id: 'next_up', name: 'Next up', layer: 'lower', motion: 'wipeR',
    eventTypes: ['concert', 'ceremony', 'parade'], recommendedSeconds: 10,
    fields: [f('title', 'Next'), f('sub', 'Sub-line'), pos('right-low')],
    summary: d => `Next: ${d.title || ''}`,
  },
  person_lt: {
    id: 'person_lt', name: 'Person lower third', layer: 'lower', motion: 'wipeL',
    eventTypes: ALL, recommendedSeconds: 12,
    fields: [f('name', 'Name'), f('role', 'Role'), f('org', 'School or group'), logo(), pos()],
    summary: d => d.name || 'Person',
  },
  player_lt: {
    id: 'player_lt', name: 'Player lower third', layer: 'lower', motion: 'wipeL',
    eventTypes: ['game'], recommendedSeconds: 12,
    fields: [
      f('jersey', 'Jersey'), f('name', 'Name'), f('cls', 'Class'), f('position', 'Position'),
      f('team', 'Team'), f('stat', 'Stat line'), logo(), pos(),
    ],
    summary: d => `#${d.jersey || ''} ${d.name || ''}`.trim(),
  },
  stat_callout: {
    id: 'stat_callout', name: 'Stat callout', layer: 'lower', motion: 'wipeL',
    eventTypes: ['game'], recommendedSeconds: 12,
    fields: [
      f('name', 'Player'), f('sub', 'Sub-line'),
      f('k1', 'Label 1'), f('v1', 'Value 1'), f('k2', 'Label 2'), f('v2', 'Value 2'),
      f('k3', 'Label 3'), f('v3', 'Value 3'), logo(), pos(),
    ],
    summary: d => `Stats: ${d.name || ''}`,
  },
  parade_entry: {
    id: 'parade_entry', name: 'Parade entry', layer: 'lower', motion: 'wipeL',
    eventTypes: ['parade'], recommendedSeconds: 0,
    fields: [f('name', 'Entry name'), f('org', 'Organization'), logo(), pos()],
    summary: d => d.name || 'Entry',
  },
  grad_name: {
    id: 'grad_name', name: 'Name card', layer: 'lower', motion: 'wipeL',
    eventTypes: ['ceremony'], recommendedSeconds: 0,
    fields: [f('name', 'Name'), f('honors', 'Honors'), f('extra', 'Second line'), logo(), pos()],
    summary: d => d.name || 'Name',
  },
  title_slate: {
    id: 'title_slate', name: 'Show open', layer: 'full', motion: 'slate',
    eventTypes: ALL, recommendedSeconds: 0,
    fields: [logo(), f('kick', 'Kicker'), f('title', 'Title'), f('sub', 'Subtitle')],
    summary: d => d.title || 'Show open',
  },
  message: {
    id: 'message', name: 'Message or stand by', layer: 'full', motion: 'slate',
    eventTypes: ALL, recommendedSeconds: 0,
    fields: [f('title', 'Message'), f('sub', 'Sub'), logo()],
    summary: d => d.title || 'Message',
  },
  countdown: {
    id: 'countdown', name: 'Countdown slate', layer: 'full', motion: 'slate',
    eventTypes: ALL, recommendedSeconds: 0,
    fields: [
      f('kick', 'Heading'), f('target', 'Resumes at'), f('sub', 'Sub'), logo(),
      f('sponsors', 'Sponsor strip', 'textarea'),
    ],
    summary: d => `${d.kick || 'Countdown'} to ${d.target || ''}`,
  },
  matchup: {
    id: 'matchup', name: 'Matchup card', layer: 'full', motion: 'slate',
    eventTypes: ['game'], recommendedSeconds: 0,
    fields: [
      f('home', 'Home'), f('hrec', 'Home record'), logo('hlogo', 'Home mark'),
      f('away', 'Away'), f('arec', 'Away record'), logo('alogo', 'Away mark'),
      f('meta', 'Line 3'),
    ],
    summary: d => `${d.away || ''} at ${d.home || ''}`,
  },
  score_card: {
    id: 'score_card', name: 'Score card', layer: 'full', motion: 'slate',
    eventTypes: ['game'], recommendedSeconds: 0,
    fields: [
      f('kick', 'Heading'), f('a', 'Team A'), f('as', 'Score A'), logo('alg', 'Mark A'),
      f('b', 'Team B'), f('bs', 'Score B'), logo('blg', 'Mark B'), f('note', 'Note'),
    ],
    summary: d => `${d.kick || 'Score'} ${d.as || ''}-${d.bs || ''}`,
  },
  lineup: {
    id: 'lineup', name: 'Starting lineup', layer: 'full', motion: 'slate',
    eventTypes: ['game'], recommendedSeconds: 0,
    fields: [f('team', 'Team'), f('kick', 'Heading'), logo(), f('rows', 'Number, Name, Position per line', 'textarea')],
    summary: d => `Lineup: ${d.team || ''}`,
  },
  program_note: {
    id: 'program_note', name: 'Program note', layer: 'full', motion: 'slate',
    eventTypes: ['concert'], recommendedSeconds: 0,
    fields: [f('title', 'Title'), f('body', 'Note', 'textarea'), logo()],
    summary: d => `Note: ${d.title || ''}`,
  },
  roster_page: {
    id: 'roster_page', name: 'Personnel page', layer: 'full', motion: 'slate',
    eventTypes: ['concert', 'ceremony'], recommendedSeconds: 0,
    fields: [
      f('title', 'Ensemble'), logo(),
      f('s1', 'Heading 1'), f('n1', 'Names 1', 'textarea'),
      f('s2', 'Heading 2'), f('n2', 'Names 2', 'textarea'),
      f('s3', 'Heading 3'), f('n3', 'Names 3', 'textarea'),
      f('s4', 'Heading 4'), f('n4', 'Names 4', 'textarea'),
    ],
    summary: d => `Personnel: ${d.title || ''}`,
  },
  section_header: {
    id: 'section_header', name: 'Section header', layer: 'full', motion: 'slate',
    eventTypes: ['ceremony', 'other'], recommendedSeconds: 0,
    fields: [f('kick', 'Kicker'), f('title', 'Section'), f('sub', 'Sub'), logo()],
    summary: d => `Section: ${d.title || ''}`,
  },
  free_lt: {
    id: 'free_lt', name: 'Freeform lower third', layer: 'lower', motion: 'wipeL',
    eventTypes: ALL, recommendedSeconds: 12,
    fields: [f('l1', 'Big line'), f('l2', 'Second line'), f('l3', 'Small line'), logo(), pos()],
    summary: d => d.l1 || 'Lower third',
  },
  free_card: {
    id: 'free_card', name: 'Freeform card', layer: 'full', motion: 'slate',
    eventTypes: ALL, recommendedSeconds: 0,
    fields: [
      f('kick', 'Kicker'), f('title', 'Title'), logo(),
      f('body', 'One line each', 'textarea'), f('foot', 'Footer'),
    ],
    summary: d => d.title || 'Card',
  },
  corner_bug: {
    id: 'corner_bug', name: 'Corner bug', layer: 'corner', motion: 'drop',
    eventTypes: ALL, recommendedSeconds: 0,
    fields: [logo(), f('text', 'Text'), f('live', 'Live dot (yes or no)', 'text', 'yes')],
    summary: d => `Bug: ${d.text || ''}`,
  },
  sponsor_bug: {
    id: 'sponsor_bug', name: 'Sponsor bug', layer: 'corner', motion: 'drop',
    eventTypes: ALL, recommendedSeconds: 0,
    fields: [f('kick', 'Kicker'), f('name', 'Sponsor'), logo('logo', 'Mark')],
    summary: d => `Sponsor: ${d.name || ''}`,
  },
  ticker: {
    id: 'ticker', name: 'Ticker', layer: 'ticker', motion: 'rise',
    eventTypes: ALL, recommendedSeconds: 0,
    fields: [f('items', 'One per line', 'textarea'), logo()],
    summary: () => 'Ticker',
  },
}

export const TEMPLATE_LIST = Object.values(GRAPHIC_TEMPLATES)

export function templateById(id: string | null | undefined): GraphicTemplate | null {
  if (!id) return null
  return GRAPHIC_TEMPLATES[id] || null
}

export function templatesForEvent(eventType: GraphicsEventType): GraphicTemplate[] {
  return TEMPLATE_LIST.filter(t => t.eventTypes.includes(eventType))
}

/** Blank data for a template, honouring a show-level style override. */
export function blankData(
  template: GraphicTemplate,
  styleDefaults: Record<string, Record<string, string>> = {},
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of template.fields) {
    out[field.id] =
      field.type === 'logo' ? (field.placeholder || 'school')
      : field.type === 'choice' ? (field.placeholder || field.options?.[0]?.value || '')
      : ''
  }
  return { ...out, ...(styleDefaults[template.id] || {}) }
}

export const LOGO_CHOICES = [
  { value: 'school', label: 'School' },
  { value: 'district', label: 'CSDtv' },
  { value: 'away', label: 'Away' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'none', label: 'None' },
] as const
