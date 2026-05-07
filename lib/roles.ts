/** Canonical role string stored on `team.role`. */
export const STUDENT_INTERN_ROLE = 'Student Intern' as const

export const STUDENT_INTERN_HOME_PATH = '/dashboard/student' as const

export function isStudentInternRole(role: string | null | undefined): boolean {
  return (role || '') === STUDENT_INTERN_ROLE
}
