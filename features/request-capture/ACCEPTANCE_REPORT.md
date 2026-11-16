# Phase 3 — Request Capture & Classification — Acceptance Report

**Tester run mode:** separate general-purpose subagent, fresh context. I tested against FEATURE_SPEC, TEST_PLAN and MASTER_PRD, not against developer claims. The run was interrupted by a usage limit and resumed in the same subagent context. The Team Lead committed the partial files unchanged as WIP `155b465`.
**Commit tested:** `6184f91` (branch `feature/p3-request-capture`). `155b465` adds only Tester files on top of it. `src/` and `supabase/` were not modified, and the Tester committed nothing.
**Backend:** Supabase `guardscope-dev` (`eqozjuaaajstrewygqxr`). I verified the deployed functions and policies against the migration file: identical bodies and policies.
**Date:** 2026-11-16 · **Evidence:** `docs/testing/phase3/`
**Status:** COMPLETE. **Not accepted** (D-1 Medium, D-2 High).

## How it was run
| What | Command / method | Result | Evidence |
|---|---|---|---|
| Format, lint, typecheck, unit | `npm run format:check`, `lint`, `typecheck`, `npm test` | all exit 0; unit 110/110 | `check-lint-typecheck-unit.log` |
| Developer pgTAP | `python3 -I scripts/pgtap-wrap.py tests/db/requests.test.sql` → `execute_sql` (ROLLBACK) | 32/32 | `pgtap-requests.tap` |
| Tester pgTAP (new) | same, `tests/db/requests_tester.test.sql` | **123/123** | `pgtap-requests_tester.tap` |
| Phase 1+2 pgTAP regression | same for `profiles_rls`, `profiles_rls_tester`, `projects_scope`, `projects_scope_tester` | 12/12, 22/22, 32/32, 80/80 | `pgtap-regression-phase1-2.tap` |
| Full E2E (Phase 1 + 2 + 3) | `set -a && . ./.env.test.local && set +a && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e -- --trace off --workers=2 --reporter=list` on clean data | **195 passed, 2 failed (both D-1), 25 skipped** | `e2e-full-regression.log` |
| Concurrency repeats | `npx playwright test tests/e2e/p3-classification.spec.ts -g concurrent --project=desktop --repeat-each=N --workers=1` | D-2 reproduced in 4/10 and 3/5 runs | `e2e-p3-concurrency-repeat10.log`, `…-repeat5.log`, `api-T03-concurrency-repeat10.jsonl`, `sql-D2-concurrency-history.log` |
| axe at 375 and 1280 | `@axe-core/playwright` (wcag2a/aa, 21a/aa, 22aa, best-practice); 12 pages/states × 2 widths | **0 violations of any impact** in all 24 scans; no overflow | `axe/*.json`, `a11y-T10.jsonl`, `screenshots/*-T10-*.png` |
| Security advisor | `get_advisors(security)` | no new findings | `supabase-advisors.log` |

**Earlier attempts (nothing hidden):**
- `e2e-p3-attempt1.log` had 8 failures:
  - D-1 (product).
  - The concurrency order (D-2, product).
  - Three of my own test bugs. The list was read before it loaded. Chromium's date input has several tab stops. The PostgreSQL literal `'yesterday'` is a valid date, so it is now logged as O-2 and replaced by `2026-02-30`.
- `e2e-p3-attempt2.log`: only D-1 failed.

No assertion was weakened. The concurrency test now hard-asserts history integrity (the transitions form one path from `unclassified` to the stored value) and soft-asserts history order (D-2).

**Skips (25, all deliberate):**
- The same Phase 1 and Phase 2 mobile skips as at Phase 2 retest 1.
- The Phase 3 API-only tests on mobile.
- `p3-d2-evidence.spec.ts` × 2: needs env ids, run separately (`e2e-D2-evidence.log`).
- `p2-account-deletion` × 2: needs a throwaway account; signup is avoided because of rate limits. Account deletion with Phase 3 data is covered by pgTAP dev #32 and P2 tester D4–D6.

**Phase 1/2 evidence:** the full run overwrote files under `docs/testing/phase1/` and `docs/testing/phase2/`. I restored them from git with `git checkout -- docs/testing/phase1 docs/testing/phase2`.

## Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| AC-1 create title-only / all fields, persists, listed | **PASS** | T-01 (both widths): the date defaults to the browser's today, the DB rows match exactly after reload (`e2e-T01.jsonl`), list order and filters work (`*-T01-*.png`), and edit persists; pgTAP dev 1–3, tester V8/V12 |
| AC-2 validation UI + server | **PASS** | UI: field errors and a focused summary for each of missing title, 201 chars, future date, empty date, 5001-char details and notes, and an injected channel; 0 POSTs sent (`*-T02-*.png`). API: 13 invalid payloads rejected (`api-T02.jsonl`); tester pgTAP V1–V17. See O-1 and O-2 |
| AC-3 classify → label + history (from → to, time); same value no entry; history immutable | **FAIL** | Label, single entry per change, the no-op on the same value (no RPC sent, no event) and API immutability all pass (`api-T03-T04.jsonl`, pgTAP C1–C19, X5). **D-1:** the entry does not show "from". **D-2:** under concurrent changes the history order and the latest entry are wrong |
| AC-4 direct classification write / any events write rejected | **PASS** | PATCH `classification` (alone or with title), INSERT/PATCH/DELETE `activity_events` → 401/403 (`api-T03-T04.jsonl`); pgTAP dev 7, 13–15, tester G4, G6, E1–E3, V14 |
| AC-5 private label; notes only on the request row | **PASS** (O-3) | The label appears on the form and on the detail page. Notes are absent from the project page, the list (all filters), the history, events and projects (`*-T05-private-notes.png`) |
| AC-6 revision usage | **PASS** | Covers no scope (UI and API 403); allowance 2 → 1, then 0, then "0 (3 used of 2)", with no negatives; undo; none / not specified show no remaining figure; allowance from the latest confirmed version, not the draft; request-page record linked to the request (`api-T06.jsonl`, `*-T06-*.png`); pgTAP U1–U12, R9–R13 |
| AC-7 archived project: read-only in UI and server | **PASS** | No form, Edit, Record or Undo; classify buttons disabled; the info alert is shown (`*-T07-*.png`). API create 403, edit `[]`, classify `project_archived`, record 403, undo `[]`; data unchanged (`api-T07.jsonl`); pgTAP R0–R13 |
| AC-8 B / anon isolation | **PASS** | For B: reads return `[]`; create 403; edit, move and undo have no effect; classify returns `not_found` for A's request and for a random id; forged event 403. Anon gets 401 on every endpoint (`api-T08.jsonl`). pgTAP B1–B14, R7b (no "archived" oracle), N1–N7. §6: random, malformed, foreign and wrong-project ids show an identical "Request not found" page (`*-S6-*.png`) |
| AC-9 no money for Included; Additional hint, no dead action | **PASS** | Request pages, the requests list and the revisions panel contain no currency, amounts or "revenue/paid/value". Additional shows "…can become a change proposal once change orders are available." with no change-order button or link. The wording says "You marked this as …" and nothing legal (`*-T09-*.png`); pgTAP G17, C18 |
| AC-10 axe, keyboard, no overflow at 375/1280 | **PASS** | 0 violations in 24 scans, including 200- and 5000-char unbroken text and 500-char usage notes. Keyboard: capture with Enter (focus returns to the title), expand details, open a request, classify with Space; visible 3 px focus outline (`a11y-T10.jsonl`) |
| AC-11 Phase 1 + 2 regression | **PASS** | Every Phase 1 and Phase 2 E2E test executed in the full run passed; pgTAP 12/22/32/80 |

## Test scenarios
| ID | Result | Evidence |
|---|---|---|
| T-01 | PASS | see AC-1 |
| T-02 | PASS | see AC-2 |
| T-03 | **FAIL** (D-1, D-2) | `p3-classification.spec.ts` T-03 UI ×2 fail on the soft "from" assertion; concurrency soft-order failures in the repeat logs |
| T-04 | PASS | see AC-4 |
| T-05 | PASS (O-3) | see AC-5 |
| T-06 | PASS | see AC-6 (incl. BR-4 foreign or random request link → 403) |
| T-07 | PASS | see AC-7 |
| T-08 | PASS | see AC-8 |
| T-09 | PASS | see AC-9 |
| T-10 | PASS | see AC-10 |
| T-11 | PASS | see AC-11 |

