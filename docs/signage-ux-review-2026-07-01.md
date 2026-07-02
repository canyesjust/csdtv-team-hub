# Digital Signage — Usability & Workflow Review

_Scope: Public submission flow + Admin dashboard. Lenses: everyday usability, workflow efficiency, visual/UI polish. Date: 2026-07-01._

---

## TL;DR

The signage system is functional and fairly complete, but three structural issues create most of the day-to-day friction:

1. **Two separate public submission forms** (`/signage/submit` and `/signage/csdtv/submit`) with different fields, styling, backends, and reviewer-notification logic — and no page that points a submitter to the right one.
2. **Silent scope-widening on approval.** When a submission has no target area/screen, approving it quietly sets `all_screens = true`. The reviewer gets no warning that they just pushed content district-wide.
3. **Client-side validation gaps at upload time.** Wrong file type, HEIC photos, oversized files, and portrait orientation are all caught late (at submit, or not at all), so submitters fill out the whole form before hitting a wall.

Everything else is refinement on top of a solid base. The rest of this doc is organized as: **Public submission**, **Admin dashboard**, **Cross-cutting UI/visual**, then a **prioritized roadmap** and **mockups**.

---

## 1. Public submission flow

### 1.1 The two-form problem (highest impact)

There are two public entry points that do overlapping jobs:

| | `/signage/submit` | `/signage/csdtv/submit` |
|---|---|---|
| Audience | General / CIC building signage | CSDtv office signage |
| Submits | Visitor + announcement + image/video (multi-toggle) | Image only (+ caption/department) |
| Area picker | Yes, with live screen count | None |
| Backend | `/api/signage/submit` (multi-table) | `/api/signage-submissions` |
| Reviewer notified | users with `signage_approver = true` | users with `role = 'Manager'` |
| File picker | Custom dashed "drop zone" (no actual drop) | `FilePickButton` component |
| Colors / type scale | `#185fa5`, 12–13px | `#1e6cb5`, 13–15px |

Two forms that look and behave differently, with different validation and different notification rules, is the single biggest source of confusion and maintenance cost. A submitter has no way to know which URL to use, and `/signage` (the public landing) is a **display board**, not a submission entry point — so there's no wayfinding at all.

