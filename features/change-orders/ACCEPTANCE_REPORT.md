# Phase 4 Change Orders: Acceptance Report
**Tester run mode:** separate general-purpose subagent with a fresh context (Tester Specialist). The run was restarted after a container restart, and no evidence from the earlier attempt survived. Everything below was executed in this run. · **Commit tested:** product code `bc96c8b` (`feature/p4-change-orders`). The working tree sits on WIP commit `4809597`, which only adds this report skeleton. · **Date:** 2026-11-16 · **Backend:** Supabase `guardscope-dev` (`eqozjuaaajstrewygqxr`), dev only

> Status: FINAL.

## Results

| Criterion | Result | Evidence |
|---|---|---|
| AC-1 Create from Additional only, one per request, pre-filled, no private notes | **PASS** | pgTAP tester C1–C13, dev 1–6. API `api-T01.jsonl`. UI `p4-proposals` T-01 (both viewports), `screenshots/*-T01-new-draft.png` |
| AC-2 Draft edit/save, all fields persist, field messages + summary, server rejects invalid data | **PASS** | pgTAP D1–D8 (18 field rules as superuser and owner). API `api-T02.jsonl` (16 REST rejections). UI T-02 (summary focused, 3 links, reload persists all 10 fields) |
| AC-3 Send sets pending + server time; rejects no impact / no description / mismatched pair / past deadline | **PASS** (see O-2) | pgTAP S1–S11. API `api-T03.jsonl`. UI T-03 (client validation plus confirmation) |
| AC-4 After send no role can change or delete content (API + DB guard, incl. owner via REST) | **PASS** | pgTAP I1–I4, T5, T8 (16 writes × 6 sent states = 96/96 blocked for superuser), T10. API `api-T04.jsonl` (10 PATCHes → `200 []`, DELETE 403, row unchanged). UI shows no edit controls on sent versions |
| AC-5 New version copies latest; sending supersedes pending; old content unchanged; ≤1 draft and ≤1 pending | **PASS** | pgTAP V1–V13 (incl. version_no swap and change_order_id move). UI T-05 (v1 card text identical before/after). Concurrency: 32 iterations, see below |
| AC-6 Cancel only pending; discard only drafts (v1 removes proposal); every other transition rejected, incl. forced status writes | **PASS** | pgTAP T2–T4 (42 from/to combinations: exactly 6 allowed, 36 `invalid_transition`), T11–T15, X1–X13, R1–R4, D5 (status write 42501). UI T-06 (cancel, discard vN, discard v1) |
| AC-7 History records every state change in order with version numbers | **PASS** (see O-1) | pgTAP H1–H9. API `api-T07.jsonl`. UI `e2e-T07.jsonl` (8 entries in order) |
| AC-8 No create/edit/send/cancel on completed or archived projects | **PASS** (see D-1) | pgTAP P1–P7 (all 5 RPCs + REST draft update, both states; reopen re-enables). API `api-T08.jsonl`. UI T-08 (no write controls; request page says "Reopen the project…") |
| AC-9 B can't read/create/edit/send/cancel/discard A's proposals; anon has no access | **PASS** | pgTAP G1–G12, B1–B8, N1–N2. API with real JWTs `api-T09.jsonl` (B: `200 []` / `400 not_found` on every call; anon: 401 on every table and RPC; `_lock_change_order` 403 for A and B). UI: foreign id shows the same "not found" page (`e2e-S6-notfound.jsonl`) |
| AC-10 Amounts with currency, labelled proposed; no paid/collected/earned | **PASS** | UI T-03/T-10: proposal page, client preview, project section ("Version 2 · Proposed: +GBP 650.00, +3 days") and request page all checked by regex for currency-less amounts and for paid/collected/earned/revenue/invoice. pgTAP H4 (event summaries) |
| AC-11 axe 0 serious/critical; keyboard operable; no horizontal overflow at 375 and 1280 | **PASS** (also passed inside the full regression run) | `p4-a11y.spec.ts`: 11 states × 2 viewports, 0 serious/critical, 0 overflow with 170-char unbroken text and a 9-digit amount. Keyboard flow from create to send to new version. `a11y-T11.jsonl`, `axe/`, `screenshots/*-T11-*` |
| AC-12 Phase 1–3 regression | **FAIL** (D-2) | pgTAP: 7 files, **327/327 PASS** (`pgtap-summary.txt`). Full E2E (`npm run test:e2e -- --trace off --workers=2`): **226 passed, 4 failed, 34 skipped** (`e2e-full-regression.log`). All 32 Phase 4 E2E runs passed. The 4 failures are analysed below: 1 caused by Phase 4 (D-2), 2 timing/isolation flakes that pass on rerun (`e2e-regression-isolated-rerun.log`). Unit tests 136/136 (`unit-lint.log`) |
| T-01 | **PASS** | as AC-1 |
| T-02 | **PASS** | as AC-2 |
| T-03 | **PASS** | as AC-3 |
| T-04 | **PASS** | as AC-4 |
| T-05 (incl. concurrency) | **PASS** | `api-T05-concurrency.jsonl`, `e2e-T05-concurrency.log`, `sql-concurrency-check.log` |
| T-06 | **PASS** | as AC-6 |
| T-07 | **PASS** | as AC-7 |
| T-08 | **PASS** (D-1 is a display defect, not a write) | as AC-8 |
| T-09 | **PASS** | as AC-9 |
| T-10 | **PASS** | as AC-10 |
| T-11 | **PASS** | as AC-11 |
| T-12 | **FAIL** (D-2) | as AC-12 |
| ISS-017 independent verification | **PASS** | `p4-iss017.spec.ts`, 8/8 on both viewports with no page errors. (a) The proposal editor saves and sends after a reload when the API returns price and time as JSON numbers; the precondition `typeof price_impact === 'number'` is asserted (integer 400/2, decimal 99.99/1.5). (b) The Phase 2 project edit form saves with an untouched agreed price (400 and 1500.5), and the value is unchanged in the DB. `e2e-ISS017.log`, `e2e-ISS017.jsonl` |