## Defects raised
**D-1 — The request history does not show what the classification changed *from* (AC-3, REQ-003). Suggested severity: Medium.**
Steps:
1. Open a project with a confirmed scope and log a request "Classify me".
2. Open the request and click Included, then Needs clarification, then Additional, then Included.
3. Read the History section.

Expected (AC-3 "appends a history entry (from → to, time)"; REQ-003 "from → to … shown in the request's history"): each entry names both values, e.g. "Changed from Included to Needs clarification".
Actual: each entry reads only `Marked "Classify me" as Needs clarification` plus a time. The database stores the correct `{"from","to"}` in `activity_events.metadata` (verified), but `RequestDetailPage` renders `ev.summary` only.
Evidence: `e2e-full-regression.log` (T-03 ×2), `p3-runs-attempt2/e2e-T03.jsonl`, `screenshots/*-T03-history.png`. Test: `tests/e2e/p3-classification.spec.ts` "each option updates the label…".

**D-2 — Concurrent classification produces a history whose order and latest entry contradict the stored classification (REQ-003, HIST-003, BR-3). Suggested severity: HIGH (data integrity of the audit trail).**
Steps:
1. As the owner, send 12 `POST /rest/v1/rpc/classify_request` calls for one request in parallel, cycling `additional`, `needs_clarification`, `included` (test "concurrent classification…").
2. Read `activity_events` ordered by `created_at` (as the API and UI do), and open the request page.

Reproduced in 4 of 10 runs (`e2e-p3-concurrency-repeat10.log`) and 3 of 5 runs (`…-repeat5.log`). The full-suite runs reproduced it in 1 of 3.

Example (`sql-D2-concurrency-history.log`, request `a1c1dd52-…`):
- The stored classification is **Included**.
- The history ends `… needs_clarification → included (18:01:50.244621)`, `additional → included (.247318)`, `included → needs_clarification (.24935)`.
- Entry 8 starts from a value the previous entry did not end on.
- The newest entry says **Needs clarification**.
- The UI shows the badge "Included" next to a history whose last line is "Marked "Race" as Needs clarification", with two consecutive "as Included" lines (`screenshots/desktop-D2-history-vs-badge.png`, `e2e-D2-evidence.log`).

Expected: the history lists the changes in the order they were applied, each "from" equals the previous "to", and the latest entry equals the current classification. Server timestamps reflect when the change happened.
Cause: `activity_events.created_at` defaults to `now()`, which is the **transaction start time**. `classify_request` serialises on `SELECT … FOR UPDATE`, so a transaction that started earlier can apply its change later. Ordered by `xmin` (4691, 4693, 4694, 4695), the same rows form a consistent chain ending at Included.

What is not affected:
- Each row's from/to is individually true. The set of transitions always forms a valid path from `unclassified` to the stored value (hard assertion, all runs).
- No event is lost or duplicated, and same-value calls never add events (10 parallel → 1 event).

Realistic trigger: two tabs or devices, or a retried request, classifying within the same moment. I did not reproduce it by clicking in the UI; the UI disables the buttons while one call is busy in a single tab.

Suggested fix: inside `classify_request`, after acquiring the lock, insert the event with `created_at = clock_timestamp()`, or add a monotonic sequence column used for ordering. Apply the same to `revision_usages_event` and `requests_after_insert_event`. Add a pgTAP/E2E check.

