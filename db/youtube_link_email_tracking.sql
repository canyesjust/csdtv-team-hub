-- Track organizer YouTube link emails and tracked link clicks (run in Supabase SQL editor).

ALTER TABLE productions
  ADD COLUMN IF NOT EXISTS youtube_link_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS youtube_link_email_first_click_at timestamptz,
  ADD COLUMN IF NOT EXISTS youtube_link_email_click_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN productions.youtube_link_email_sent_at IS 'When staff opened the mail client to send an email that included the tracked YouTube link.';
COMMENT ON COLUMN productions.youtube_link_email_first_click_at IS 'First time the organizer opened the tracked redirect link.';
COMMENT ON COLUMN productions.youtube_link_email_click_count IS 'Number of tracked YouTube link opens (includes repeat clicks).';
