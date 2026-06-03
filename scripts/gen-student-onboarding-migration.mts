import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  STUDENT_INTERN_ONBOARDING_CATEGORIES,
  STUDENT_INTERN_ONBOARDING_ITEMS,
  STUDENT_INTERN_ONBOARDING_PHASES,
} from '../lib/onboarding/student-intern-seed.ts'

const TRACK = 'student_intern'

function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlBool(value: boolean | undefined): string {
  return value === false ? 'false' : 'true'
}

const phaseValues = STUDENT_INTERN_ONBOARDING_PHASES.map(
  (label, i) => `  (${sqlStr(label)}, ${i})`,
).join(',\n')

const categoryValues = STUDENT_INTERN_ONBOARDING_CATEGORIES.map(
  (label, i) => `  (${sqlStr(label)}, ${i})`,
).join(',\n')

const itemValues = STUDENT_INTERN_ONBOARDING_ITEMS.map((item, i) => {
  return `  (${sqlStr(item.phase)}, ${sqlStr(item.category)}, ${sqlStr(item.title)}, ${sqlStr(item.description)}, ${i}, ${sqlBool(item.required)})`
}).join(',\n')

const sql = `-- Student intern onboarding checklist v2 (2026 default)
-- Replaces retired template rows and inserts the expanded checklist.

DO $$
BEGIN
  UPDATE onboarding_template_items SET active = false WHERE track_id = '${TRACK}';
  UPDATE onboarding_phases SET active = false WHERE track_id = '${TRACK}';
  UPDATE onboarding_categories SET active = false WHERE track_id = '${TRACK}';

  INSERT INTO onboarding_tracks (id, name, team_role, active)
  VALUES ('${TRACK}', 'Student intern', 'Student Intern', true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    team_role = EXCLUDED.team_role,
    active = true;

  CREATE TEMP TABLE _student_onboarding_phase (label text PRIMARY KEY, sort_order int);
  INSERT INTO _student_onboarding_phase (label, sort_order) VALUES
${phaseValues};

  INSERT INTO onboarding_phases (track_id, label, sort_order, active)
  SELECT '${TRACK}', label, sort_order, true FROM _student_onboarding_phase;

  CREATE TEMP TABLE _student_onboarding_category (label text PRIMARY KEY, sort_order int);
  INSERT INTO _student_onboarding_category (label, sort_order) VALUES
${categoryValues};

  INSERT INTO onboarding_categories (track_id, label, sort_order, active)
  SELECT '${TRACK}', label, sort_order, true FROM _student_onboarding_category;

  CREATE TEMP TABLE _student_onboarding_item (
    phase_label text,
    category_label text,
    title text,
    description text,
    sort_order int,
    required boolean
  );

  INSERT INTO _student_onboarding_item (phase_label, category_label, title, description, sort_order, required) VALUES
${itemValues};

  INSERT INTO onboarding_template_items (
    track_id, phase_id, category_id, title, description, library_article_id, sort_order, required, active
  )
  SELECT
    '${TRACK}',
    p.id,
    c.id,
    v.title,
    v.description,
    NULL,
    v.sort_order,
    v.required,
    true
  FROM _student_onboarding_item v
  JOIN onboarding_phases p
    ON p.track_id = '${TRACK}' AND p.label = v.phase_label AND p.active
  JOIN onboarding_categories c
    ON c.track_id = '${TRACK}' AND c.label = v.category_label AND c.active;
END $$;
`

const outPath = join(
  process.cwd(),
  'supabase/migrations/20260605140000_student_intern_onboarding_v2.sql',
)
writeFileSync(outPath, sql)
console.log(`Wrote ${outPath} (${STUDENT_INTERN_ONBOARDING_ITEMS.length} items)`)