## Observations (no defect raised)
- **O-1:** The server accepts `received_on` = today + 1 (time-zone tolerance, a migration comment). The UI blocks any future date. BR-5 says "can't be in the future". This should be accepted in the spec or tightened. +2 is rejected (pgTAP V1–V3).
- **O-2:** PostgREST accepts PostgreSQL date literals (`'yesterday'` → 2026-11-15; `'tomorrow'` would fall within the +1 tolerance). Harmless, because the result is still checked.
- **O-3:** The owner's list query (`listRequests`) selects `internal_notes` although the list never renders it. It is the owner's own data, so there is no leak, but Phase 5 must use its own column list (ARCHITECTURE §4.1).
- **O-4:** A request cannot be returned to "Unclassified" (`invalid_classification`). This is consistent with DEC-007 ("initial") and the UI offers no such option.
- **O-5:** The C-3 text is "Confirm the scope to start tracking revisions against your allowance." rather than "Confirm the scope to track revisions". The meaning is the same.
- **O-6:** Edits to a request's title, date or notes are not logged, and older history entries keep the old title. The spec requires logging only for creation and classification.
- **O-7:** A project with history or a confirmed scope cannot be deleted outside account deletion, even by a superuser (pgTAP X12). Clients have no project DELETE anyway.
- **Developer pgTAP review:** 32/32 pass. Gaps that the tester suite now covers:
  - archived usage undo;
  - B deleting or updating A's rows;
  - the grant matrix for all three tables and the RPC;
  - anon on events, usages and the RPC;
  - moving a request via `project_id`;
  - the date tolerance;
  - metadata and summary limits;
  - the full classification chain;
  - the archived-foreign `not_found` oracle.

  The developer suite has no concurrency check (see D-2).

## Security advisor
- `authenticated_security_definer_function_executable` for `classify_request`, `confirm_scope` and `delete_my_account`.
- `auth_leaked_password_protection`.

Both are dispositioned in `docs/security/ADVISOR_NOTES.md` (classify_request listed for Phase 3), so there are **no new findings** (`supabase-advisors.log`). The pgTAP checks confirm that `classify_request` pins `search_path=''`, has no anon/PUBLIC execute, and checks ownership.

## Cleanup
- As superuser, using the test-only bypass, I deleted every project of a@ and b@ (`sql-cleanup.log`).
- Final state:
  - only `a@guardscope.test` and `b@guardscope.test` exist;
  - projects, versions, items, requests, events and usages are all 0;
  - both profiles have null fields.
- The pgTAP users were rolled back.
- Passwords came only from `.env.test.local` via the environment and were never written anywhere.

## Files added or changed by the Tester
- `tests/db/requests_tester.test.sql`
- `tests/e2e/p3-helpers.ts`
- `tests/e2e/p3-requests.spec.ts`
- `tests/e2e/p3-classification.spec.ts`
- `tests/e2e/p3-revisions.spec.ts`
- `tests/e2e/p3-a11y.spec.ts`
- `tests/e2e/p3-d2-evidence.spec.ts`
- `docs/testing/phase3/**`
- this report

## Exceptions requested (needs HA-ID)
None. O-1 needs a spec-owner decision on the +1 day tolerance.

## Decision
**Not accepted at `6184f91`.** Fix D-2 (High: ordering of the audit trail) and D-1 (Medium: show from → to), then retest. Every other criterion passes: AC-1, 2, 4–11, and the security and isolation layers (123 tester pgTAP checks). O-1 and O-3 need a spec-owner decision or a small follow-up.

---

# Retest 1 (commit 18b3482)

**Tester run mode:** separate subagent, fresh context. I verified the Debug Specialist's claims independently against FEATURE_SPEC (BR-5 as reworded per DEC-011), not against the fix notes.
**Commit tested:** `18b3482` (branch `feature/p3-request-capture`). The Tester did not modify `src/` or `supabase/` and committed nothing.
**Backend:** Supabase `guardscope-dev` (`eqozjuaaajstrewygqxr`). The applied migration `event_ordering` (stored version `20261116181650`) has statements byte-identical to `supabase/migrations/20261116170000_event_ordering.sql`.
**Date:** 2026-11-16 · **Evidence:** `docs/testing/phase3/` (files named `*retest1*` unless stated)

