-- Public bucket for email signature images (banner, logos).
-- Managers upload via Team Hub Settings; files are served at /sig/<filename>.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sig-assets',
  'sig-assets',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS sig_assets_public_read ON storage.objects;
CREATE POLICY sig_assets_public_read ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'sig-assets');
