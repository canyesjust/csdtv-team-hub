import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const TRACK = 'student_intern'

function loadEnvLocal() {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const [, key, raw] = m
    if (process.env[key] == null) {
      process.env[key] = raw.replace(/^["']|["']$/g, '')
    }
  }
}

async function syncAssignmentInstances(
  supabase: SupabaseClient,
  assignmentId: string,
  activeTemplates: Array<Record<string, unknown>>,
) {
  const { data: existing, error: exErr } = await supabase
    .from('onboarding_item_instances')
    .select('*')
    .eq('assignment_id', assignmentId)

  if (exErr) throw new Error(exErr.message)

  const byTemplateId = new Map(
    (existing || [])
      .filter((r) => r.template_item_id)
      .map((r) => [r.template_item_id as string, r]),
  )
  const activeIds = new Set(activeTemplates.map((t) => t.id as string))
  const now = new Date().toISOString()

  for (const tpl of activeTemplates) {
    const row = byTemplateId.get(tpl.id as string)
    if (!row) {
      const { error } = await supabase.from('onboarding_item_instances').insert({
        assignment_id: assignmentId,
        template_item_id: tpl.id,
        phase_id: tpl.phase_id,
        category_id: tpl.category_id,
        title: tpl.title,
        description: tpl.description,
        library_article_id: tpl.library_article_id,
        sort_order: tpl.sort_order,
        required: tpl.required,
        completed: false,
        is_ad_hoc: false,
      })
      if (error) throw new Error(error.message)
      continue
    }
    if (row.removed_at) continue
    const { error } = await supabase
      .from('onboarding_item_instances')
      .update({
        phase_id: tpl.phase_id,
        category_id: tpl.category_id,
        title: tpl.title,
        description: tpl.description,
        library_article_id: tpl.library_article_id,
        sort_order: tpl.sort_order,
        required: tpl.required,
      })
      .eq('id', row.id)
    if (error) throw new Error(error.message)
  }

  for (const row of existing || []) {
    if (!row.template_item_id || row.removed_at || row.completed) continue
    if (!activeIds.has(row.template_item_id)) {
      const { error } = await supabase
        .from('onboarding_item_instances')
        .update({ removed_at: now })
        .eq('id', row.id)
      if (error) throw new Error(error.message)
    }
  }
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const { data: templates, error: tplErr } = await supabase
  .from('onboarding_template_items')
  .select('*')
  .eq('track_id', TRACK)
  .order('sort_order')

if (tplErr) {
  console.error(tplErr.message)
  process.exit(1)
}

const activeTemplates = (templates || []).filter((t) => t.active)

const { data: assignments, error: asnErr } = await supabase
  .from('onboarding_assignments')
  .select('id, status')
  .eq('track_id', TRACK)
  .neq('status', 'complete')

if (asnErr) {
  console.error(asnErr.message)
  process.exit(1)
}

for (const assignment of assignments || []) {
  await syncAssignmentInstances(supabase, assignment.id, activeTemplates)
}

console.log(`Synced ${assignments?.length ?? 0} open student intern onboarding assignment(s).`)
