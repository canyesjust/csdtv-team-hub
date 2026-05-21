/** Stable track ids stored in `onboarding_tracks.id`. */
export const ONBOARDING_TRACK_INTERN = 'intern' as const
export const ONBOARDING_TRACK_STUDENT_INTERN = 'student_intern' as const

export type OnboardingTrackId =
  | typeof ONBOARDING_TRACK_INTERN
  | typeof ONBOARDING_TRACK_STUDENT_INTERN

export const ONBOARDING_ASSIGNMENT_STATUS = {
  in_progress: 'in_progress',
  pending_signoff: 'pending_signoff',
  complete: 'complete',
  reopened: 'reopened',
} as const

export type OnboardingAssignmentStatus =
  (typeof ONBOARDING_ASSIGNMENT_STATUS)[keyof typeof ONBOARDING_ASSIGNMENT_STATUS]

export function trackIdForTeamRole(role: string | null | undefined): OnboardingTrackId | null {
  if (role === 'Intern') return ONBOARDING_TRACK_INTERN
  if (role === 'Student Intern') return ONBOARDING_TRACK_STUDENT_INTERN
  return null
}

export function isManagerRole(role: string | null | undefined): boolean {
  return role === 'Manager'
}
