# Handoff: Brand Library + related work

This documents a large block of work added to `csdtv-team-hub` (Next.js 16, React 19, TypeScript, Tailwind v4, Supabase, Vercel). Hand this to a new chat to continue.

## How to validate (do this for every change)
There is no local `node_modules` in some sandboxes; run `npm install` first if needed. Then:
- `node_modules/.bin/tsc --noEmit -p tsconfig.json` must pass (Vercel build uses strict TS).
- `node_modules/.bin/eslint <files>` must pass (errors fail the Vercel build; warnings do not).
- For `.tsx`, sanity-check `<div>` vs `</div>` balance.
- Conventions observed here: no em/en dashes in code/copy (use `-`); direct-to-storage uploads via signed URLs (mirrors `app/api/media-assets/*`); PNG/JPG only; 20 MB client cap. `AGENTS.md` warns Next is a non-standard build — read `node_modules/next/dist/docs/` before changing Next API usage.

Supabase project id: `pmzhpatxnngiagfzwkul` (MCP available). Public bucket: `school-logos`.

---

## 1. School Brand Library (the main feature)

Public, no-login gallery of school logos + brand colors, plus a manager workspace to manage them.

### Data model
Table `public.school_logos` (one row per file):
`id uuid pk default gen_random_uuid()`, `school_code text`, `category text`, `name text`, `format text check in ('png','jpg')`, `storage_path text`, `sort_order int default 0`, `is_cover bool default false`, `flagged_for_deletion bool default false`, `flagged_at timestamptz`, `notes text`, `created_at`, `updated_at`, `unique (school_code, category, name, format)`. Indexes: `school_logos_code_idx (school_code)`, partial `school_logos_flagged_idx` and `school_logos_cover_idx`. RLS enabled, **no policies** (all access via service role).

A "logo" in the UI = a `(school_code, category, name)` group; its PNG and JPG rows merge into one card with both download buttons. Storage path is `${school_code}/${uuid}.${format}` (independent of category/name, so rename/recategorize is a metadata-only update).

`public.schools` is the source for names/colors/level. Relevant columns: `code` (logo key; NOTE codes are not uniformly 4-digit, e.g. `702`, `108`, `district`), `name`, `type` (`school` | `department` | `district`), `level`, `short_name`, `mascot`/`mascot_name`, `city`, `primary_color`/`secondary_color`/`accent_color`/`text_color`, `active`.

Level for the gallery is derived from the `level` column (NOT `type`): `Elementary`, `Middle School`->Middle, `High School`->High, `Special School`->Specialty, and a `SPECIALTY_CODES` set (`996,981,180,955,995`) + null -> Specialty. This mapping lives in `app/api/brand/route.ts` and `app/api/brand/[code]/route.ts`.

### Storage
Bucket `school-logos`, public read, no public write. Created via migration (no manual SQL needed). Uploads go direct to storage via signed URLs.

### Schools data changes already applied to the DB
- Added `Canyons Innovation Center` (code `900`, type `school`, level `Special School`).
- Added `Canyons School District` (code `district`, type `district`) — the district brand record.
- Deactivated (active=false): Bell View Elementary (`105`), Edgemont Elementary (`124`), Canyons Transition Academy (`840`).

### API routes (`app/api/brand/...`)
- `GET /api/brand` — public, service role. Returns `{ schools, district, departments }` summaries (code, name, colors, preview, logoCount). Paginates `school_logos` past the 1000-row cap. Preview priority: chosen cover PNG > cover > Official PNG > any PNG > any.
- `GET /api/brand/[code]` — public. Returns `{ school (incl. type), logos[] }` for a school/district/department. Each logo: `{ category, name, png, jpg, flagged, cover, notes }`.
- `POST /api/brand/upload/sign` + `POST /api/brand/upload/finalize` — manager only. Two-step direct upload (sign returns a signed URL; client PUTs to storage; finalize verifies the object and upserts the row). Replaces same code+category+name+format.
- `DELETE /api/brand/upload?code&category&name&format` — manager only. Removes the file + row.
- `PATCH /api/brand/upload` — manager only. Rename/recategorize and/or set `notes`. Merge-safe: renaming onto an existing name+category combines formats (used to merge a stray PNG+JPG); blocks only on same-format collision.
- `POST /api/brand/cover` — manager only. Sets the school's cover logo (one per school).
- `GET /api/brand/flagged` + `DELETE /api/brand/flagged` — manager only. GET lists flagged logos and returns the review key/URL state; DELETE batch-deletes flagged files+rows (no orphans).
- `POST /api/brand/flag` — KEY-GATED (no login). Toggles `flagged_for_deletion` for the review link.
- `POST /api/brand/review-category` — KEY-GATED (no login). Changes a logo's category from the review link.

