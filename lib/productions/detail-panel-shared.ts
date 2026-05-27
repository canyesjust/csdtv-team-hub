import { getSchoolName } from '@/lib/schools'

export const PRODUCTION_DETAIL_SELECT = `
  id,
  production_number,
  title,
  type,
  request_type_label,
  status,
  organizer_name,
  organizer_email,
  school_department,
  is_on_behalf,
  submitter_name,
  submitter_email,
  livestream_url,
  youtube_link_email_sent_at,
  start_datetime,
  end_datetime,
  filming_location,
  event_location,
  school_year,
  synced_at,
  additional_notes,
  video_description,
  team_notes,
  production_members(user_id, team(name, avatar_color)),
  checklist_items(completed)
`

export interface ProductionDetail {
  id: string
  production_number: number
  title: string
  type: string | null
  request_type_label: string | null
  status: string | null
  organizer_name: string | null
  organizer_email: string | null
  school_department: string | null
  is_on_behalf: boolean | null
  submitter_name: string | null
  submitter_email: string | null
  livestream_url: string | null
  youtube_link_email_sent_at: string | null
  start_datetime: string | null
  end_datetime: string | null
  filming_location: string | null
  event_location: string | null
  school_year: string | null
  synced_at: string | null
  additional_notes: string | null
  video_description: string | null
  team_notes: string | null
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
  checklist_items?: { completed: boolean }[]
}

export interface PanelChecklist {
  id: string
  title: string
  completed: boolean
  sort_order: number
}

export interface PanelActivity {
  id: string
  action: string
  detail: string | null
  created_at: string
  team: { name: string } | null
}

export interface DetailPanelTeamMember {
  id: string
  name: string
  avatar_color: string
  email: string
}

export interface DetailPanelCurrentUser {
  id: string
  name: string
  email: string
  role?: string
}

export interface EmailTemplate {
  id: string
  template_key: string | null
  label: string
  subject: string
  body: string
  sort_order: number
  active: boolean
}

export function normalizeProductionRow(p: Record<string, unknown>): ProductionDetail {
  const row = p as ProductionDetail & { production_members?: unknown[] }
  return {
    ...row,
    status: row.status ? row.status.replace(/^\d+\s*-\s*/, '') : row.status,
    production_members: (row.production_members || []).map((m: Record<string, unknown>) => ({
      ...(m as { user_id: string }),
      team: Array.isArray(m.team) ? ((m.team as { name: string; avatar_color: string }[])[0] || null) : ((m.team as { name: string; avatar_color: string } | null) || null),
    })),
  }
}

export function templateUsesYoutubeLink(t: EmailTemplate | undefined): boolean {
  if (!t) return false
  const key = (t.template_key || '').toLowerCase()
  if (key.includes('youtube')) return true
  return t.body.includes('{{youtube_link}}') || t.subject.includes('{{youtube_link}}')
}

export const STATUS_TONE_MAP: Record<string, 'success' | 'warning' | 'danger' | 'review' | 'info' | null> = {
  'In Progress': 'warning',
  'Approved/Scheduled': 'success',
  'Complete Requested': 'review',
  Complete: 'info',
  Abandoned: null,
  'Idea/Request': null,
}

export const STATUS_DISPLAY: Record<string, string> = {
  'Idea/Request': 'Idea / Request',
  'In Progress': 'In Progress',
  'Approved/Scheduled': 'Approved / Scheduled',
  'Complete Requested': 'Complete Requested',
  Complete: 'Complete',
  Abandoned: 'Abandoned',
}

export const TYPE_COLORS: Record<string, string> = {
  'Photo Headshots': '#e8a020',
  'Create a Video(Film, Edit, Publish)': '#5ba3e0',
  'LiveStream Meeting': '#22c55e',
  'Record Meeting': '#9b85e0',
  Podcast: '#f97316',
  'Board Meeting': '#ef4444',
  'Other, Unsure, Or Consultation': '#64748b',
}

export function getTypeLabel(p: ProductionDetail): string {
  return p.request_type_label || p.type || 'Unknown'
}

export function getTypeColor(p: ProductionDetail): string {
  return TYPE_COLORS[getTypeLabel(p)] || '#64748b'
}

export function primaryContactLabel(prod: ProductionDetail): string {
  if (prod.organizer_name) return prod.organizer_name
  if (prod.organizer_email) return prod.organizer_email
  if (prod.is_on_behalf) return 'Organizer not yet synced'
  return prod.submitter_name || prod.submitter_email || 'No organizer listed'
}

export function relativeTime(d: string | null): string {
  if (!d) return ''
  const diffMs = Date.now() - new Date(d).getTime()
  if (diffMs < 0) return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function parseProductionInstant(iso: string): Date {
  const raw = iso.includes('T') ? iso : iso.replace(' ', 'T')
  return new Date(raw)
}

function daysFromToday(d: string | null): number | null {
  if (!d) return null
  const event = parseProductionInstant(d)
  if (Number.isNaN(event.getTime())) return null
  const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate())
  const today = new Date()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((eventDay.getTime() - todayDay.getTime()) / 86400000)
}

export function isOverdueProd(p: ProductionDetail): boolean {
  if (!p.start_datetime) return false
  if (p.status === 'Complete' || p.status === 'Abandoned') return false
  if (p.status === 'In Progress') return false
  const df = daysFromToday(p.start_datetime)
  return df !== null && df < 0
}

export function formatPanelVenue(prod: ProductionDetail): string {
  return getSchoolName(prod.filming_location) || getSchoolName(prod.school_department) || prod.filming_location || 'TBD'
}
