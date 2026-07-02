# Complexity & simplification review — 2026-07-01

Follow-up to `code-bloat-review-2026-07-01.md` (dead code now removed — thanks!).
This pass: code that works but could be written smaller. Method: jscpd copy-paste
detection (111 exact clones, 1,692 duplicated lines), function-length and nesting
metrics, plus manual review of every hotspot. Estimated total reduction if all applied:
**~850–1,000 LOC**, with the bigger win being consistency — new routes and pages get a
pattern to follow instead of a block to copy.

---

## 1. API route boilerplate — biggest systematic win (~260–320 LOC)

**Pattern**: 13 routes under `app/api/board-meetings/[production_id]/` open with the
same ~27-line preamble: `getAuthenticatedTeamUser` → 401, `isStaffOrManagerRole` → 403,
`await params`, `getServiceSupabaseClient` → 500, `assertBoardMeetingProduction` → 4xx.
(upload-agenda, re-upload-agenda, clear-agenda, lock/unlock-agenda, reset,
reopen-meeting, apply-diff, import-agenda, reorder, agenda-items/[item_id], control/*)

**Fix**: one wrapper in `lib/api/route-handlers.ts`:

```ts
export async function withBoardMeetingAuth(
  params: Promise<{ production_id: string }>,
  handler: (ctx: { teamUser: TeamUser; productionId: string; service: SupabaseClient }) => Promise<NextResponse>,
): Promise<NextResponse> { /* the shared preamble, once */ }
```

Each route body shrinks to just its own logic. Same idea, smaller scale:

- `app/api/media-assets/{sign-upload,finalize,upload}` — shared auth + asset-type
  validation block (~30 LOC)
- `app/api/brand/upload/{sign,finalize}` — identical manager-or-review-key auth +
  rate-limit block, ~23 LOC duplicated verbatim (~30 LOC)

Security benefit too: auth checks live in one place, so a future route can't forget one.

## 2. Verbatim duplication between files (~255 LOC)

| What | Where | Fix |
|---|---|---|
| `focusChip()` — 44 identical lines | `dashboard/productions/page.tsx:995` and `dashboard/tasks/page.tsx:1015` (plus twin `scopeBtn`) | Extract `<FocusChip>` component |
| `buildVoteResultOverlay()` — 38 lines | `lib/board-meetings/public-output-live.ts:38` and `public-output-state.ts:205` | Extract to shared module |
| `buildMotionLifecycle()` + `buildResultOverlay()` — ~60 lines | `lib/board-meetings/control-bundle.ts:272` and `control-live-bundle.ts:31` | Extract to `motion-lifecycle.ts`; both are context-free |
| Brand helpers (`detectFormat`, `previewBg`, `toColorInputValue`, `deriveLogoName`, `DocBadge`) | `app/brand/[code]/page.tsx` and `app/dashboard/brand/[code]/page.tsx` | Extract `lib/brand-utils.ts` |
| Motion result DB update — 23-line block twice in one file | `lib/board-meetings/motion-control.ts:660` vs `:801` | Extract `updateMotionResult()` helper |
| `inputStyle` + CSS-var consts scaffold — ~25 lines each | `MediaTab`, `TemplatesTab`, `QRCodesTab` (and echoed in tasks/productions/settings pages) | Shared `useTabStyles()` hook or style-consts module |

Note: the `ArticleEditorShell` clone in `KnowledgeArticlesTab` is an intentional
lazy-load placeholder — leave it.

## 3. The four giant pages (~325–410 LOC, plus readability)

These aren't broken, but each repeats the same internal patterns:

**`app/dashboard/settings/page.tsx` (1,856)** — best effort/reward ratio:

- 8 near-identical CRUD handlers (`startEditTpl/cancelTplEdit/saveTpl` at 544–607,
  `startEditTier/...` at 641–676) → one generic `createCrudHandlers()` factory (~80 LOC)
- 7 repeats of `confirmDialog → setSaving → try/callAdminSettings/catch toast/finally`
  → a `useAsyncAction()` hook (~40 LOC, also useful app-wide)

**`app/dashboard/tasks/page.tsx` (2,239)**:

- 15 `useState` calls for the intake domain (lines 187–201) → one `useReducer` (~55 LOC)
- Two clone `useEffect` fetch chains (382–425, 427–446) → one custom hook (~50 LOC)
- `focusChip`/`scopeBtn` extraction from §2 (~40 LOC)

**`app/dashboard/productions/page.tsx` (2,019)** — also the deepest nesting in the
repo (87 lines at 8+ indent levels):

- `focusChip` extraction (~40 LOC)
- 5-useState email-modal group + 13-line inline `panelEmailInputStyle` → grouped state
  + shared input style (~45 LOC)
- Repeated inline pill-button style objects → one `pillButtonBase` const (~30 LOC)

**`app/brand/[code]/page.tsx` (819)** — second-deepest nesting (77 lines at 8+);
shrinks naturally via the `lib/brand-utils.ts` extraction in §2.

## 4. Deep-nesting hotspots (refactor when next touched)

Lines with 8+ indentation levels: productions/page.tsx (87), brand/[code]/page.tsx (77),
OnboardingTemplateEditor.tsx (55), dashboard/brand/[code]/page.tsx (36),
contacts/page.tsx (26), BoardMeetingTab.tsx (24). Usual cure: early returns and
extracting the inner JSX block into a named component.

## Suggested order

1. `withBoardMeetingAuth()` wrapper + refactor the 13 routes (mechanical, high value,
   improves security posture; run `/security-review` after since it touches auth paths).
2. The §2 extractions — each is an independent, low-risk commit.
3. settings/page.tsx CRUD factory + `useAsyncAction()`.
4. tasks/productions state grouping + style consts, opportunistically.

Each step should end with `npm run build` green. Overall duplication is only 1.82% of
lines — this codebase is in decent shape; the wins above are targeted, not a rewrite.