## How it was run
| What | Command / method | Result | Evidence |
|---|---|---|---|
| Format, lint, typecheck, unit, build, secrets | `npm run check` | exit 0; unit **120/120** (12 files); `check:secrets` clean | console (re-runnable) |
| pgTAP, all 7 files | `python3 -I scripts/pgtap-wrap.py <file>` → `execute_sql` (ROLLBACK) | event_ordering **11/11**, profiles_rls **12/12**, profiles_rls_tester **22/22**, projects_scope **32/32**, projects_scope_tester **80/80**, requests **32/32**, requests_tester **138/138** (123 + 15 new) → **327/327** | `pgtap-retest1.tap` |
| Live schema of `activity_events` | catalog queries + new pgTAP O1–O15 | see "Schema" below | `schema-activity_events-retest1.log` |
| D-2 concurrency, isolated | `npx playwright test tests/e2e/p3-classification.spec.ts -g concurrent --project=desktop --repeat-each=25 --workers=1` | **25/25 passed** | `e2e-p3-concurrency-retest1-repeat25.log`, `api-T03-concurrency-retest1.jsonl` |
| D-2 DB check after the runs | SQL per request ordered by `seq` | 26/26 requests consistent (see D-2) | `sql-D2-retest1-verification.log` |
| Full E2E (Phase 1 + 2 + 3) on clean data | `set -a && . ./.env.test.local && set +a && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e -- --trace off --workers=2 --reporter=list` | **197 passed, 0 failed, 25 skipped** (8.6 min) | `e2e-run-retest1.log` |
| O-a network check | `npx playwright test tests/e2e/p3-retest1.spec.ts` (new) | 1 passed (desktop), 1 skipped (mobile, same network shape) | `e2e-retest1-Oa.log`, `e2e-retest1-Oa.jsonl` |
| axe at 375 and 1280 incl. a 5-entry from → to history | `p3-a11y.spec.ts` (new state `request-history-from-to`) | **0 violations of any impact** in all 26 scans (13 states × 2 widths); no overflow | `axe/*.json`, `a11y-T10.jsonl`, `screenshots/*-T10-request-history-from-to.png` |
| Security advisor | `get_advisors(security)` | no new findings | `supabase-advisors-retest1.log` |

**Skips (25):** identical to the first run (same Phase 1/2 mobile skips, Phase 3 API-only tests on mobile, `p3-d2-evidence` ×2 needs env ids, `p2-account-deletion` ×2 needs a throwaway account). No new skip.
**Passwords** came only from `.env.test.local` via the environment; I grepped `docs/testing/`, `tests/` and `features/` for both values: 0 hits.
**Phase 1/2 evidence:** the full run overwrote files under `docs/testing/phase1/` and `docs/testing/phase2/`; I restored them with `git checkout -- docs/testing/phase1 docs/testing/phase2`. Phase 3 evidence files from the first run (axe JSON, T-03/T-10 screenshots, appended JSONL) were refreshed by this run; the originals remain at `c102946`.

### Test changes (strengthened only; nothing weakened)
- `tests/e2e/p3-classification.spec.ts`
  - T-03 UI: the D-1 "from" check is now a **hard** assertion. New: for each classification entry, the text a screen reader gets (aria-hidden removed) must contain `Changed from <from> to <to>` and must not contain "→", and the arrow must be `aria-hidden`.
  - Concurrency: the order checks are now **hard** (each from = previous to, first from = unclassified, last to = stored value). New hard checks: `seq` strictly increasing; `created_at` non-decreasing in `seq` order (microsecond precision); unique ids; exactly one `request.created`, and it comes first. New UI check: the request page shows the stored value as the badge and the last history entry ends "to <stored value>".
- `tests/e2e/p3-helpers.ts`: `apiEvents` now reads in the app's order (`order=seq`) and returns `seq`.
- `tests/e2e/p3-a11y.spec.ts`: the 200-char-title request now has 4 transitions; new axe/overflow state `request-history-from-to` with the history visible.
- `tests/e2e/p3-retest1.spec.ts` (new): O-a. It checks that list queries on the project and request pages never select `internal_notes` and never return the note text, that the detail query still loads notes, and that the history query orders by `seq.asc`.
- `tests/db/requests_tester.test.sql`: plan 123 → 138, new section O1–O15 (below).