### Database tests
| File | Result |
|---|---|
| `change_orders.test.sql` (developer) | 39/39 |
| `change_orders_tester.test.sql` (**new**, this run) | 125/125 |
| `profiles_rls`, `profiles_rls_tester`, `projects_scope`, `projects_scope_tester`, `requests`, `requests_tester`, `event_ordering` | 12, 22, 32, 80, 32, 138, 11: **327/327** |

Method: `python3 -I scripts/pgtap-wrap.py <file>`, then Supabase `execute_sql`. Each run ends in ROLLBACK. One harness fix was needed while writing the tester file: a temp table needed `GRANT SELECT` to `authenticated`. No assertion was weakened.

Developer suite, critical review: it is correct but thin. Its deadline check covers only today−10. It has no transition matrix, does not test immutability column by column, does not cover archived projects, and checks only one B RPC. The tester suite covers these gaps.

### Concurrency (real JWTs, 6 parallel calls per race, fired with one `Promise.all` in the browser)
| Race | Run 1 (12 iterations) | Run 2 (20 iterations) |
|---|---|---|
| `create_change_order` on one request | ok 12, change_order_exists 60 | ok 20, change_order_exists 100 |
| `send_change_order_version` on one draft | ok 12, not_draft 60 | ok 20, not_draft 100 |
| `new_change_order_version` | ok 12, draft_exists 60 | ok 20, draft_exists 100 |
| send v2 ∥ cancel v1 | send ok in all 12; cancel won 3 (→ `1:cancelled,2:pending`), lost 9 (→ `1:superseded,2:pending`, cancel = not_pending) | send ok in all 20; cancel won 8, lost 12 |
| Max draft / pending per change order | 0 / 1 | 0 / 1 |
| History replay by `seq` vs stored statuses | 0 problems | 0 problems |

DB cross-check after all runs (`sql-concurrency-check.log`): 39 change orders and 74 versions. Max 1 draft and max 1 pending per change order. No version_no gaps, no duplicate requests, no duplicate `seq`, and for every version the latest event agrees with the stored status.

## Defects raised

### D-1 (LOW, UI): on a completed or archived project, the draft version is hidden, but the page header shows its title and status
- **Steps:**
  1. Create a proposal and send v1.
  2. Create a new version, v2, and give it the title "Draft two title".
  3. Set the project to completed (or archived).
  4. Open the proposal page.
