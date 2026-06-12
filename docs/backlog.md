# Backlog / ideas (to do later)

Parking lot for features we've discussed but deferred. Newest first.

## School & program logo library

A brand/logo repository so staff (and possibly the public) can browse and download official logos for all schools and programs (~50).

Recommended approach:
- **Storage:** a Supabase Storage bucket (`school-logos`), CDN-served and downloadable — not the repo `/public` folder (avoids bloat + redeploys on every logo change).
- **Data:** a `school_logos` table linked to the existing `schools` table, built to allow **multiple variants per school** from day one (full-color / white-knockout / black, and vector SVG/PDF in addition to transparent PNG).
- **Library page:** grid of schools accented with each school's brand color, search/filter, click into a school to see its logo variants with per-file **Download** buttons + a "download this school's kit as a .zip" option.
- **Admin:** an upload screen for managers to add/replace a school's logo files (reuse the transparent-PNG processing already built for signage).

Open decisions before building:
- Public brand portal vs. staff-only (public saves a lot of "can I get the logo?" emails).
- Which variants/formats we actually have today (just PNGs, or vectors too).
- Single-file vs. per-school-zip vs. download-all.

Next concrete step when picked up: pull the exact count + list of schools/programs from the `schools` table to confirm scope.
