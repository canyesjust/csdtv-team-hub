-- Weekly Team Hub data backups (ZIP in Storage). Managers download via API; cron uses service role.

CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message text,
  row_counts jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS backup_runs_created_at_idx ON public.backup_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS backup_runs_status_idx ON public.backup_runs (status) WHERE status = 'completed';

COMMENT ON TABLE public.backup_runs IS 'Weekly ZIP exports of core Team Hub data; retained 4 weeks in team-hub-backups bucket.';

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backup_runs_manager_select ON public.backup_runs;
CREATE POLICY backup_runs_manager_select ON public.backup_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team
      WHERE team.supabase_user_id = auth.uid()
        AND team.role = 'Manager'
        AND team.active IS NOT FALSE
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-hub-backups',
  'team-hub-backups',
  false,
  524288000,
  ARRAY['application/gzip', 'application/octet-stream']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