- **Expected:** read-only proposals (spec §6, C-2). Everything on record is viewable, including the draft (read-only, labelled not sent), or at least the header doesn't describe content that isn't shown.
- **Actual:** the `<h1>` shows "Draft two title" with the badge "Draft (not sent)" and "2 versions". Only Version 1 is rendered, and the draft content is not visible anywhere (`ChangeOrderPage.tsx` renders the draft only when `draft && active`). A proposal that has only an unsent v1 shows just a heading and its history. Evidence: `screenshots/desktop-T08-completed.png`, `e2e-T08.jsonl`.
- **Impact:** a display issue only. No write is possible, and no data is lost or changed.

### D-2 (MEDIUM, regression in a Phase 3 suite and stale copy): the request page still says change orders are not available, and Phase 3 test T-09 now fails
- **Steps:**
  1. Open the page of a request classified Additional, on an active project.
- **Expected:** the decision text matches the release. Phase 4 adds "Create change proposal" in the panel right below, and AC-12 requires the Phase 1–3 suites to pass.
- **Actual:**
  - The decision explainer still says "It can become a change proposal **once change orders are available**." (Phase 3 copy). Directly below it, the new panel offers "Create change proposal". The user is told two contradictory things.
  - `tests/e2e/p3-classification.spec.ts:328` (T-09 / AC-9 "Additional shows the hint without a dead action") fails. It asserts the old hint text, no "change proposal" button, and no money words in `<main>`; the regex `price` matches the panel's "priced and/or timed proposal".
  - Mobile fails deterministically (full run and isolated rerun). Desktop failed in the full run and passed in isolation. The panel loads asynchronously, so a pass only means the check ran before the panel appeared.
  - Evidence: `e2e-full-regression.log` failures 2–3, `regression-failures/p3-classification-*`.
- **Needed:** update the Phase 3 explainer copy (developer). Then update this Phase 3 test to the Phase 4 behaviour: the hint wording, and allow the real Create action. That update needs an explicit Team Lead / HA decision. The tester did **not** edit or weaken a Phase 1–3 test. "priced" is not a money claim; the paid/collected/earned rule (AC-10) still passes.

### Regression failures not caused by Phase 4 (flakes, recorded for the Team Lead)
- **F-1 `p2-a11y.spec.ts:33` desktop, `confirm-dialog-error`:** 1 `color-contrast` (serious) violation on the "Yes, confirm" button. It failed in the full run and in the first isolated rerun, then passed 3/3 with `--repeat-each=3`. Probable cause: axe samples the button during its 150 ms `transition-colors` from the disabled/busy `bg-slate-400` back to `bg-brand-600`. Phase 4 did not touch this component (the diff of `src/components` is empty). This is a test-timing flake, but a real a11y risk only while the button is mid-transition. Evidence: `regression-failures/p2-desktop-confirm-dialog-error.axe.json`.
- **F-2 `settings-and-empty-states.spec.ts:135` mobile (T-16 "No projects yet"):** it needs user A to have zero projects while parallel workers are creating projects (an order-dependent precondition). It passed in the isolated rerun.

## Observations (not defects)
- **O-1 Version numbers are reused after a discard.** Discarding draft v3 and then creating a new version produces v3 again, so the history shows "Draft version 3 discarded" and then "Draft version 3 created…". Numbering stays sequential (BR-3) but can be ambiguous in the history. Consider never reusing numbers.
- **O-2 Deadline tolerance.** The server accepts `proposed_deadline = today−1` at send (a documented one-day time-zone tolerance in `send_change_order_version`; today−2 is rejected). The UI enforces the user's local today. This matches the Phase 3 `received_on` precedent (`db-probes.txt`).
- **O-3 Extra decimals are rounded, not rejected.** The DB silently rounds a third decimal place (10.005 → 10.01). The UI rejects more than 2 dp, but a direct REST write is accepted and rounded.
- **O-4** A superuser can change `id` and `created_by` on a sent version. These are not content columns, have no client grant and are not referenced by a foreign key, so BR-2 is still met.
- **O-5** Client preview with an empty title renders an empty `<h4>`. axe reports this as `empty-heading` (minor) only in the validation-error state.
- **O-6 Header status follows the latest version.** Per C-3, the header badge and the project list show the latest version, so while v2 is a draft the proposal reads "Draft (not sent)" even though v1 is still with the client. This is by design, but it may confuse users.
- **O-7 The guard bypass depends only on a session setting.** It is the `guardscope.account_deletion` GUC, which clients can't set through PostgREST. Even with the flag set, an authenticated session can't edit or delete sent versions (pgTAP I2, I3).
- **O-8 E2E hygiene.** The new specs archive every project they create. The test data was cleaned with the prescribed test-only SQL before the full regression.

