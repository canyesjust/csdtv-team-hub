# Power cables + equipment — locked decisions

Supersedes conflicting lines in the copied specs where noted.

## Roles (equipment only)

- **Full tier (same behavior):** `Manager`, `Staff` — includes **delete** equipment and power rows (and any other equipment actions managers had).
- **Limited tier (same behavior):** `Intern`, `Student Intern` — add/edit/link/unlink power cables and edit equipment; **no delete**; **no** category/structure admin (settings categories stay manager-only).

**RLS:** `equipment_delete` must allow **both** `Manager` and `Staff` (not manager-only). Use `role in ('Manager','Staff')` (or equivalent) with `auth.uid()` → `team` lookup.

**Addendum override:** The copied addendum table still says “Staff cannot delete” — **ignore that**; Staff and Manager are aligned on equipment.

## Student Intern — navigation

- **Equipment** is in the Student Intern sidebar (Work) and bottom nav (**Equip**), plus **Equipment scan** under **More** (`/dashboard/equipment/scan`).
- Implemented in `app/dashboard/components/AppLayout.tsx`.

## Power cable data rules

| Topic | Decision |
|--------|-----------|
| Cable length | **No new column.** Optional length can be mentioned in **notes** only (or omitted in v1 UI). |
| Default equipment list | **“All equipment” excludes power cables** (`is_power_cable = false` only). **Power cables** is a separate filter mode. |
| Category on power rows | **Required** when creating a power cable (picker must not be empty). |
| Create form required fields | **Only `name` and input connector** (connector stored in `power_input_connector` or equivalent). Everything else optional. |
| PWR sequence | **Never past 999** — three-digit `PWR-###` is acceptable. |
| Loans / checkout | **Hide** loan/checkout UI for `is_power_cable = true`; do not loan power cables independently. |
| Kits | Power cables **not** in kits (per main spec). |

## Visual dictionary → Knowledge base

**Goal:** Publish the connector dictionary as a **Knowledge base** article (intern-facing reference).

**Source file in repo:** [CSDtv-Connector-Visual-Dictionary.html](./CSDtv-Connector-Visual-Dictionary.html)

**Canonical SVG assets (in repo):** `public/connector-svgs/` (31 files). URLs: **`/connector-svgs/<name>.svg`** (e.g. `/connector-svgs/iec-c13.svg`). Prefer these over pasting inline SVG into TipTap. Publishing to KB still needs **`IMG` allowed** in `sanitizeArticleHtml` (see `app/dashboard/knowledge/page.tsx`) or use markdown/external link pattern you choose in §3 above.

**What we need from you (or whoever publishes the article)**

1. **Title** (e.g. “CSDtv cable & connector visual dictionary”) and **category** (`Reference` recommended).
2. **Whether to allow rich HTML in KB** for this article: current KB sanitizer only allows a small tag set (`P`, `H2`, `H3`, `UL`, `OL`, `LI`, `STRONG`, `EM`, `HR`, `BR`, `A`). The dictionary HTML uses **`<table>`**, **`<svg>`**, and inline styles — **those tags are stripped or broken** today if pasted as-is.
3. **Pick one approach:**
   - **A — Simplest:** Manually recreate the dictionary in the KB editor using **headings + bullet lists** (no tables/SVG), optionally add **photos** uploaded elsewhere and linked with allowed `<a href="https://...">`.
   - **B — Medium:** Add **`IMG`** (and maybe `FIGURE`) to the KB allowlist; use **`/connector-svgs/<file>.svg`** (already in `public/connector-svgs/`) or Supabase Storage / CDN; short text per connector.
   - **C — Full fidelity:** Extend `sanitizeArticleHtml` in `app/dashboard/knowledge/page.tsx` to allow controlled **`TABLE` / `TD` / `TR` / `TH`** and/or embed the HTML as a **static public page** linked from the KB article (`<a href="/…">`) without pasting raw HTML into TipTap.

4. **Who edits** the article after publish (managers only vs any staff).

Until **(2)** and **(3)** are chosen, treat the HTML file as **authoring reference**, not paste-ready KB content.

## Build order reminder

1. Apply DB migration (Supabase) for power columns + indexes.  
2. Align `equipment` RLS with the role tiers above (inspect existing policies first).  
3. Ship UI + intern nav (nav already updated in repo).
