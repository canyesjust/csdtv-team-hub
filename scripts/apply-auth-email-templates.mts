/**
 * Push CSDtv auth email templates to a hosted Supabase project.
 *
 * Requires:
 *   SUPABASE_ACCESS_TOKEN — https://supabase.com/dashboard/account/tokens
 *   PROJECT_REF — project id (default: pmzhpatxnngiagfzwkul)
 *
 * Usage:
 *   node --experimental-strip-types scripts/apply-auth-email-templates.mts
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.PROJECT_REF ?? 'pmzhpatxnngiagfzwkul'

if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)')
  process.exit(1)
}

function readTemplate(name: string): string {
  return readFileSync(join(root, 'supabase', 'templates', name), 'utf8').trim()
}

const body = {
  mailer_subjects_magic_link: 'Your CSDtv Team Hub link',
  mailer_templates_magic_link_content: readTemplate('magic_link.html'),
  mailer_subjects_recovery: 'CSDtv Team Hub sign-in help',
  mailer_templates_recovery_content: readTemplate('recovery.html'),
}

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})

if (!res.ok) {
  console.error('Failed:', res.status, await res.text())
  process.exit(1)
}

console.log('Updated magic_link and recovery email templates for', projectRef)