## Security advisor
`docs/testing/phase4/supabase-advisors.log`: 8 × `authenticated_security_definer_function_executable` WARN, all on the intentional RPCs listed in `docs/security/ADVISOR_NOTES.md`. `_lock_change_order` is not flagged. 1 × `auth_leaked_password_protection` WARN (accepted, ISS-008). No ERROR-level lints and no new findings that haven't been accepted.

## Exceptions requested (needs HA-ID)
None.

## Decision
**NOT ACCEPTED: return to development for one targeted fix round.**

All Phase 4 functional, security, concurrency and accessibility criteria (AC-1 to AC-11) pass. ISS-017 is independently verified as fixed. The database layer is strong: 125/125 tester pgTAP, the full transition and immutability matrices, and 32 race iterations with no inconsistency.

Acceptance is blocked by AC-12 (D-2): a Phase 3 suite fails and the Additional-request page shows contradictory copy. Required before re-test:
1. Fix the D-2 copy.
2. Get an approved update of `p3-classification.spec.ts` T-09 to the Phase 4 behaviour.
3. Recommended: fix D-1 (read-only display of the draft on closed projects).
4. Recommended: stabilise F-1 and F-2.

The retest will re-run AC-12 and the D-1/D-2 checks.

## Test data and evidence hygiene
- The full regression overwrote Phase 1–3 evidence files (screenshots, axe JSON, jsonl). They were restored from git with `git checkout -- docs/testing/phase1 docs/testing/phase2 docs/testing/phase3`. Copies of the failing artifacts are kept in `docs/testing/phase4/regression-failures/`.
- Final cleanup used the prescribed test-only SQL (`docs/testing/phase4/sql-cleanup.log`): a@ and b@ have 0 projects and null profile fields. The DB holds 0 projects, requests, change orders, versions and events. No users were deleted, and the signup/recover endpoints were not used.
- New test files: `tests/db/change_orders_tester.test.sql`, `tests/e2e/p4-helpers.ts`, `p4-api.spec.ts`, `p4-concurrency.spec.ts`, `p4-proposals.spec.ts`, `p4-iss017.spec.ts`, `p4-a11y.spec.ts` (eslint and prettier clean). `src/` and `supabase/` were not modified. Nothing was committed.

---

## Retest 1 (commit dde2091)

> Status: **CHUNKS A and B DONE.** Product code under test is now **`c43b082`** (D-3 / ISS-021 fix). Regression run #2 and the final acceptance decision: **PENDING (chunk C)**.

**Tester run mode:** separate general-purpose subagent (Tester Specialist), resumed after several container restarts; the retest is split into chunks, and the Team Lead commits after each. · **Commit tested:** product code `dde2091` (`feature/p4-change-orders`); the working tree is on WIP commit `0202607`, which holds only tester files. Product diff vs `0bc06fe`: `src/lib/domain/request.ts` (copy), `src/lib/domain/changeOrder.ts` (`headerVersion`, `versionCountLabel`), `src/features/changes/ChangeOrderPage.tsx`, two unit-test files. No `supabase/` change. · **Dates:** 2026-11-16 to 2026-11-17 · **Backend:** Supabase `guardscope-dev` (`eqozjuaaajstrewygqxr`).

