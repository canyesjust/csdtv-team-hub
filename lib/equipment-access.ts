/** Roles that may add or edit equipment (including power cables). */
const EQUIPMENT_EDITOR_ROLES = new Set(['Manager', 'Staff', 'Intern', 'Student Intern'])

/** Roles that may permanently delete equipment rows (full tier). */
const EQUIPMENT_DELETE_ROLES = new Set(['Manager', 'Staff'])

/** Roles that may set the shared task-signage intake QR URL (`app_settings`). */
const SIGNAGE_TASK_INTAKE_PUBLISHER_ROLES = new Set(['Manager', 'Staff'])

export function canAddOrEditEquipment(role: string | null | undefined): boolean {
  return EQUIPMENT_EDITOR_ROLES.has(role || '')
}

export function canDeleteEquipment(role: string | null | undefined): boolean {
  return EQUIPMENT_DELETE_ROLES.has(role || '')
}

export function canPublishTaskSignageIntake(role: string | null | undefined): boolean {
  return SIGNAGE_TASK_INTAKE_PUBLISHER_ROLES.has(role || '')
}
