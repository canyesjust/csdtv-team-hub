/** Tables included in weekly ZIP exports (JSON per table). Order matters for readability only. */
export const BACKUP_TABLES: { name: string; orderBy: string }[] = [
  { name: 'productions', orderBy: 'production_number' },
  { name: 'production_members', orderBy: 'id' },
  { name: 'production_links', orderBy: 'id' },
  { name: 'checklist_items', orderBy: 'sort_order' },
  { name: 'production_activity', orderBy: 'created_at' },
  { name: 'call_sheets', orderBy: 'id' },
  { name: 'production_crew', orderBy: 'id' },
  { name: 'crew_role_slots', orderBy: 'sort_order' },
  { name: 'crew_signups', orderBy: 'id' },
  { name: 'board_meetings', orderBy: 'id' },
  { name: 'board_meeting_agenda_items', orderBy: 'sort_order' },
  { name: 'board_meeting_presenters', orderBy: 'id' },
  { name: 'board_meeting_agenda_documents', orderBy: 'id' },
  { name: 'meeting_motions', orderBy: 'id' },
  { name: 'meeting_attendance', orderBy: 'id' },
  { name: 'meeting_broadcast_state', orderBy: 'id' },
  { name: 'tasks', orderBy: 'created_at' },
  { name: 'videos', orderBy: 'created_at' },
  { name: 'video_talent', orderBy: 'id' },
  { name: 'video_destinations', orderBy: 'id' },
  { name: 'video_tags', orderBy: 'id' },
  { name: 'video_checklist_items', orderBy: 'sort_order' },
  { name: 'comments', orderBy: 'created_at' },
  { name: 'team', orderBy: 'name' },
  { name: 'email_templates', orderBy: 'sort_order' },
  { name: 'knowledge_base', orderBy: 'title' },
  { name: 'schools', orderBy: 'code' },
  { name: 'app_settings', orderBy: 'key' },
]

export const BACKUP_RETENTION_COUNT = 4

export const BACKUP_BUCKET = 'team-hub-backups'

/** app_settings keys never written into backup files. */
export const REDACTED_SETTING_KEYS = new Set([
  'daily_digest_cron_token',
  'weekly_backup_cron_token',
])
