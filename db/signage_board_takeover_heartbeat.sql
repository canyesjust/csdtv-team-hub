-- Fail-safe for the board → signage takeover. Run in Supabase. Idempotent.
--
-- Problem: if an operator forgets to turn the takeover off, the district
-- screens stay stuck on the pre-roll (this happened — it stayed up all day).
--
-- Fix: a heartbeat. The control surface bumps heartbeat_at while it's open and
-- the takeover is active. The public screen feed only honors the takeover when
-- heartbeat_at is recent, so a forgotten takeover self-clears within minutes.

ALTER TABLE public.signage_board_takeover
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Seed existing row so an already-active takeover isn't treated as stale at deploy.
UPDATE public.signage_board_takeover SET heartbeat_at = now() WHERE id = 1 AND heartbeat_at IS NULL;