### Results (chunk A)
| Item | Result | Evidence (`docs/testing/phase4/`) |
|---|---|---|
| `npm run check` | **PASS**: format, lint, typecheck, **141/141 unit tests** (13 files: 136 before + 5 new), build, secrets check | `retest1-check.log` (rerun 2026-11-17) |
| pgTAP, 9 files | **491/491 PASS**: profiles_rls 12, profiles_rls_tester 22, event_ordering 11, projects_scope 32, requests 32, projects_scope_tester 80, requests_tester 138, change_orders (dev) 39, change_orders_tester 125 | `retest1-pgtap-summary.txt` |
| D-2 / ISS-018 explainer copy | **FIXED**, see verdict below | `e2e-retest1-D1-D2.log`, `retest1-D2.jsonl` |
| D-1 / ISS-019 closed-project header | **FIXED** on the proposal page, but the same issue remains on two other pages (new **D-3**) | `e2e-retest1-D1-D2.log`, `retest1-D1.jsonl`, `screenshots/*-retest1-D1*` |
| Updated Phase 3 T-09 (`p3-classification.spec.ts`) | **PASS** at 375 and 1280 | `e2e-retest1-D1-D2.log` |
| axe + overflow on affected pages, 375 and 1280 | **PASS**: 60 scans in total, 0 violations of any impact and 0 horizontal overflow. Pages: the proposal page (closed project, sent + hidden draft, and draft only), the project page and request page on completed/archived projects, and the request page on active/completed projects | `retest1-a11y.jsonl`, `axe/*-retest1-*.json` |
| Security advisor | **PASS**: no new findings. 8 × `authenticated_security_definer_function_executable` WARN, all on RPCs listed in `docs/security/ADVISOR_NOTES.md`; 1 × leaked-password WARN (ISS-008); 0 ERROR | `retest1-supabase-advisors.log` |
| AC-1 to AC-11, T-01 to T-11 | Unchanged from the first run: all PASS. The fix touched only display code; the pgTAP suites still pass. In the partial regression run 1 (below), every Phase 4 spec passed on both viewports except one §6 test on mobile, which timed out | full regression: **PENDING (chunk B/C)** |
| AC-12 / T-12 Phase 1–4 regression | Run #1 on `c43b082` (chunk B): **236 passed, 0 failed, 34 skipped** (10.8 min). Run #2: **PENDING (chunk C)** | `e2e-run-retest1.log` |
| ISS-020 flake stabilisation (full-suite proof, two runs) | Run #1: both formerly flaky tests passed in the full suite (P2 T-11 axe on desktop and mobile; T-16 empty states, all 4). Run #2: **PENDING (chunk C)** | `e2e-run-retest1.log`, `retest1-iss020-probe.jsonl` |

### D-2 / ISS-018 verdict: FIXED
- `classificationExplainer.additional` now reads "You marked this as outside the agreement. You can turn it into a change proposal for your client." No "available / coming soon / next release" wording is left in `src/`. A new unit test guards this.
- UI on an active project: the decision region shows the new copy; the panel below offers a working "Create change proposal" action. T-09 clicks it, lands on `/projects/{id}/changes/{uuid}`, sees the h1 "Additional one", and finds exactly 1 change order via REST.
- UI on a completed project: the same explainer, with the panel saying "Reopen the project to create a change proposal." (see O-10).

### D-1 / ISS-019 verdict: FIXED on the proposal page
Verified on **completed and archived** projects at both viewports (`p4-retest1.spec.ts`):
- **(a) Sent versions plus a hidden draft** (v1 superseded, v2 pending, v3 draft "Hidden draft three title"):
  - The h1 and the document title are "Sent two title".
  - The header shows "Change proposal · 2 sent versions" and the badge "Sent, waiting for the client". "Draft (not sent)", "3 versions" and the draft title appear nowhere in `<main>`.
  - The cards for Version 2 and Version 1 are shown; Version 3 is not.
  - The page is read-only: there are no textboxes and no send/save/new/cancel/discard buttons.
  - Active baseline (unchanged): the header shows the draft, "3 versions".
  - The data is unchanged.
- **(b) Never-sent draft only:** the h1 and document title are the draft title, the header shows "Change proposal · Draft only, not sent" and the badge "Draft (not sent)", the read-only notice is shown, and there is no "Sent versions" section and no write control. This matches the developer's description.

### New defects
**D-3 (LOW, UI, same family as D-1): on a completed/archived project, the project page's proposal list and the request page panel still describe the hidden draft.**
- **Steps:** as in D-1 (a). Then open the project page (Change proposals section) and the request page.
- **Actual:**
  - The project list item reads "Hidden draft three title · Version 3 · Proposed: +EUR 400.00, +3 days · Draft (not sent)".
  - The request panel badge says "Draft (not sent)".
  - Both link to a proposal page whose header now says "Sent two title · Sent, waiting for the client · 2 sent versions". The draft's title and proposed amounts are shown on the project page, but its content cannot be viewed anywhere. A sent pending proposal is labelled as an unsent draft.
