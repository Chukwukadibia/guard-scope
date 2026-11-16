# Phase 2 — Projects & Original Scope — Acceptance Report

**Tester run mode:** separate general-purpose subagent, fresh context (did not see the developers' reasoning; tested against FEATURE_SPEC / TEST_PLAN)
**Commit tested:** `309d83c` (branch `feature/p2-projects-and-scope`; `src/` and `supabase/` untouched throughout)
**Backend:** Supabase `guardscope-dev` (`eqozjuaaajstrewygqxr`) · **Date:** 2026-11-16
**Evidence folder:** `docs/testing/phase2/`
**Status:** COMPLETE — **not accepted**: D-1 (Medium) and D-2 (Low–Medium) must be fixed and the outdated Phase 1 test (D-5) updated first.

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
