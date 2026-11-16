# Phase 2 — Projects & Original Scope — Acceptance Report

**Tester run mode:** separate general-purpose subagent, fresh context (did not see the developers' reasoning; tested against FEATURE_SPEC / TEST_PLAN)
**Commit tested:** `309d83c` (branch `feature/p2-projects-and-scope`; `src/` and `supabase/` untouched throughout)
**Backend:** Supabase `guardscope-dev` (`eqozjuaaajstrewygqxr`) · **Date:** 2026-11-16
**Evidence folder:** `docs/testing/phase2/`
**Status:** COMPLETE — not accepted at `309d83c` (sections below). **Retest 1 at `c380e81`: ACCEPTED** (see "Retest 1" at the end).

## How it was run
| What | Command / method | Result | Evidence |
|---|---|---|---|
| Unit | `npm test` | 70/70 | `unit-tests.log` |
| Lint + typecheck | `npm run lint`, `npm run typecheck` (includes the new specs) | exit 0 / exit 0 | `lint-typecheck.log` |
| Developer pgTAP | `python3 -I scripts/pgtap-wrap.py tests/db/projects_scope.test.sql` → execute_sql (ROLLBACK) | 32/32 | `pgtap-projects_scope.tap` |
| Tester pgTAP (new) | same for `tests/db/projects_scope_tester.test.sql` | **80/80** | `pgtap-projects_scope_tester.tap` |
| SQL probe | B inserting into A's confirmed version vs a random id | identical 42501, no oracle | `sql-oracle-probe.log` |
| Phase 2 E2E (new) | `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/e2e/p2-projects.spec.ts tests/e2e/p2-scope.spec.ts tests/e2e/p2-a11y.spec.ts --trace off --workers=2 --reporter=list` | 23 passed, 11 failed (all failures = D-1 / D-2), 4 skipped (desktop-only by design) | `e2e-p2-run.log`, `e2e-p2-a11y-run.log`, `e2e-p2-a11y-desktop-isolated.log`, `e2e-p2-realistic-long-text.log` |
| T-10 deletion | `P2_THROWAWAY_EMAIL=… P2_THROWAWAY_PW=… npx playwright test tests/e2e/p2-account-deletion.spec.ts` (password in the shell env only) | 1 passed (desktop; mobile skipped by design) | `e2e-p2-account-deletion.log`, `sql-T10-deletion-rowcounts.log` |
| API logs | written by the specs | — | `api-T05-double-confirm.log`, `api-T07-T08.log`, `api-T06-baseline-{desktop,mobile}.json` |
| Phase 1 regression | `npm run test:e2e -- <all 8 Phase 1 specs> --trace off --workers=2 --reporter=list` on clean data | 98 passed, **2 failed** (one test × 2 viewports, D-5), 12 skipped (the same deliberate skips as Phase 1) | `e2e-phase1-regression.log` |
| axe | `@axe-core/playwright`, wcag2a/aa, 21a/aa, 22aa, best-practice | 0 serious/critical on 14 pages/states × 2 viewports | `axe/*.json` |
| Advisor | `get_advisors(security)` | no new findings | `supabase-advisors-and-cleanup.log` |

Note: one earlier Phase 1 regression run failed 5 tests because user A still had my long-title fixture projects (D-2). After cleanup, the run above is the one reported. Phase 1 evidence files overwritten by the regression run were restored from git.

## Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| AC-1 create, required only / all fields persist / default currency | **PASS** | T-01 in `e2e-p2-run.log`; `screenshots/*-T01-*.png`; tester pgTAP A1–A3 |
| AC-2 validation UI + server | **PASS** | UI: field errors + focused summary, 0 POSTs (`*-T02-*.png`). API: 13 payloads rejected 400/403 with 23502/23514/42501 (`e2e-p2-run.log`); tester pgTAP V1–V19. See O-1 |
| AC-3 edit / complete / archive / reopen; archived hidden + read-only | **PASS** (message → D-1) | T-03 covers edit, the Completed filter, reopen, archive, archived hidden from the default list, the Archived filter, a read-only detail page (only a "Reopen" button, no inputs) and reopen restoring editing (`*-T03-archived-readonly.png`). Opening `/projects/:id/edit` directly shows no form, but with the generic message (D-1). API: archived draft locked, confirm → `project_archived` (pgTAP R1–R5, `api-T07-T08.log`) |
| AC-4 draft editing incl. reorder, 3 allowance modes, persistence | **PASS** | T-04 desktop + mobile (`*-T04-draft-after-reload.png`) |
| AC-5 empty confirm rejected; valid confirm shows date + baseline | **PASS** (UI message → D-1) | Server rejects with `empty_scope` and nothing is confirmed (API, pgTAP, E2E DB check). Valid confirm shows the notice, "Confirmed 16 Nov 2026, 12:14 UTC" and the baseline heading, with `is_original_baseline=true` (`*-T05-confirmed.png`). The UI message for an empty confirm is generic (D-1) |
| AC-6 baseline byte-for-byte unchanged; original/current/draft in UI | **PASS** | E2E deep-equal of the v1 row + items before/after v2 (`api-T06-baseline-*.json`); pgTAP tester C7/C8 (md5 of full rows); UI (`*-T06-original-current-draft.png`) |
| AC-7 confirmed versions/items immutable via API, even for owner | **PASS** | `api-T07-T08.log`; pgTAP tester I1–I6; dev #17/#22/#23 |
| AC-8 A vs B isolation (REST + RPC); anon no access | **PASS** | `api-T07-T08.log` (B: GET `[]`, writes `[]`/42501, RPC → `not_found` for both draft and confirmed; anon 401 everywhere); pgTAP tester B1–B9, X1–X3, U1–U4, grant matrix G1–G11; `sql-oracle-probe.log` |
| AC-9 dashboard count + New project | **PASS** | T-09 (user B): count goes 0 → 1 via the dashboard "New project" link; completed projects are excluded; archiving brings it back to 0; with 6 active projects the count is 6, 5 are listed and "View all" appears (`desktop-T09-*.png`) |
| AC-10 account deletion | **PASS** | Empty password → summary. Wrong password → "That password is incorrect.", the RPC is not called, data stays intact and the user stays signed in. Correct password → `/sign-in` with "Your account and all its data have been deleted.", protected route redirects, sign-in shows the generic error (`desktop-T10-*.png`). DB: users, identities, sessions, refresh_tokens, profiles, projects and versions all 0 (`sql-T10-deletion-rowcounts.log`); pgTAP tester D1–D6 |
| AC-11 axe; keyboard; no overflow 375/1280 | **FAIL** (overflow only) | axe 0 serious/critical on all pages/states at both widths (`axe/*.json`). Keyboard PASS: add with Enter, reorder/remove, the confirm group takes focus, Tab → "Yes, confirm", focus is visible. Overflow: **D-2** |
| AC-12 Phase 1 regression | **FAIL** (outdated test, not a product regression) | 98/100 executed pass. T-16 `/projects` expects the Phase 1 placeholder that Phase 2 §6 replaces on purpose (D-5) |

## Test scenarios
| ID | Result | Evidence |
|---|---|---|
| T-01 | PASS | see AC-1 |
| T-02 | PASS | see AC-2 |
| T-03 | PASS (D-1 on the archived edit-URL message) | see AC-3 |
| T-04 | PASS | see AC-4 |
| T-05 | **FAIL (UI part)** | API PASS: `empty_scope`; sequential and **concurrent ×3** double confirm → exactly one 200 and the rest `already_confirmed`, leaving 1 baseline + 1 draft (`api-T05-double-confirm.log`). UI: the empty-scope and stale-tab confirms both show "Something went wrong. Please try again." (D-1; `*-T05-empty-scope.png`, `*-T05-stale-confirm.png`) |
| T-06 | PASS | see AC-6 |
| T-07 | PASS | see AC-7 |
| T-08 | PASS | see AC-8 |
| T-09 | PASS | see AC-9 |
| T-10 | PASS | see AC-10 |
| T-11 | **FAIL** (overflow) | axe + keyboard PASS; D-2 |
| T-12 | **FAIL** | D-5 |
| §6 not found / not yours | **FAIL** | A random id, B's project id and a malformed id give an identical page (no leak), but the heading is "Something went wrong", not "Project not found" (D-1; `*-S6-*.png`) |

## Defects raised
**D-1 — RPC/trigger and not-found errors are shown as "Something went wrong". Suggested severity: Medium.**
Cause (code reading, confirmed by E2E): `toApiError` in `src/lib/api/errors.ts` maps neither `P0001` messages (`empty_scope`, `already_confirmed`, `project_archived`, `not_found`, `scope_version_immutable`) nor `PGRST116`, so they all become `unknown`. The pages already expect these codes, and `errorMessages` already has the texts.
Steps: (a) confirm a draft with no deliverables; (b) open a draft in two tabs, confirm in tab 1, then in tab 2; (c) archive a project, then open `/projects/<id>/edit`; (d) open `/projects/<random-uuid>` or B's project id.
Expected: (a) "Add at least one deliverable before confirming the scope."; (b) "This scope was already confirmed. Refresh the page…"; (c) "This project is archived. Reopen it to make changes."; (d) heading "Project not found".
Actual: "Something went wrong. Please try again." (heading "Something went wrong" for d). Server-side rejection is correct and there is no existence leak. Tests: `p2-scope.spec.ts` T-05 UI ×2; `p2-projects.spec.ts` §6 ×2 and T-03 (soft assertion).

**D-2 — Very long unbroken text causes horizontal overflow (§6, AC-11). Suggested severity: Low–Medium.**
Steps: create a project with a 200-character title and client name containing no spaces (allowed by the limits), then open `/projects`.
Expected: the text wraps at both widths. Actual: page `scrollWidth` is 2223 at 1280 and 2095 at 375; the card `h2`/`p` sit in a `flex flex-wrap` row, and `break-words` doesn't reduce min-content width. On detail at 375 with a 5000-character unbroken description, the Overview `dl` (a `grid` without explicit columns below `sm`) is 70,683 px wide. Realistic content (spaced words, a 280-character URL) does **not** overflow at either width (`e2e-p2-realistic-long-text.log`). A likely fix is `overflow-wrap:anywhere`, or `min-w-0` plus `grid-cols-1`/`minmax(0,1fr)`. Evidence: `e2e-p2-a11y-run.log`, `e2e-p2-a11y-desktop-isolated.log` (offending element paths), `*-T11-projects-list.png`, `mobile-T11-detail-baseline-current-draft-long-text.png`.

**D-3 — PROJ-003 overview omits the revision allowance. Suggested severity: Low.**
The spec lists "status of the original scope, counts of deliverables and exclusions, revision allowance". The Overview shows "Confirmed … · N deliverables, N exclusions" only. The allowance appears further down in the baseline card. Either add it to the Overview or have the spec owner accept this.

**D-4 — "Project created/updated." notice reappears on every reload. Suggested severity: Low (cosmetic).**
The notice comes from `history.state`, which survives reloads. After an edit followed by a scope confirmation, a reload shows "Project updated." again (`mobile-T06-original-current-draft.png`).

**D-5 — Phase 1 test T-16 `/projects` is outdated by Phase 2. Suggested severity: Low (test maintenance; blocks AC-12 as written).**
`tests/e2e/settings-and-empty-states.spec.ts:131` expects "Projects will appear here" and no buttons in `main`. Phase 2 §6 requires an empty state with a create action. The Tester did not change the test. The developer should update it to the Phase 2 empty state with a spec reference, and the spec owner confirms.

## Observations (no defect raised)
- **O-1:** The API accepts a 3-decimal price and rounds it (`10.555` → `10.56`). The UI rejects more than 2 dp. Add a check, or accept the rounding.
- **O-2:** Archived projects' own fields can be PATCHed through the API (BR-6 is UI-only). Their scope is locked server-side.
- **O-3:** The `guardscope.account_deletion` custom GUC can be set by any SQL session. It is not reachable through PostgREST (`/rpc/set_config` refused), and with the flag on, RLS still blocks client writes to confirmed rows (pgTAP tester, `sql-oracle-probe.log`). Acceptable as defence-in-depth.
- **O-4:** After deletion, the already-issued access token still authenticates until it expires and returns `[]` (stateless JWT, no data).
- **O-5:** SCOPE-005 wording is "Original agreement (baseline, version 1)" followed by "Confirmed <date>. This record cannot be changed." The meaning is the same as the specified label.
- **Developer pgTAP review:** it passes, but #26 is weak (passes a NULL id), the owner's immutability UPDATE/DELETE statements are not asserted, and #32 doesn't count version/item rows. The tester suite covers these.

## Security advisor
Only `authenticated_security_definer_function_executable` (confirm_scope, delete_my_account) and `auth_leaked_password_protection` were reported. Both are already dispositioned in `docs/security/ADVISOR_NOTES.md`, so there are **no new findings**.

## Cleanup
`auth.users` contains only a@ and b@guardscope.test. Projects, scope_versions and scope_items are 0, and both profiles' fields are null. The throwaway user was deleted via the UI; its password existed only in the shell env, and only a locally computed bcrypt hash went into SQL. The pgTAP users were rolled back.

## Files added by the Tester
`tests/db/projects_scope_tester.test.sql`, `tests/e2e/p2-helpers.ts`, `tests/e2e/p2-projects.spec.ts`, `tests/e2e/p2-scope.spec.ts`, `tests/e2e/p2-a11y.spec.ts`, `tests/e2e/p2-account-deletion.spec.ts`, `docs/testing/phase2/**`. Nothing in `src/` or `supabase/` changed, and nothing was committed.

## Exceptions requested (needs HA-ID)
None. D-5 needs the spec owner to confirm the changed Phase 1 assertion.

## Decision
**Not accepted at `309d83c`.** The database and security layer pass every check (AC-6/7/8/10 are strong). Fix D-1 and D-2, update D-5, then retest. D-3 and D-4 can be fixed or accepted by the spec owner.

---

# Retest 1 (commit c380e81)

**Run mode:** Tester subagent, independent verification against FEATURE_SPEC / TEST_PLAN, not the developer's claims. **Date:** 2026-11-16. **Backend:** `guardscope-dev`. `src/` and `supabase/` not modified, nothing committed. Evidence under `docs/testing/phase2/` (files from this retest carry `retest1`; the screenshots, `axe/*.json` and `api-*` evidence were regenerated at `c380e81`).

## What changed and how I checked the developer's test edits
- `git diff 3a7c1eb c380e81 -- src tests`: the fixes are in `errors.ts` (P0001/PGRST116/42501/23502 mapping), `projects.ts`/`scope.ts` (uuid guard), `ProjectDetailPage.tsx` (one-shot notice, Overview allowance, `grid-cols-1`), and `wrap-anywhere`/`min-w-0` in the list, detail, scope view, item editor, dashboard and settings.
- The developer also touched my Tester specs (`p2-*.spec.ts`, `p2-helpers.ts`). I ran prettier over the `3a7c1eb` versions and diffed them with `c380e81`. They are **identical**: the edits were formatting only, so **no assertion was weakened**.

## How it was run
| What | Command / method | Result | Evidence |
|---|---|---|---|
| Format, lint, typecheck, unit, build, bundle-secrets | `npm run check` | exit 0. Unit tests 102/102 in 10 files (includes the developer's new `errors`, `projectsApi` and `projectDetail` tests) | `check-retest1.log` |
| pgTAP Phase 2 (dev) | `python3 -I scripts/pgtap-wrap.py tests/db/projects_scope.test.sql` → `execute_sql` (ROLLBACK) | **32/32** | `pgtap-retest1-projects_scope.tap` |
| pgTAP Phase 2 (tester) | same, `projects_scope_tester.test.sql` | **80/80** | `pgtap-retest1-projects_scope_tester.tap` |
| pgTAP Phase 1 | same, `profiles_rls.test.sql` / `profiles_rls_tester.test.sql` | **12/12**, **22/22** | `pgtap-retest1-profiles_rls*.tap` |
| Full E2E regression (Phase 1 + Phase 2 + the developer's debug specs + new `p2-retest1.spec.ts`) | `set -a && . ./.env.test.local && set +a && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e -- --trace off --workers=2 --reporter=list` on clean data | **162 passed, 0 failed, 18 skipped** | `e2e-run-retest1.log` |
| T-10 account deletion (needs a throwaway account, so it is skipped in the full run) | `P2_THROWAWAY_EMAIL=… P2_THROWAWAY_PW=… npx playwright test tests/e2e/p2-account-deletion.spec.ts` (password only in the env) | 1 passed (desktop; mobile skipped by design) | `e2e-p2-account-deletion-retest1.log` |
| axe at 375 and 1280 | `p2-a11y.spec.ts`: 14 pages/states × 2 widths, including the long-text list/detail, not-found, archived, confirm-dialog error and settings delete error | **0 violations of any impact** (0 serious/critical) on all 28 scans. The same test asserts no horizontal overflow | `axe/*.json`, `screenshots/*-T11-*.png` |
| Advisor | `get_advisors(security)` | same 2 dispositioned items; **no new findings** | `supabase-advisors-and-cleanup-retest1.log` |

**Full-run history (nothing hidden):**
- **Attempt 1** (`e2e-run-retest1-attempt1.log`): 142 passed, **4 failed**. All 4 were Phase 1 T-16 (`/` and `/projects` × 2 viewports). The Phase 2 specs, which run earlier in alphabetical order, left user A with active projects, so the empty-state precondition was false. Every D-1..D-4 check passed in this attempt.
- I made the following test-hygiene fixes:
  - the Phase 2 specs now archive the projects each test creates (`trackCreatedProjects`/`archiveTracked`, hooked in `p2-projects`, `p2-scope`, `p2-a11y` and `p2-retest1`);
  - T-16 now waits up to 120 s for its precondition (A has 0 active projects) before asserting.

  No assertion was changed.
- **Attempt 2** (`…-attempt2.log`): 156 passed, 6 failed:
  - T-16 again: a race in my tracker, which `afterEach` ran before the response body was read. Fixed by awaiting the pending reads.
  - My new D-4 test expected Back to return to `/edit`. Saving an edit navigates with `replace: true`, which is unchanged since `3a7c1eb` and the intended design, so the expectation was mine and wrong. It now expects the earlier detail entry and asserts no notice there.
- **Attempt 3:** the run reported above.
- **18 skips, all deliberate:**
  - the same Phase 1 skips as before;
  - Phase 2 desktop-only API tests on mobile (T-01 default currency, T-05 API, T-07/T-08, T-09);
  - T-10 × 2 (run separately above).

## D-5 / ISS-013: Phase 1 test updated (authorised by the Team Lead under the approved Phase 2 spec §6, HA-004)
`tests/e2e/settings-and-empty-states.spec.ts` T-16 `/projects` now expects:
- the Phase 2 empty state heading "No active projects";
- no buttons and no dead links in `main`, as before;
- a "New project" link **inside the empty state** with `href="/projects/new"` that, when clicked, opens the create form.

The Phase 1 intent is unchanged: an empty state with no dead actions. The `/` (Dashboard) case is unchanged. A comment cites ISS-013 and §6.

## Alert "Error:" prefix: my decision
`Alert` (Phase 1) renders `<span class="sr-only">Error: </span>` inside `role="alert"` so that status is not conveyed by colour alone (PRD §12). That is correct product behaviour. I did **not** loosen the check to `toContainText`. The T-05 assertions now use the **exact full accessible text**: `toHaveText('Error: Add at least one deliverable before confirming the scope.')` and `'Error: This scope was already confirmed. Refresh the page to see the latest version.'`. This is as strict as before and also pins the prefix.

## The 42501 → not_found risk: assessed
- **Where 42501 reaches an owner:** stale-tab writes after a confirmation elsewhere never return 42501. Updates and deletes affect 0 rows, and inserts hit the guard trigger (`scope_version_immutable`). Both map to "Confirmed scope cannot be changed. Edit the draft instead." I verified this in the UI (`p2-retest1` "after the draft was confirmed elsewhere"; nothing was written). The only owner path to 42501 is an insert into the draft of a project that was **archived** in another tab. That path now shows "We couldn't find that. It may have been removed, or you may not have access." and writes nothing (`retest1-42501-*.log`: `403 {"code":"42501"…}`; `*-R1-stale-after-archive.png`).
- **Against the spec:** §6 requires that "a double-confirm or stale draft returns a safe error message". The message is safe and not wrong, but less specific than "archived". The double-confirm and stale-confirm cases (the ones §6 names) show the specific texts. **Acceptable.** Recorded as observation O-6 below.
- **Leak:** none.
  - 42501 is returned identically for another user's row and for a random id (`sql-oracle-probe.log`), and both now map to the same text.
  - The client error carries no title, id or state. The test asserts that the text contains neither "archived" nor the id.
  - The mapping makes "not yours" and "missing" indistinguishable in the UI, which is what §6 asks for.

## Defect verdicts
| Defect | Verdict | Evidence |
|---|---|---|
| **D-1** (ISS-009) error mapping | **FIXED, verified** | All four of my original D-1 checks now pass at both widths: T-05 empty scope, T-05 stale-tab confirm, the T-03 archived edit URL (soft assertion passes), and §6 random/B-owned/malformed ids with the identical "Project not found" page. Further checks in `p2-retest1`: stale writes after confirm → scope-locked text; after archive → not-found text; the malformed id makes **no Supabase request**, on both `/projects/not-a-uuid` and `/edit`. Unit tests cover the P0001 map, PGRST116, 42501 and 23502. |
| **D-2** (ISS-010) long-text overflow | **FIXED, verified** | `p2-a11y` T-11 (200-character unbroken title/client, 5000-character description and items) passes with no horizontal overflow at 375 and 1280. The list, detail (draft + baseline + current) and dashboard all wrap (`mobile-T11-projects-list.png`, `*-T11-detail-baseline-current-draft-long-text.png`). Realistic long text still wraps normally. |
| **D-3** (ISS-011) overview allowance | **FIXED, verified** | The Overview line now reads "Confirmed … · 1 deliverable, 1 exclusion · Revisions: X" for all four cases: 2 / 1 / none / not specified ("2 revisions included", "1 revision included", "No revisions included", "Not specified", BR-4). It keeps the **baseline** value after the draft's allowance changes to 7 (`p2-retest1` D-3 × 4 × 2 widths; `*-R1-D3-overview.png`). |
| **D-4** (ISS-012) notice on reload | **FIXED, verified** | "Project updated." shows after saving, and is absent after a reload, after confirm + reload (the original reproduction) and after Back/Forward. Back/Forward navigation still works (`p2-retest1` D-4; the developer's D-4 "Project created." test also passes). |
| **D-5** (ISS-013) outdated Phase 1 test | **RESOLVED** (test updated, see above) | T-16 passes at both widths in the full run. |

## Updated acceptance criteria (c380e81)
| Criterion | Result | Notes / evidence |
|---|---|---|
| AC-1 | PASS | T-01 ✓ |
| AC-2 | PASS | T-02 UI + API ✓; pgTAP V1–V19 ✓ (O-1 still open as an observation) |
| AC-3 | PASS | T-03 ✓, including the archived edit-URL message |
| AC-4 | PASS | T-04 ✓ |
| AC-5 | PASS | T-05 UI (exact messages) + API (sequential and concurrent) ✓ |
| AC-6 | PASS | T-06 deep-equal ✓; pgTAP C7/C8 md5 ✓ |
| AC-7 | PASS | T-07 ✓; pgTAP I1–I6 ✓ |
| AC-8 | PASS | T-08 ✓; pgTAP B1–B9, X1–X3, U1–U4, G1–G11 ✓ |
| AC-9 | PASS | T-09 ✓ |
| AC-10 | PASS | T-10 ✓ (throwaway account deleted through the UI; 0 rows remain); pgTAP D1–D6 ✓ |
| AC-11 | **PASS** (was FAIL) | axe 0 violations × 28; keyboard ✓; no overflow at 375/1280, including the 200/5000-character unbroken text |
| AC-12 | **PASS** (was FAIL) | All Phase 1 specs pass in the same full run; pgTAP Phase 1 12/12 + 22/22 |

## Updated test scenarios
| ID | Result |
|---|---|
| T-01 … T-04 | PASS |
| T-05 | **PASS** (was FAIL) |
| T-06 … T-10 | PASS |
| T-11 | **PASS** (was FAIL) |
| T-12 (Phase 1 regression) | **PASS** (was FAIL) |
| §6 not found / not yours / malformed | **PASS** (was FAIL) |
| Retest-only `p2-retest1.spec.ts` (stale writes, 42501, malformed id makes no request, D-3 × 4, D-4) | PASS (8 tests × 2 widths) |

## New defects
**None.**

New observation:
- **O-6:** a stale-tab item add after the project was archived elsewhere shows the generic not-found text rather than "This project is archived". It is safe, leaks nothing and writes nothing. Optional polish: re-fetch the project on a 42501 error. This is not a §6 violation.

Observations O-1 to O-5 are unchanged.

## Cleanup
- `auth.users` contains only a@ and b@guardscope.test. projects, scope_versions and scope_items are 0, and both profiles' fields are null.
- The T-10 throwaway account was deleted by the test through the UI. Its identities are 0.
- The pgTAP users were rolled back.
- **Restored from git:** the Phase 1 evidence files (`docs/testing/phase1/axe/*.json`, `docs/testing/phase1/screenshots/*.png`) that the full regression overwrote.

## Files changed by the Tester in this retest
- `tests/e2e/p2-scope.spec.ts`: the exact alert text now includes the sr-only prefix; added the cleanup hooks.
- `tests/e2e/settings-and-empty-states.spec.ts`: the D-5 update and the T-16 precondition wait.
- `tests/e2e/p2-helpers.ts`: added `trackCreatedProjects` and `archiveTracked`.
- `tests/e2e/p2-projects.spec.ts` and `tests/e2e/p2-a11y.spec.ts`: added the cleanup hooks.
- `tests/e2e/p2-retest1.spec.ts`: new.
- `docs/testing/phase2/*retest1*` plus the regenerated evidence.
- this report.

## Final acceptance decision
**ACCEPTED at `c380e81`.**
- AC-1 to AC-12 and T-01 to T-12 all pass.
- D-1 to D-4 are fixed and independently verified, and D-5 is resolved (the Team Lead authorised the test update under HA-004).
- There are no new defects.
- Before close-out, the Team Lead should update ISS-009 to ISS-013 to "Verified / Closed".