- **Cause:** `ChangeProposalsSection.tsx` uses `latestVersion(co)`. `findChangeOrderForRequest` returns the status of the newest version. Neither uses `headerVersion`.
- **Expected:** the closed-project views agree with the proposal page (C-2 read-only; the D-1 reasoning).
- **Evidence:** `retest1-D1.jsonl` (both viewports and both states), `screenshots/*-retest1-D1a-*-project.png` and `*-request.png`.
- **Impact:** display only. No write is possible and no data is lost.

### Observations (new)
- **O-9:** in case (b), the header names a draft whose content is not rendered on a closed project (only its title is shown). It is labelled "Draft (not sent)" with the read-only notice, which is acceptable under the developer's stated design.
- **O-10:** the Additional explainer says "You can turn it into a change proposal" even when (i) the project is closed (the panel then says to reopen it first) or (ii) a proposal already exists (the panel then shows "Open the change proposal"). The panel text right below resolves both cases, so the page is not contradictory.

### Test changes made in this retest (authorised by the Team Lead under HA-007 unless noted)
1. **`tests/e2e/p3-classification.spec.ts` T-09** (ISS-018). The intent is kept: truthful guidance and no dead action. Changes:
   - It now asserts the new explainer and the absence of any "unavailable / coming later" wording.
   - It waits for the async panel, which removes the earlier race.
   - It asserts exactly one change-proposal button, enabled, and no change-proposal link. It then **clicks it** and checks the navigation and the created row.
   - The money regex is unchanged and still applies to all of `<main>`, except the panel's fixed sentence "Turn this request into a priced and/or timed proposal…". That sentence is checked separately against the same regex with only the word "priced" removed.
2. **`tests/e2e/p2-a11y.spec.ts`** (ISS-020 F-1).
   - Before every axe scan, it waits for all finite CSS animations and transitions (`document.getAnimations()`) to finish, and it asserts that "Yes, confirm" is no longer `aria-busy` before the error-state scan. The axe tags and rules are unchanged.
   - `emulateMedia({ reducedMotion })` would not help, because the Button's `transition-colors` is not gated by `motion-reduce`.
   - **Evidence** (`retest1-iss020-probe.jsonl`, 8 repeats): at the old scan point, the button background was mid-fade (`oklab(…)`, 1 running transition) in **4/8** repeats. After the settle step it was the final brand-600 `rgb(31,111,104)` in **8/8**. This is a test-timing flake, not a product defect: the settled colour passes contrast.
3. **`tests/e2e/settings-and-empty-states.spec.ts` T-16** (ISS-020 F-2).
   - Root cause: a check-then-act race. The old poll saw 0 active projects, then another worker created one before the page rendered.
   - The precondition is now checked before **and after** the page loads, and the page is reloaded only when another test's project appeared in that window.
   - If the page lists a project that existed before the check, the test fails, because that would be a product defect rather than a race. The empty-state assertions are unchanged.
4. **`tests/e2e/p4-proposals.spec.ts` §6 UI test** (my own Phase 4 test, not a Phase 1–3 test): `test.setTimeout(90_000)`. It takes about 15 s unloaded (6/6 isolated passes, `e2e-retest1-S6-isolated.log`) and hit the 30 s default under full-suite load in run 1 (F-3 below). It is a timing change only; the assertions are unchanged.
5. **New `tests/e2e/p4-retest1.spec.ts`**: D-1 (a), D-1 (b), D-2 and axe/overflow, on both viewports.

### Chunk B (product commit c43b082)
**Fix reviewed** (`git diff 2210f9d c43b082`):
- `ChangeProposalsSection` now uses `headerVersion(co, projectActive)`, and `ProjectDetailPage` passes `project.status === 'active'`.
- `findChangeOrderForRequest` returns the version list sorted ascending, and `RequestProposalPanel` shows `headerStatus(versions, projectActive)`. Both helpers share the logic of the proposal page header.
- Four new unit tests. No `supabase/` change.

