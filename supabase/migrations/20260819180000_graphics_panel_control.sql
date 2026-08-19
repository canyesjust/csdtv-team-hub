-- ============================================================================
-- Hardware panel control (Companion / Stream Deck).
--
-- A panel in the van cannot hold a browser session, so it authenticates with a
-- per-channel bearer token. This is deliberately a SECOND token: the output
-- token is pasted into OBS and read by anyone who can see the machine, and it
-- must never be able to take a graphic.
-- ============================================================================

alter table public.graphics_channels
  add column if not exists control_token text not null default encode(gen_random_bytes(24), 'hex'),
  add column if not exists panel_enabled boolean not null default false;

comment on column public.graphics_channels.control_token is
  'Bearer token for hardware panels. Never rendered on an output page.';
comment on column public.graphics_channels.panel_enabled is
  'Panel control is off until someone turns it on for this rig.';
