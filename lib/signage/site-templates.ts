// Default signage-area templates used when provisioning a new school site.
//
// Area slugs are GLOBALLY unique (see signage_areas.slug), so the provisioning
// step prefixes each base slug with the site slug — e.g. base "front-office" at
// site "butler-middle" becomes "butler-middle-front-office". Keep base slugs
// short and lowercase-hyphenated; `siteAreaSlug` does the prefixing.

export type SiteAreaTemplateItem = { name: string; slug: string }

export type SiteTemplate = {
  key: string
  label: string
  description: string
  areas: SiteAreaTemplateItem[]
}

const COMMON_HEAD: SiteAreaTemplateItem[] = [
  { name: 'Front Office', slug: 'front-office' },
  { name: 'Main Entrance', slug: 'main-entrance' },
]

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    key: 'elementary',
    label: 'Elementary',
    description: 'Office, hallway, cafeteria, library, gym.',
    areas: [
      ...COMMON_HEAD,
      { name: 'Main Hallway', slug: 'main-hallway' },
      { name: 'Cafeteria', slug: 'cafeteria' },
      { name: 'Library / Media Center', slug: 'library' },
      { name: 'Gymnasium', slug: 'gymnasium' },
    ],
  },
  {
    key: 'middle',
    label: 'Middle',
    description: 'Office, commons, cafeteria, library, gym, counseling.',
    areas: [
      ...COMMON_HEAD,
      { name: 'Main Commons', slug: 'commons' },
      { name: 'Cafeteria', slug: 'cafeteria' },
      { name: 'Library / Media Center', slug: 'library' },
      { name: 'Gymnasium', slug: 'gymnasium' },
      { name: 'Counseling Center', slug: 'counseling' },
    ],
  },
  {
    key: 'high',
    label: 'High',
    description: 'Office, commons, cafeteria, library, gym, auditorium, counseling, athletics.',
    areas: [
      ...COMMON_HEAD,
      { name: 'Main Commons', slug: 'commons' },
      { name: 'Cafeteria', slug: 'cafeteria' },
      { name: 'Library / Media Center', slug: 'library' },
      { name: 'Gymnasium', slug: 'gymnasium' },
      { name: 'Auditorium', slug: 'auditorium' },
      { name: 'Counseling Center', slug: 'counseling' },
      { name: 'Athletics', slug: 'athletics' },
    ],
  },
  {
    key: 'program',
    label: 'Program / Center',
    description: 'Office, commons, meeting space — for CTE centers and programs.',
    areas: [
      ...COMMON_HEAD,
      { name: 'Commons Area', slug: 'commons' },
      { name: 'Meeting Space', slug: 'meeting-space' },
    ],
  },
  {
    key: 'minimal',
    label: 'Minimal',
    description: 'Just front office and main entrance — build the rest by hand.',
    areas: [...COMMON_HEAD],
  },
  {
    key: 'blank',
    label: 'Blank',
    description: 'No areas — start from an empty site.',
    areas: [],
  },
]

export const DEFAULT_TEMPLATE_KEY = 'high'

export function getSiteTemplate(key: string | null | undefined): SiteTemplate {
  return SITE_TEMPLATES.find(t => t.key === key) || SITE_TEMPLATES.find(t => t.key === DEFAULT_TEMPLATE_KEY)!
}

/** Guess the best template from a school name (e.g. "Butler Middle" -> middle). */
export function guessTemplateKey(schoolName: string | null | undefined): string {
  const n = (schoolName || '').toLowerCase()
  if (/\bhigh\b|academy|ctec|high school/.test(n)) return 'high'
  if (/\bmiddle\b/.test(n)) return 'middle'
  if (/\belementary\b/.test(n)) return 'elementary'
  if (/office|affairs|board|studio|center|entrada|transition|valley/.test(n)) return 'program'
  return DEFAULT_TEMPLATE_KEY
}

/** Prefix a base area slug with the site slug to keep slugs globally unique. */
export function siteAreaSlug(siteSlug: string, baseSlug: string): string {
  const clean = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${clean(siteSlug)}-${clean(baseSlug)}`
}
