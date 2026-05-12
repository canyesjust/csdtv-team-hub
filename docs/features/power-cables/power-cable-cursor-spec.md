# Cursor Spec — Power Cables Feature

> **Decisions:** See [DECISIONS.md](./DECISIONS.md) for locked overrides (roles, list filter, required fields, length, KB plan).

## Overview

Add power-cable tracking to the existing CSDtv Team Hub equipment system. Power cables (AC pass-throughs, DC bricks, chargers, specialty cords) become a special kind of equipment record that can be linked to the device they power. The existing 261 equipment records are unaffected.

**Key design decisions** (already locked):
- Power cables live in the existing `equipment` table — no new table, just new nullable columns
- Asset tag format for power cables is `PWR-###` (e.g. `PWR-001`, `PWR-042`), separate sequence from the existing 4-digit codes
- Each power cable can optionally link to a parent device via `parent_equipment_id`
- Paired = has parent_equipment_id. Orphan = parent_equipment_id is null and `is_power_cable = true`
- UI surface: a new "Power" tab on every equipment detail page + a filter on the main equipment list page
- No color coding, no separate inventory system

---

## 1. Database migration

Run this SQL in the Supabase SQL editor before any code changes:

```sql
-- Add power-cable columns to the existing equipment table
alter table equipment add column if not exists is_power_cable boolean default false;
alter table equipment add column if not exists parent_equipment_id uuid references equipment(id) on delete set null;
alter table equipment add column if not exists power_input_connector text;
alter table equipment add column if not exists power_output_voltage text;
alter table equipment add column if not exists power_output_amperage text;
alter table equipment add column if not exists power_output_polarity text;
alter table equipment add column if not exists power_barrel_size text;
alter table equipment add column if not exists power_brand text;

-- Performance indexes
create index if not exists idx_equipment_is_power_cable
  on equipment(is_power_cable) where is_power_cable = true;
create index if not exists idx_equipment_parent_id
  on equipment(parent_equipment_id);

-- Sanity check — should return 261 (existing) and 0 (new power cables)
select count(*) filter (where is_power_cable = false) as regular_equipment,
       count(*) filter (where is_power_cable = true) as power_cables
from equipment;
```

**Column meanings:**
- `is_power_cable` — true for any power cord/brick/charger record. Existing 261 records all stay false.
- `parent_equipment_id` — uuid of the device this cord powers. NULL = orphan. Cascades to NULL on parent delete (don't lose the cord just because the device was retired).
- `power_input_connector` — text like `IEC C13`, `NEMA 5-15`, `USB-C PD`, `Hardwired`
- `power_output_voltage` — text (allows ranges like "12-24V"). For AC pass-throughs, leave NULL or set to `AC pass-through`.
- `power_output_amperage` — text like `5A` or `5A max`
- `power_output_polarity` — one of: `center_positive`, `center_negative`, `na`, `ac_passthrough`
- `power_barrel_size` — text like `5.5x2.5mm`, `5.5x2.1mm`, `3.5x1.35mm`, `USB-C`, `proprietary (Sony)`
- `power_brand` — text like `Atomos`, `Sony`, `generic`

All columns nullable. Existing 261 records remain valid.

---

## 2. Asset tag generation for power cables

When creating a new power cable record, the asset tag must be `PWR-###` format with the next available sequence number.

**Pattern to use:**

```typescript
// In the AddPowerCableModal submit handler, before the insert
async function getNextPowerCableTag(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('equipment')
    .select('asset_tag')
    .like('asset_tag', 'PWR-%')
    .order('asset_tag', { ascending: false })
    .limit(1)

  const lastNum = data?.[0]?.asset_tag
    ? parseInt(data[0].asset_tag.replace('PWR-', ''), 10)
    : 0
  return `PWR-${String(lastNum + 1).padStart(3, '0')}`
}
```

The existing 4-digit numbering for regular equipment is untouched.

---

## 3. File changes

### 3a. Equipment detail page — add Power tab

**File:** `app/dashboard/equipment/[tag]/page.tsx`

The existing detail page should already have a tab system. Add a new tab labeled **Power** alongside the existing tabs. Its position: after Details, before History/Loans (use your judgment if existing structure differs).

**Power tab content:**

When the current equipment record's `is_power_cable === false` (it's a regular device):
- Heading: "Power cables for this device"
- A list of all equipment records where:
  - `is_power_cable = true`
  - `parent_equipment_id = current record's id`
