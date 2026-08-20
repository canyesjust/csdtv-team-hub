-- ============================================================================
-- Images.
--
-- Everything the graphics system drew until now was type and colour. A sponsor
-- bug without the sponsor's actual logo is not a sponsor bug, and half the
-- templates other packages ship are image templates.
--
-- School and district marks come from the existing `school-logos` bucket, which
-- is already public and already catalogued. This is for everything else:
-- sponsor art, backgrounds, headshots, freeform stills.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'graphics-images', 'graphics-images', true, 20971520,
  array['image/png','image/jpeg','image/webp','image/svg+xml','image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reads are public: an OBS browser source holds no session and must still be
-- able to draw a sponsor logo. Writes stay server-side through the service
-- role, so there is no anon insert policy here on purpose.
drop policy if exists "graphics images are readable" on storage.objects;
create policy "graphics images are readable"
  on storage.objects for select
  using (bucket_id = 'graphics-images');

alter table public.graphics_sponsors
  add column if not exists logo_path text;

comment on column public.graphics_sponsors.logo_path is
  'Object path in the graphics-images bucket. Null falls back to the drawn placeholder.';
