-- Make the brand-library bucket PRIVATE so logo/letterhead files are no longer
-- reachable by a permanent public URL (prevents external hotlinking). Files are now
-- served only through short-lived signed URLs minted server-side (see
-- lib/server/brand-storage.ts + the /api/brand read routes).
--
-- BREAKING / DEPLOY ORDER: this must go live TOGETHER with the signed-URL code. Do NOT
-- apply it while an older build that uses getPublicUrl() is still serving traffic, or
-- every brand image will 400 until that build is replaced. (Unlike the earlier additive
-- brand migrations, which were safe to apply ahead of a deploy.)
--
-- Signed URLs are validated by token and bypass RLS, so removing the public-read policy
-- does not affect them. The service role (uploads, listing, deletes) is unaffected.

update storage.buckets set public = false where id = 'school-logos';

drop policy if exists "school-logos public read" on storage.objects;
