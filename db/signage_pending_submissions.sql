-- Approval support for publicly-submitted announcements and visitors, so the
-- unified submission form can route them to the same review queue as images.
-- Run in Supabase. Idempotent.
--
-- Public submissions are created with pending = true and active = false (hidden
-- from screens). A manager approves them, which sets pending = false and
-- active = true. Manager-created rows keep pending = false (shown immediately).

ALTER TABLE public.signage_announcements
  ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitter_name text,
  ADD COLUMN IF NOT EXISTS submitter_email text,
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.signage_areas(id);

ALTER TABLE public.signage_visitors
  ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitter_name text,
  ADD COLUMN IF NOT EXISTS submitter_email text,
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.signage_areas(id);

CREATE INDEX IF NOT EXISTS idx_signage_announcements_pending ON public.signage_announcements (site_id, pending);
CREATE INDEX IF NOT EXISTS idx_signage_visitors_pending ON public.signage_visitors (site_id, pending);
