-- Raise the per-file size limit on the media-library bucket to 2 GB.
-- Run in Supabase SQL editor. file_size_limit is in BYTES.

UPDATE storage.buckets
SET file_size_limit = 2147483648  -- 2 GB
WHERE id = 'media-library';

-- Verify:
SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'media-library';
