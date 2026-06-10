-- Signage color themes (idempotent). Run in the Supabase SQL Editor.
--
-- Themes are built from the CIC brand spec:
--   primary   = navy (default)        secondary = slate
--   special   = colorful (magenta/fuchsia accents)   spectrum = animated color fade
--
-- A screen uses its own theme if set, otherwise the global default, otherwise
-- 'primary'. NULL on signage_screens.theme = "use the global default".

ALTER TABLE public.signage_screens
  ADD COLUMN IF NOT EXISTS theme text;

ALTER TABLE public.signage_settings
  ADD COLUMN IF NOT EXISTS default_theme text NOT NULL DEFAULT 'primary';

COMMENT ON COLUMN public.signage_screens.theme IS 'Per-screen color theme override (primary|secondary|special|spectrum). NULL = use signage_settings.default_theme.';
COMMENT ON COLUMN public.signage_settings.default_theme IS 'Default color theme for all CIC screens (primary|secondary|special|spectrum).';