**Correction (2026-07-01, after author feedback):** The two forms are _not_ redundancy to merge. The intended model is **one form per location**, and today a new site requires a developer to hand-build a new page + URL (that's what `/signage/csdtv/submit` is). The right fix is a **single dynamic template with per-site URLs derived from the existing `slug`** — not consolidation into one shared form.

**Implemented:** A dynamic route `/signage/[slug]/submit` now resolves the site by its (already unique) `signage_sites.slug`, renders one shared `SiteSubmitForm` scoped to that site (only its areas; its name/branding), and posts to the existing submit API with a `site_slug` guard so a location's form can only target its own areas. Provisioning a site makes its form live at `/signage/<slug>/submit` with zero new code; the sites dashboard now shows a copy-link button per location and the new-site page previews the URL. The CSDtv office queue is intentionally left on its separate backend for now.

### 1.2 Upload UX — catch problems before submit

Current behavior on `/signage/submit`:
- The dashed box says "Drop an image or browse" but there are **no drag-and-drop handlers** — it's click-only. That's a false affordance.
- **No client-side type/size check.** HEIC photos (the iPhone default) are rejected only at the server after the whole form is filled ("HEIC photos are not supported…"). Oversized files (>4 MB) likewise fail only after upload.
- Portrait images: `/signage/csdtv/submit` warns after load ("will run with black bars…") but doesn't block; `/signage/submit` doesn't check orientation at all.

**Recommendation:**
- Validate on file selection: type (jpg/png/webp/mp4), size, and HEIC — show a clear inline message immediately.
- Either implement real drag-and-drop or drop the dashed "drop zone" language.
- Show the selected file's dimensions/size next to the preview, and keep the portrait warning but make it a visible amber badge on both forms.
- Reuse one file-picker component across the form(s) instead of two implementations.

### 1.3 Form logic that isn't visible to the user

The multi-toggle form couples fields invisibly: dates become required *only* when Image or Announcement is on, and "at least one item" is required but never stated up front. Users discover these rules through error messages.

**Recommendation:** Add a one-line helper at the top ("Add at least one: a visitor, an announcement, or an image — reviewed before it appears") and reveal the "Show from / Show until" block with a short caption ("Required for images and announcements") the moment a relevant toggle is enabled.

### 1.4 Terms modal & validation timing

- Validation runs when opening the terms modal, but errors that occur *inside* the modal (e.g., server rejection) leave the old error visible on reopen, and the modal has **no focus trap** and **no backdrop-click / X to close** — awkward on mobile and for keyboard users.
- The two consent checkboxes ("appropriate for a school and district audience" / "applicable to the Canyons School District") are vague and both are required with no explanation.

**Recommendation:** Clear errors on open, add a focus trap + close affordances, and reword the consent items in plain language. Consider collapsing to a single clear attestation.

### 1.5 After submit — the trail goes cold

On success the user sees "Your submission is in the review queue. You'll get an email once it's been reviewed." There's:
- No estimated turnaround.
- No confirmation email at submission time (only on decision).
- No "Submit another" on `/signage/submit` (the office form *does* have one — inconsistent).
- No reference number or status page, so people re-submit when unsure.

**Recommendation:** Add "typically reviewed within 1–2 school days," send an immediate confirmation email, add "Submit another," and surface a short reference ID.

### 1.6 Accessibility quick wins (submission)

Associate checkbox `id`/`htmlFor`, give inputs visible focus rings (inline styles currently can't express `:focus`), use the file name as preview alt text, and ensure 44px touch targets and `font-size:16px` on mobile inputs to avoid iOS zoom.

---

## 2. Admin dashboard (`/dashboard/signage`)

### 2.1 Approval workflow — the footguns

**Silent scope-widening (highest impact).** In both the Overview quick-approve and the Content detail approve, if a submission has no targeting, the code sets `all_screens: true` on approve. The reviewer isn't told. A visitor welcome meant for one lobby can land on every screen in the district.
→ **Fix:** show a clear inline state before approving — "No area selected → will show on **all screens**" — with a one-click "limit to [area]" option.

**No approval confirmation, but heavy reject friction.** Approve is instant with no summary; Reject requires typing a reason in an inline input that's easy to miss and is silently discarded if the panel is closed. The safety asymmetry is backwards — the destructive-feeling action (reject) is fiddly while the broadcast action (approve) is one click.
→ **Fix:** give Approve a compact confirm summary (what, where, when); make Reject a clear two-button confirm state.

**Two approval code paths.** Overview and Content each re-implement the "default targeting + approve" logic slightly differently, so behavior can drift depending on where you approve.
→ **Fix:** extract one shared `approveContent()` helper.

**Live takeover is a loaded gun.** One toggle on `/dashboard/signage/live` pushes an HLS/YouTube stream to all screens with no confirmation or dual-control. The keep-alive auto-clear is a good safety net, but the initial action deserves a confirm step and a visible "LIVE on N screens" banner.

### 2.2 Information architecture

14 links across 5 groups (Overview / Content / Screens / This location / Admin · all locations). The per-location vs. global split is thoughtfully labeled, but:
- Approvers see only "Content"; managers see everything — a large visibility gap with no middle tier.
- No breadcrumb or "you are here / editing site X" confirmation beyond the site picker; changing sites gives no feedback that it took effect.
- "Branding & template," "Location & weather," and "Live takeover" are grouped under "This location," which is good, but discoverability of *what each page does* relies on the label alone.

**Recommendation:** Add a lightweight site-context confirmation (toast or header echo) on switch, and consider consolidating rarely-used config pages. Keep the group structure.

### 2.3 Consistency, empty states, loading

- **No design system.** All styling is inline via `useSignageAdminStyles(theme)`. It's consistent *because* everyone imports the same hook, but there are no reusable Button/Card/Input components, no filled primary button (everything is outline), no hover/focus states on most controls, and typography sizes are hardcoded ad hoc.
- **Empty states** are bare text ("Nothing scheduled right now.") with no call to action.
- **Loading** is a plain "Loading…" everywhere — no skeletons.
- **Delete** is buried at the bottom of a long scroll panel in the smallest font (though it does confirm).

**Recommendation:** Extract a small component layer (Button/Card/Input/EmptyState/Skeleton) from the existing tokens — low risk since the tokens already exist — add focus rings, a real filled primary button, CTA empty states, and promote Delete to the panel header.

### 2.4 Targeting & scheduling clarity

The chip-based targeting picker (All screens → Areas → Buildings → Specific screens) is well built and gives good visual feedback, but there's no legend explaining that multiple selections are OR'd, and no tooltip on whether "Show until" is inclusive. The lifecycle pill (Active/Upcoming/Expired) is only shown on approved items, not while reviewing pending ones.

**Recommendation:** Add a one-line legend, show a live "this will be Active/Upcoming" pill while editing dates in the pending state, and clarify end-date semantics.

---

## 3. Cross-cutting UI / visual

- **Unify the palette and type scale** across both submission forms and the dashboard into shared tokens (the dashboard already has them; the public forms each hardcode their own).
- **One primary button style** (filled) used consistently for the main action on every screen; outline for secondary.
- **Consistent 44px targets + visible focus** everywhere for accessibility and touch.
- **Consistent empty/loading/success patterns** so the two halves of the product feel like one product.

---

## 4. Prioritized roadmap

### P0 — Prevents wrong content / lost submissions (do first)
1. Warn (don't silently widen) when approving content with no targeting; offer "limit to area."
2. Add a confirm summary to Approve and a clear two-button Reject; unify the two approval code paths.
3. Client-side file validation (type, size, HEIC, orientation) with immediate inline errors.
4. Unify reviewer notifications so office submissions always reach an approver.

### P1 — Removes daily friction
5. ~~Merge the two submission forms into one~~ **Done:** dynamic per-site form at `/signage/[slug]/submit`, URLs auto-derived from the site slug (see §1.1 correction).
6. Post-submit improvements: turnaround estimate, confirmation email, "Submit another," reference ID.
7. Confirmation + "LIVE on N screens" banner for live takeover.
8. Terms modal: clear errors on open, focus trap, close affordances, plainer consent wording.

### P2 — Polish & scale
9. Extract a shared component layer (Button/Card/Input/EmptyState/Skeleton) + focus rings + filled primary.
10. CTA empty states and skeleton loaders across the dashboard.
11. Targeting legend + live lifecycle pill while scheduling; end-date semantics tooltip.
12. Site-switch feedback and a submitter-facing status page.

---

## 5. Mockups

Two before/after mockups accompany this review:

- **`signage-ux-mockups.html`** — annotated redesigns of (a) the unified public submission form with inline file validation and visible field logic, and (b) the admin review panel with the scope-widening warning and approve/reject confirmation.

Open the HTML file in a browser to view. It is a static, self-contained visual reference — not wired to the app.

---

_Prepared as an analysis pass; no application code was modified. File/line references for every finding are available in the working notes behind this review._
