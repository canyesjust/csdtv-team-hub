import type { OnboardingAssignmentStatus, OnboardingTrackId } from './constants'

export interface OnboardingTrack {
  id: OnboardingTrackId
  name: string
  team_role: string
  active: boolean
}

export interface OnboardingPhase {
  id: string
  track_id: OnboardingTrackId
  label: string
  sort_order: number
  active: boolean
}

export interface OnboardingCategory {
  id: string
  track_id: OnboardingTrackId
  label: string
  sort_order: number
  active: boolean
}

export interface OnboardingTemplateItem {
  id: string
  track_id: OnboardingTrackId
  phase_id: string
  category_id: string
  title: string
  description: string
  library_article_id: string | null
  sort_order: number
  required: boolean
  active: boolean
}

export interface OnboardingAssignment {
  id: string
  track_id: OnboardingTrackId
  team_member_id: string
  status: OnboardingAssignmentStatus
  trainee_submitted_at: string | null
  manager_signed_off_at: string | null
  signed_off_by: string | null
  manager_notes: string | null
  created_at: string
  updated_at: string
}

export interface OnboardingItemInstance {
  id: string
  assignment_id: string
  template_item_id: string | null
  phase_id: string | null
  category_id: string | null
  title: string
  description: string
  library_article_id: string | null
  sort_order: number
  required: boolean
  completed: boolean
  completed_at: string | null
  completed_by: string | null
  removed_at: string | null
  removed_by: string | null
  is_ad_hoc: boolean
  phase?: OnboardingPhase | null
  category?: OnboardingCategory | null
  library_article?: { id: string; title: string } | null
}

export interface TeamMemberSummary {
  id: string
  name: string
  avatar_color: string
  role: string
}

export interface AssignmentSummary {
  member: TeamMemberSummary
  assignment: OnboardingAssignment | null
  requiredTotal: number
  requiredDone: number
}
