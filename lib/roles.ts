/** Canonical role string stored on `team.role`. */
export const STUDENT_INTERN_ROLE = 'Student Intern' as const

/** Limited hub UI: Home, Tasks, Productions, and a subset of production tabs. */
export const PRODUCTION_FOCUS_ROLE = 'Production Focus' as const

export const STUDENT_INTERN_HOME_PATH = '/dashboard/student' as const

export function isStudentInternRole(role: string | null | undefined): boolean {
  return (role || '') === STUDENT_INTERN_ROLE
}

export function isProductionFocusRole(role: string | null | undefined): boolean {
  return (role || '') === PRODUCTION_FOCUS_ROLE
}