## Schema of `activity_events` (live)
| Check | Result | pgTAP |
|---|---|---|
| `seq` bigint NOT NULL GENERATED ALWAYS AS IDENTITY | yes (`attidentity='a'`) | O1, event_ordering #2 |
| `seq` unique | `activity_events_seq_key` unique index on `seq` alone; 0 duplicates | O2, O11 |
| Explicit `seq` on INSERT/UPDATE, even as owner/superuser | rejected `428C9` | event_ordering #11, O9 |
| `seq` client-writable | no (authenticated: SELECT only; anon: nothing) | event_ordering #3, O10, G4 |
| `created_at` default | `clock_timestamp()` | O3, event_ordering #1 |
| Guard trigger enabled after the backfill | `activity_events_guard` `tgenabled='O'`, BEFORE UPDATE and DELETE | O4, O5 |
| Guard still blocks (superuser) | UPDATE summary, `SET seq = DEFAULT`, back-dating `created_at` → `P0001 activity_event_immutable`; DELETE → `P0001` | O6–O8, X5, dev #22 |
| Indexes | `(entity_type, entity_id, seq)`, `(project_id, seq desc)` | catalog |
| Whole-table invariants in the suite's transaction | `created_at` never decreases in `seq` order; every request's chain is unbroken in `seq` order; the latest event equals the stored value; `request.created` precedes all classifications | O12–O15 |

## Verdicts on the fixes
**D-2 (High): FIXED, verified.**
- **26 concurrency runs** reproduced the original conditions: 10 parallel identical calls, then 12 parallel mixed calls (`additional`, `needs_clarification`, `included`). 25 runs were isolated and 1 ran inside the full suite with 2 workers.
- **26/26 passed** with the order assertions now hard. Before the fix, the same test failed in 4/10, 3/5 and 1/3 runs.
- DB check per request, ordered by `seq` (`sql-D2-retest1-verification.log`): 26 requests, **252** classification events (7–12 per request).

| Check | Result |
|---|---|
| Chain unbroken (each from = previous to, first from = unclassified) | 26/26 |
| Order by `seq` = order by `created_at` | 26/26 |
| `created_at` strictly increasing in `seq` order | 26/26 |
| Last event = stored classification | 26/26 |
| Duplicate `seq` | 0 |
| Duplicate rows | 0 |
| `request.created` events | exactly one per request (26) |
| 10 identical parallel calls | 1 event, every run |

- **The race really occurred.** In 4/25 isolated runs the final transaction's start time (`requests.updated_at = now()`) was earlier than the previous event's `created_at`. That is exactly the waiting-on-lock condition that produced D-2 under `default now()`. This is a lower bound, because only the last transaction of each run can be checked this way.
- UI: the request page badge equals the last history entry in every run.
- After the full E2E run, the whole table (126 events) had 126 distinct `seq` values, and `created_at` was non-decreasing in `seq` order.

**D-1 (Medium): FIXED, verified.**
- History entries render the summary, then `<from> → <to>`, then the time, e.g. "Marked "Classify me" as Needs clarification / Included → Needs clarification" (`screenshots/*-T03-history.png`).
- Screen readers get "Changed from Included to Needs clarification"; the arrow is `aria-hidden`.
- The T-03 UI test now passes at both widths with hard assertions (it was 2 failures in the first run).
- The first entry correctly reads "Not classified yet → Included". Non-classification events (`request.created`) show only their summary.
- axe: 0 violations at 375 and 1280 with a 5-entry history and a 200-char unbroken title.

**O-a (was O-3): RESOLVED.**
- `listRequests` now selects `id, project_id, title, description, source_channel, received_on, classification, created_at, updated_at`.
- I observed this on the wire (`e2e-retest1-Oa.jsonl`): 2 list queries, neither with `internal_notes` in the URL or the note text in the body.
- The detail query still loads the notes, and they are shown on the request page. AC-5 still passes.

**O-b (was O-1): ACCEPTED as specified.**
- BR-5 now documents the server tolerance of UTC today + 1 (DEC-011), and the UI enforces local today.
- Server: today+1 accepted, today+2 rejected on INSERT and UPDATE (tester pgTAP V1–V3). UI: future dates blocked (T-02 E2E, both widths).
- Behaviour matches the reworded spec.

