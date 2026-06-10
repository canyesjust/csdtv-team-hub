-- Public bucket for CIC signage media (upload/delete via service role only).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signage-media',
  'signage-media',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS signage_media_public_read ON storage.objects;
CREATE POLICY signage_media_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'signage-media');
