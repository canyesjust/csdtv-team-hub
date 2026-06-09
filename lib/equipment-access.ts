/** Roles that may add, edit, check out, and manage kits (including student interns). */
const EQUIPMENT_EDITOR_ROLES = new Set(['Manager', 'Staff', 'Intern', 'Student Intern'])

/** Roles that may permanently delete equipment rows or kits. */
const EQUIPMENT_DELETE_ROLES = new Set(['Manager', 'Staff'])

/** Roles that may set the shared task-signage intake QR URL (`app_settings`). */
const SIGNAGE_TASK_INTAKE_PUBLISHER_ROLES = new Set(['Manager', 'Staff'])

export function canAddOrEditEquipment(role: string | null | undefined): boolean {
  return EQUIPMENT_EDITOR_ROLES.has(role || '')
}

/** Checkout, check-in, and kit loan flows — same roles as inventory editors. */
export function canCheckoutEquipment(role: string | null | undefined): boolean {
  return canAddOrEditEquipment(role)
}

export function canManageEquipmentKits(role: string | null | undefined): boolean {
  return canAddOrEditEquipment(role)
}

export function canDeleteEquipment(role: string | null | undefined): boolean {
  return EQUIPMENT_DELETE_ROLES.has(role || '')
}

export function canPublishTaskSignageIntake(role: string | null | undefined): boolean {
  return SIGNAGE_TASK_INTAKE_PUBLISHER_ROLES.has(role || '')
}