## Acceptance criteria (retest 1)
| Criterion | Result | Evidence |
|---|---|---|
| AC-1 create / persist / list | **PASS** | T-01 E2E ×2; pgTAP dev 1–3, tester V8/V12 |
| AC-2 validation UI + server | **PASS** | T-02 E2E (UI ×2, API); tester V1–V17. BR-5 per DEC-011 (O-b) |
| AC-3 classify → label + history (from → to, time); same value no entry; history immutable | **PASS** (was FAIL) | T-03 UI ×2 (from → to, hard); concurrency 26/26; API immutability; pgTAP C1–C19, X5, O1–O15, event_ordering 11/11 |
| AC-4 direct classification / events writes rejected | **PASS** | `api-T03-T04.jsonl`; pgTAP dev 7, 13–15, tester G4, G6, E1–E3, V14, O9 |
| AC-5 private label; notes only on the request row | **PASS** | T-05 E2E; O-a network check (list queries carry no notes) |
| AC-6 revision usage | **PASS** | T-06 E2E; pgTAP U1–U12, R9–R13 |
| AC-7 archived read-only (UI + server) | **PASS** | T-07 E2E; pgTAP R0–R13 |
| AC-8 B / anon isolation | **PASS** | T-08 E2E; pgTAP B1–B14, R7b, N1–N7 |
| AC-9 no money; Additional hint, no dead action | **PASS** | T-09 E2E; pgTAP G17, C18 |
| AC-10 axe, keyboard, no overflow at 375/1280 | **PASS** | 26 scans, 0 violations of any impact (incl. new history state); keyboard test ×2 |
| AC-11 Phase 1 + 2 regression | **PASS** | full run 197 passed / 0 failed; pgTAP 12/22/32/80 |

## Test scenarios (retest 1)
| ID | Result | Evidence |
|---|---|---|
| T-01 | PASS | see AC-1 |
| T-02 | PASS | see AC-2 |
| T-03 | **PASS** (was FAIL) | D-1 and D-2 verified above |
| T-04 | PASS | see AC-4 |
| T-05 | PASS | see AC-5 (O-3/O-a resolved) |
| T-06 | PASS | see AC-6 |
| T-07 | PASS | see AC-7 |
| T-08 | PASS | see AC-8 |
| T-09 | PASS | see AC-9 |
| T-10 | PASS | see AC-10 |
| T-11 | PASS | see AC-11 |

## New defects
None.

## Observations (no defect raised)
- **O-c:** The migration is recorded remotely as version `20261116181650`, but the repo file is `20261116170000_event_ordering.sql`. This is the same pattern as every earlier migration (e.g. profiles `20261116091814` vs `…100000`), so it is not new. The SQL bodies are identical. A future `supabase db push` / `migration list` against this project would show a mismatch; the Team Lead may want to reconcile it before release.
- **O-d:** `seq` guarantees the true order *per request*, because `classify_request` holds the row lock until commit. Across different entities, which are not serialised against each other, `seq` reflects insert order, not commit order. This is harmless for the per-request history the spec requires. A future project-wide activity feed (Phase 5) should keep that in mind. In practice `created_at` and `seq` agreed across all 126 events of the full run.
- O-2 and O-4 to O-7 from the first run are unchanged and still need no action.

## Security advisor
Same two findings as before (`authenticated_security_definer_function_executable` for `classify_request`, `confirm_scope`, `delete_my_account`; `auth_leaked_password_protection`). Both are dispositioned in `docs/security/ADVISOR_NOTES.md`, so there are **no new findings**. Nothing relates to `activity_events` or `seq`.

## Cleanup (retest 1)
- Using the test-only bypass (`guardscope.account_deletion`), I deleted all projects of a@ and b@, once before the full run and once at the end (`sql-cleanup-retest1.log`).
- Final state:
  - only `a@guardscope.test` and `b@guardscope.test` exist;
  - projects, versions, items, requests, events and usages are all 0;
  - both profiles have null fields.
- The pgTAP users were rolled back.

## Files added or changed by the Tester (retest 1)
- `tests/db/requests_tester.test.sql`
- `tests/e2e/p3-classification.spec.ts`
- `tests/e2e/p3-helpers.ts`
- `tests/e2e/p3-a11y.spec.ts`
- `tests/e2e/p3-retest1.spec.ts` (new)
- `docs/testing/phase3/**`
- this report

## Final acceptance decision (retest 1)
**ACCEPTED at `18b3482`.** D-1 and D-2 are fixed and independently verified. AC-1 to AC-11 and T-01 to T-11 pass. The regression is clean: 197/197 E2E executed passed, 327/327 pgTAP and 120/120 unit tests. There are no new defects and no new advisor findings. ISS-014 and ISS-015 can be closed as "verified by Tester Phase 3 retest 1 (18b3482)". O-c is a release-hygiene note for the Team Lead and does not block acceptance.