**D-3 / ISS-021 verdict: FIXED.** I extended `p4-retest1.spec.ts` with `expectRelatedPagesMatch`, which checks the project-page list item (title, "Version N ·", badge) and the request-page panel badge against what the proposal page header shows, and checks that no hidden-draft text appears. Result: 6/6 at 375 and 1280 (`e2e-retest1-D3.log`, `retest1-D3.jsonl`). Per case:
- **(a) sent + hidden draft, completed and archived:** the list shows "Sent two title · Version 2 · Sent, waiting for the client" and the panel shows "Sent, waiting for the client". "Hidden draft three title", "Draft (not sent)" and "Version 3" are absent. This matches the header.
- **(a) active (regression):** the list shows "Hidden draft three title · Version 3 · Draft (not sent)" and the panel shows "Draft (not sent)". This matches the active header.
- **(b) never-sent draft, active, completed and archived:** the list shows "Never sent title · Version 1 · Draft (not sent)" and the panel shows "Draft (not sent)". This matches the header.
- **axe:** 24 new D-3 scans (project and request pages, all cases, both viewports) plus the D-1/D-2 scans, with 0 violations of any impact and 0 overflow (`retest1-a11y.jsonl`, `axe/*-retest1-D3-*`). The older `screenshots/*-retest1-D1a-*-{project,request}.png` from chunk A are kept as the "before" evidence for D-3.

**`npm run check` on c43b082:** exit 0, **145/145 unit tests** (13 files), build and secrets check pass (`retest1-check.log`).

**Full regression run #1** (`npm run test:e2e -- --trace off --workers=2`, on a cleaned DB): **236 passed, 0 failed, 34 skipped** (`e2e-run-retest1.log`; this overwrites the partial run-1 log from before the restarts, which is kept in commit `0202607`).
- The 34 skips are the suites' own `test.skip` conditions (mutating tests that run on desktop only), the same count as the first run.
- **ISS-020 tests in the full suite:**
  - `p2-a11y.spec.ts:33` T-11 passed on desktop (49.0 s) and mobile (44.5 s).
  - `settings-and-empty-states.spec.ts:135` T-16 passed for `/` and `/projects` on both viewports.
- Updated T-09 passed on both viewports.
- The §6 UI test (F-3) passed on desktop in 24.9 s and on mobile in 15.1 s. 24.9 s is close to the old 30 s budget, which supports the timing diagnosis.

### Partial regression run 1 (before the restarts; for the record, not the acceptance run)
`e2e-run-retest1.log`, with changes 1–3 in place: **235 passed, 1 failed, 34 skipped** (10.9 min).
- The previous failures (T-09 on both viewports, F-1 P2 a11y desktop, F-2 T-16 mobile) all **passed**.
- The single failure was **F-3**: `p4-proposals.spec.ts` §6 UI on mobile, a test timeout of 30 s. A pgTAP file ran against the same DB in parallel during this run (my error, since corrected), which may have added load. This led to change 4.
- The full two-run regression is chunk B/C.

### Hygiene (chunk B)
- After run #1, the Phase 1–3 evidence (176 files rewritten by the run) was restored again from `dde2091`; `git diff --stat dde2091 -- docs/testing/phase{1,2,3}` is empty.
- The first-run Phase 4 evidence that the P4 specs regenerated during the regression (80 tracked files such as `api-T0*.jsonl`, `e2e-T0*.jsonl`, `axe/*-T11-*`, `screenshots/*-T0*`) was restored from `HEAD`, so the earlier sections of this report keep their evidence. Only `retest1*` files and `e2e-run-retest1.log` are new or changed.
- The DB was cleaned with the prescribed test-only SQL. Only a@ and b@guardscope.test remain, with 0 projects, requests, change orders and versions, and null profile fields.

### Hygiene (chunk A)
- Phase 1–3 evidence restored with `git checkout dde2091 -- docs/testing/phase1 docs/testing/phase2 docs/testing/phase3`, at the start of chunk A (178 files overwritten by the interrupted regression run) and again after the targeted run (4 Phase 3 screenshots `{desktop,mobile}-T09-{included,additional}.png` rewritten by T-09). `git diff --stat dde2091 -- docs/testing/phase{1,2,3}` is empty.
- The DB was cleaned with the prescribed test-only SQL. Only a@ and b@guardscope.test remain, with 0 projects, requests, change orders and versions, and null profile fields.
- `src/` and `supabase/` were not modified. Nothing was committed.