- Each row in the list shows:
  - Photo thumbnail (left, 60x60px)
  - Asset tag (e.g. `PWR-042`) — clickable, navigates to `/dashboard/equipment/PWR-042`
  - Brand + output spec on the right (e.g. `Atomos · 12V 5A · 5.5x2.5mm center-positive`)
  - Edit button (opens edit modal)
  - Unlink button (sets parent_equipment_id to null, turns the cord into an orphan)
- An **Add power cable** button below the list

When `is_power_cable === true` (the user is viewing a power cable itself):
- Heading: "What this powers"
- If parent_equipment_id is set:
  - Show the parent device (photo, asset tag, brand/model, link to parent detail page)
  - "Unlink from this device" button
- If parent_equipment_id is null (orphan):
  - Big "Orphan — not linked to a device" banner
  - "Link to a device" button (opens device search modal)

**Add power cable modal:**

Opens from the Add power cable button. Two clearly separated tabs/sections inside the modal:

**Tab A — Create new power cable**

Form fields:
- Photo upload (use existing equipment photo upload pattern — Supabase Storage `equipment-photos` bucket)
- Brand (text input)
- Description / model (text input — short, freeform)
- Input connector (dropdown with common values + "Other" text fallback):
  - `IEC C13` (kettle lead)
  - `IEC C5` (cloverleaf)
  - `NEMA 5-15` (US standard wall plug)
  - `USB-A`
  - `USB-C PD`
  - `Hardwired`
  - `Other` (text input appears)
- Output voltage (text — e.g. `12V` or `5V` or `9-12V`)
- Output amperage (text — e.g. `5A` or `2.5A`)
- Output polarity (dropdown):
  - `Center positive`
  - `Center negative`
  - `N/A` (for AC pass-throughs or USB)
  - `AC pass-through` (for plain AC cords)
- Barrel / output connector size (text — e.g. `5.5x2.5mm` or `USB-C` or `proprietary`)
- Length (text — e.g. `6ft` — optional; **no DB column** — store in **notes** if captured, or omit in v1)
- Condition (dropdown — match existing equipment condition options)
- Notes (textarea)

On submit:
- Generate next `PWR-###` tag
- Insert new equipment row with `is_power_cable = true`, `parent_equipment_id = current equipment record's id`
- Refresh the Power tab list

**Tab B — Link existing orphan**

- Search box (filters orphan power cables by asset tag, brand, or output spec)
- Result list: orphan cables with photo, asset tag, output spec, brand
- Click a result → confirm dialog → updates that cable's `parent_equipment_id` to the current device

### 3b. Equipment list page — Power Cables filter

**File:** `app/dashboard/equipment/page.tsx`

Add a top-level filter toggle near the existing search/filter controls:
- **All equipment** (default — current behavior, shows regular equipment)
- **Power cables** — filters to `is_power_cable = true`

