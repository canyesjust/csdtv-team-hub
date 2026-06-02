-- Per-channel switch for OBS browser sources: when false, public outputs poll rarely (idle).
-- Assigning a channel to a meeting sets this true; ending the meeting sets it false.

ALTER TABLE public.output_channels
  ADD COLUMN IF NOT EXISTS obs_polling_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.output_channels.obs_polling_enabled IS
  'When true, /board/* pages poll for meeting state. Toggle from Output Channels or auto on channel assign.';
