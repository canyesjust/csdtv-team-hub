import { createHash, randomBytes } from 'crypto'

export const TASK_INTAKE_SOURCE_MAGIC_LINK = 'magic_link' as const

export const TASK_INTAKE_PRIORITIES = ['low', 'normal', 'high', 'day of'] as const
export const TASK_INTAKE_RECURRING = ['', 'daily', 'weekly', 'monthly'] as const

export function hashTaskIntakeToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex')
}

export function generateTaskIntakeTokenPlain(): string {
  return randomBytes(32).toString('hex')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidIntakeEmail(email: string): boolean {
  const t = email.trim()
  return t.length <= 320 && EMAIL_RE.test(t)
}

export function isValidPurchaseRequestLink(link: string | null | undefined): boolean {
  if (link == null || link === '') return true
  return /^https?:\/\//i.test(link.trim())
}