When **Power cables** is selected:
- Sub-filter appears: `All / Paired / Orphan`
- Sort options: by asset tag (default), by output voltage, by parent device name
- Each row in the list shows:
  - Photo thumbnail
  - Asset tag (PWR-###)
  - Brand
  - Output spec (combined voltage + amperage + polarity short form, e.g. "12V 5A CP")
  - Parent device — clickable link to that device, or `Orphan` badge if unlinked
  - Last updated

### 3c. Equipment scan page — handle PWR-### codes

**File:** `app/dashboard/equipment/scan/page.tsx`

The existing scanner looks up an asset tag and routes to the detail page. Confirm it works with the new `PWR-###` format. The lookup query is text-based on `asset_tag`, so this should work automatically — verify by typing `PWR-001` in the scan input after creating a test record.

---

## 4. UX details and small things

- **Empty states.** Power tab on a device with no linked cables: "No power cables linked. Click Add power cable to register one." Equipment list with Power Cables filter and no results: "No power cables yet. Add one from any equipment's Power tab."
- **Sort order in the Power tab list.** Most-recently-added first, or by amperage descending. Pick whichever reads more naturally.
- **The Add power cable button on the equipment list.** When viewing the Power cables filter, the standard "Add equipment" button on the list page should switch to "Add power cable" and open a standalone version of the create form (no preselected parent device).
- **Photo upload.** Reuse the existing equipment photo upload pattern — Supabase Storage bucket `equipment-photos`, file path `<asset_tag>.<ext>`, update the `photo_url` field on the row.
- **Permissions.** All authenticated users can add/edit/unlink power cables. Match existing equipment permissions, don't add new role restrictions.

---

## 5. What NOT to touch

- The existing 261 equipment records and their 4-digit asset tags. Do not migrate or renumber any existing records.
- The existing equipment table columns (name, brand, model, condition, notes, category_id, etc.). Only add the new columns listed in section 1.
- The existing equipment kits feature (`equipment_kits`, `equipment_kit_items` tables and the kit detail page). Power cables don't go in kits — they're tracked per device.
- The existing equipment loans feature. Power cables aren't loaned independently of their parent device.
- The 4-digit asset tag generator for regular equipment. The PWR-### generator is a parallel, independent sequence.
- The equipment detail page's other tabs (Details, History, Loans, Maintenance, whatever exists). Add the Power tab alongside, don't restructure the rest.

---

## 6. Testing checklist

After implementation, verify:

1. `/dashboard/equipment` loads with all 261 existing items intact, no visible changes from before.
2. Toggle to **Power cables** filter — shows zero rows.
3. Open any existing device's detail page (e.g. an Atomos Ninja V). The new **Power** tab appears. Click it — shows "No power cables linked".
4. Click **Add power cable** → modal opens with two tabs: Create new and Link existing orphan.
5. On Create new, fill all required fields, upload a photo, submit. Toast confirms creation. Tag is `PWR-001`.
6. Power tab refreshes showing the new entry with photo, output spec, brand.
7. Go back to `/dashboard/equipment` with Power Cables filter on — `PWR-001` shows. Sub-filter Paired/Orphan both work.
8. Navigate to `/dashboard/equipment/PWR-001` — the cord's own detail page loads. "What this powers" shows the parent device with a link back.
9. Click the parent device link — lands back on parent's detail. Power tab still shows the cord.
10. Create a second power cable from the same device — gets `PWR-002`.
11. Create an orphan: from the equipment list page with Power Cables filter on, click Add power cable (no parent context), fill the form, submit. Tag `PWR-003`. Lands in the Orphan filter.
12. On the orphan's detail page, click **Link to a device** — search modal opens, pick a device, confirm. Orphan becomes paired with that device. The device's Power tab now shows the cord.
13. Click **Unlink** from a paired cord — returns to orphan state. Parent device's Power tab no longer shows it.
14. Edit a power cord (change output voltage from `12V` to `15V`) — saves cleanly.
15. Scanner page (`/dashboard/equipment/scan`): type `PWR-001` in the input — routes to the correct cord detail.
16. SQL spot-check: `select count(*) from equipment where is_power_cable = true;` returns the number of test records created. `select count(*) from equipment where is_power_cable = false;` still returns 261.

---

## 7. After build

Update these project docs and present them for re-upload to Project Knowledge:

- **`02-database.md`** — add the new `equipment` table columns under the Other tables section (or expand to give equipment its own subsection). Document the PWR-### asset tag convention.
- **`03-pages.md`** — add a one-line note under `/dashboard/equipment` that the page now supports a Power Cables filter, and under `/dashboard/equipment/[tag]` that the detail page now has a Power tab.
- **`06-todo.md`** — mark "Equipment add-new-item flow" closer to done (this spec covers the add flow for power cables specifically). Add any follow-up items discovered during build.

---

## Notes for Cursor

- This codebase uses Next.js 16, Tailwind v4, Supabase, and inline-styled React (not Tailwind classes on most components). Match the existing inline-style patterns from `app/dashboard/equipment/[tag]/page.tsx`.
- All new components should use `maxWidth: '1600px'`, base font size 15px, dark/light theme via `useTheme()`.
- Use the existing `Loader` component during async fetches.
- Use the existing `toast` utility (`@/lib/toast`) for success/error feedback.
- Validate every `.tsx` file with the div-balance checker in `05-conventions.md` before committing.
- Deploy: `git add . && git commit -m "Equipment: power cables feature" && git push` — Vercel auto-deploys.