### Pages
Public:
- `app/brand/page.tsx` — gallery grid (checkerboard default thumbnails, per-card logo-count badge, search + level tabs), a pinned **district banner** at top, district logo in the header. Review mode via `?review=KEY`.
- `app/brand/[code]/page.tsx` — per-school page: for the district it shows an **expandable Departments** accordion at top (lazy-loads each department's logos); brand colors (click to copy); logos grid; click a logo -> right **side drawer** (big preview, bg toggle, dimensions+size, category, notes, downloads); background toggle (Checkered/White/Dark); **Open brand guide** button. Review mode: whole-tile click marks/unmarks (flag), plus one-click **category buttons** under each logo (shaded = current).
- `app/brand/[code]/guide/page.tsx` — printable **brand guide** (letter-sized, flexes columns): official colors (HEX + RGB), Official-category logos, district logo + generated date + URL in footer. "Print / Save as PDF" uses the browser print dialog (`print-color-adjust: exact` so colors print).
- `app/tools/page.tsx` — public hub listing public tools; list is `lib/public-tools.ts` (add an entry to add a tool).

Manager (`/dashboard/brand`, manager-only via client guard + server guards):
- `app/dashboard/brand/page.tsx` — grid linking to manage pages; **district manage card** + **Departments** section; header links to Bulk upload, Flagged for deletion, View public page.
- `app/dashboard/brand/[code]/page.tsx` — manage a school/district/department: **collapsible** "Add a logo" with **drag-and-drop** (multi-file; names from filenames), each logo with Edit (category `<select>` + name + notes), Set as cover, per-format delete, and the same detail **drawer**.
- `app/dashboard/brand/flagged/page.tsx` — Copy review link + bulk-delete flagged.
- `app/dashboard/brand/bulk/page.tsx` — folder bulk upload (drag a parent folder of per-school subfolders). Matches folder name to school/district/department by name/short-name/code; category subfolders set the category; `FOLDER_ALIASES` handles slashes etc. (Entrada, district aliases).

Nav: `lib/dashboard-nav.ts` shows "Brand library" for all roles — managers -> `/dashboard/brand`, everyone else -> `/brand`.

### Env var (required for the review link)
`BRAND_REVIEW_KEY` (any random string). Used by `/api/brand/flag`, `/api/brand/review-category`, `/api/brand/review-rename`, the review-key upload path (`/api/brand/upload/sign` + `/finalize`), and surfaced on the Flagged page as the shareable `…/brand?review=KEY`. Set it in `.env.local` (restart dev) and in Vercel (redeploy). Without it the review link is disabled.

### Public-site password gate (added 2026-07-01)
The public brand library can be locked behind one shared password.

- Source of truth: `brand_access_config` DB row (a manager sets/changes it under Settings -> Admin -> "Brand library access"), falling back to the `BRAND_SITE_PASSWORD` env var, and if neither is set the gate is OFF (site stays public). Password is stored scrypt-hashed; the access cookie holds an opaque `session_token` that rotates on every change (so changing the password logs everyone out).
- Enforcement: server layout `app/brand/layout.tsx` calls `hasBrandSiteAccess()` (`lib/server/brand-access.ts`) and renders `BrandAccessGate` when locked. The two public GET APIs (`/api/brand`, `/api/brand/[code]`) also call it and are `no-store`. Signed-in staff bypass; a valid `?review=KEY` sets a review cookie (in middleware) that also bypasses.
- APIs: `POST /api/brand/access` (verify password, set cookie; rate-limited), `GET/POST/DELETE /api/brand/access-config` (manager-only status/set/clear).

### Letterhead + Word docs (added 2026-07-01)
`school_logos.format` now allows `docx` (migration `20260701120000_brand_letterhead_docx.sql`). New `Letterhead` category preset; Word docs are only accepted under Letterhead (enforced client + server). docx has no image preview (shows a "DOCX" badge) and is excluded from card thumbnails. Reviewers can also upload (images + letterhead) and rename logos via the review link.

---

## 2. Other work this session
- `app/layout/page.tsx` + `app/layout/layout.tsx` — public **Classroom Planner** at `/layout` (ported from a standalone HTML file to a native React 19 client component). Arrangements include rows/pods/horseshoe/perimeter and **"Two sides + center"**; spacing rules apply per-arrangement; **PNG export**; ADA spacing checks.
- Signage task board: `app/signage/tasks/page.tsx` — intern cards now show in-progress **plus upcoming** productions.
- `lib/thumbnail-school-brand.ts` — `pickHex` is now exported (reused by the brand API).

---

## 3. Outstanding / TODO (important)

1. **Security review is PARKED.** A full review was done early in the session (report saved to the chat outputs as `csdtv-team-hub-code-review.md` — not in the repo). Key unfixed items:
   - **Critical IDOR class:** many `app/api/**/[id]/route.ts` routes authenticate ("logged in?") but never check role/ownership and write via the service-role client (bypassing RLS). Any logged-in user (incl. Student Intern) can edit/delete others' resources and rotate `output_channels` secrets. Fix: a shared `withTeamUser` wrapper + role/ownership checks, or use the user-session client so RLS applies.
   - `tasks_update` RLS is `USING (get_team_id() IS NOT NULL)` — any team member can update any task. Tighten to mirror `tasks_delete`.
   - Live-meeting realtime channel churn, non-atomic agenda reorder, two diverging motion subsystems. See the report.
2. **Migrations are only on the remote DB, not in the repo.** Applied via MCP `apply_migration`: `school_logos_library`, `school_logos_named_categories`, `school_logos_flag_for_deletion`, `school_logos_cover_flag`, `school_logos_notes`, plus the bucket + the schools data changes above. Backfill equivalent SQL into `supabase/migrations/` so a fresh environment reproduces the schema. (Note the repo also has loose `db/*.sql` not wired into migrations — a pre-existing two-source-of-truth issue.)
3. Set `BRAND_REVIEW_KEY` in Vercel; confirm deploy.
4. Optional brand-library polish: "Merge with…" picker for PNG/JPG pairs; SVG support (the bucket intentionally allows `{code}.svg` for a future public-watch site); CMYK/Pantone + typography on the brand guide (not stored yet); full per-department pages (departments are manageable and listed but have no standalone public page); the brand guide targets one letter page but very large logo counts may flow to page 2.

## 4. Quick reference
- Validate: `tsc --noEmit` + eslint, both clean.
- Public is gated only by the middleware matcher `['/dashboard/:path*','/board/:path*','/control/:path*']`; anything else (e.g. `/brand`, `/layout`, `/tools`) is public automatically.
- Manager role check: `isManagerRole(role)` from `lib/server/auth.ts` (server) / role === 'Manager' (client via `/api/me/team`).
