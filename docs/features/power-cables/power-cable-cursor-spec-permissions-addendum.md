# Cursor Spec Addendum — Equipment Permissions for Interns

> **Amendment (see [DECISIONS.md](./DECISIONS.md)):** Four roles exist: `Manager`, `Staff`, `Intern`, `Student Intern`. On **equipment**, `Manager` and `Staff` share the **same** permissions (including **delete**). `Intern` and `Student Intern` share the **same** limited permissions. RLS `equipment_delete` must allow **Staff and Manager**, not manager-only. The matrix below that says Staff cannot delete is **obsolete** for equipment.

This addendum extends the Power Cables Feature spec. Apply both during the same build.

## Why

Interns are the inventory labor for CSDtv. They'll be photographing gear, updating conditions, adding new equipment (including all power cables), and reuniting orphan bricks with devices. The current permission model may gate some of this behind manager-only checks — that needs to open up, with one safety net: interns can't permanently delete records.

## Permission model

| Action | Manager | Staff | Intern |
|---|---|---|---|
| View equipment list and detail | ✓ | ✓ | ✓ |
| Add new equipment (regular gear or power cable) | ✓ | ✓ | ✓ |
| Edit equipment fields (brand, model, condition, photo, notes, location, etc.) | ✓ | ✓ | ✓ |
| Link or unlink a power cable to/from a device | ✓ | ✓ | ✓ |
| Delete an equipment record | ✓ | ✗ | ✗ |
| Edit equipment categories or structural settings | ✓ | ✗ | ✗ |

Notes:
- Staff is restricted from delete and category edits in addition to interns. Only managers permanently remove records.
- "Edit equipment fields" includes the new power-cable-specific fields (power_input_connector, power_output_voltage, etc.).
- Linking/unlinking is just an UPDATE on `parent_equipment_id` — same permission as other edits.

## What to change

### 1. RLS policies on the `equipment` table

Verify and update if needed:

```sql
-- View current policies first
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where tablename = 'equipment';
```

The required policies:

```sql
-- Drop existing INSERT/UPDATE/DELETE policies if they restrict by role
-- (keep the SELECT policy as-is)
drop policy if exists equipment_insert on equipment;
drop policy if exists equipment_update on equipment;
drop policy if exists equipment_delete on equipment;

-- INSERT: any authenticated user (intern, staff, manager)
create policy equipment_insert on equipment
  for insert to authenticated
  with check (auth.uid() is not null);

-- UPDATE: any authenticated user
create policy equipment_update on equipment
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- DELETE: managers only — uses the existing is_manager() function
create policy equipment_delete on equipment
  for delete to authenticated
  using (is_manager());
```

If `is_manager()` doesn't exist (check first), the equivalent inline check is:

```sql
exists (
  select 1 from team
  where supabase_user_id = auth.uid()
    and role = 'Manager'
)
```

### 2. UI gating

In `app/dashboard/equipment/[tag]/page.tsx` and `app/dashboard/equipment/page.tsx`:

- Fetch the current user's role at page load (same pattern used elsewhere in the codebase — typically `const { role } = currentUser`).
- Render the **Delete equipment** button only when `role === 'Manager'`.
- All other action buttons (Add, Edit, Link/Unlink) render for all roles. No additional gating.
- For the new Power tab: Add/Edit/Link/Unlink buttons visible to all roles. No delete button in the Power tab — power cables are deleted from the regular equipment delete flow, which is already manager-gated.

### 3. The "Add equipment" button on the list page

The existing equipment list page may have an "Add equipment" button gated by role. If it is currently manager-only, change the gate to authenticated-only so interns and staff can add new gear.

When the Power Cables filter is active, the same button switches to "Add power cable" (per the main spec, section 4) and remains visible to all roles.

### 4. Equipment categories management

If there's a categories management UI (`/dashboard/settings` or similar), keep that manager-only. Interns adding new equipment pick from existing categories — they don't create new categories.

## Testing checklist

After this is in:

1. Log in as a Manager. Open `/dashboard/equipment`. Confirm Add, Edit, and Delete buttons all visible. Add a test item, edit it, delete it.
2. Log in as Staff (Ryan). Open `/dashboard/equipment`. Confirm Add and Edit are visible; Delete is hidden. Add a test item, edit it. Try to delete via direct API call — should fail with RLS error.
3. Log in as an Intern. Same checks as Staff — Add and Edit visible, Delete hidden. Add a regular equipment item. Add a power cable. Link an orphan to a device. Unlink it. All should work.
4. As the Intern, try to delete an equipment record by directly calling the Supabase delete from the browser console — confirm RLS rejects the operation.
5. As the Intern, open the Power tab on a device. Confirm Add, Edit, Link, Unlink buttons are all functional.

## What NOT to touch

- The `team` table's role values — Manager, Staff, Intern remain the three roles.
- Other tables' RLS policies — this addendum is scoped to `equipment` only.
- The `is_manager()` function definition itself — use it, don't redefine it.
- Existing Manager-only UI in other parts of the app (settings, user management, etc.) — out of scope here.

## After build

Update `02-database.md` with a note on the updated equipment RLS policies. Update `06-todo.md` to note that intern permissions for equipment work are now in place.
