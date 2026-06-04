-- Office digital signage image submissions (public form + manager review queue).
-- Writes go through service-role API routes; authenticated users can read for the dashboard queue.

CREATE TABLE IF NOT EXISTS public.signage_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_name text NOT NULL,
  submitter_email text NOT NULL,
  department text,
  caption text,
  image_path text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason text,
  notes text,
  reviewed_by uuid REFERENCES public.team (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  terms_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT signage_submissions_date_range CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_signage_submissions_status_created
  ON public.signage_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signage_submissions_approved_window
  ON public.signage_submissions (status, start_date, end_date)
  WHERE status = 'approved';

ALTER TABLE public.signage_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signage_submissions_authenticated_select ON public.signage_submissions;
CREATE POLICY signage_submissions_authenticated_select
  ON public.signage_submissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Public read bucket for approved slideshow images (upload/delete via service role only).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signage-submissions',
  'signage-submissions',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS signage_submissions_public_read ON storage.objects;
CREATE POLICY signage_submissions_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'signage-submissions');
