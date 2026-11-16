# Phase 2 — Test Plan

**Executed by:** Tester Specialist (separate subagent). Environment as in Phase 1: guardscope-dev; users a@ and b@ plus throwaway SQL fixtures for deletion; Playwright 375/1280 with axe.

| ID | AC | Type | Scenario | Expected |
|---|---|---|---|---|
| T-01 | AC-1 | E2E | Create a project with required fields only, then with all fields; reload | Values persist; default currency pre-selected when set in Settings |
| T-02 | AC-2 | E2E + API | Each invalid input in the UI; the same payloads via PostgREST | UI field errors + summary; server rejects (check constraint / 4xx) |
| T-03 | AC-3 | E2E | Edit; mark completed; archive; check list filters; read-only archived view; reopen | As specified |
| T-04 | AC-4 | E2E | Add, edit, reorder and remove deliverables, exclusions and assumptions; all three allowance modes; reload | Persists; "Not specified" displayed |
| T-05 | AC-5 | E2E + API | Confirm with no deliverables; confirm valid; double confirm via API | `empty_scope`; success with date + baseline flag; `already_confirmed` |
| T-06 | AC-6 | E2E + DB | Confirm; change price/deadline and scope items; confirm v2; compare v1 rows before and after | Baseline unchanged; UI shows original vs current vs draft |
| T-07 | AC-7 | API/pgTAP | Owner PATCH/DELETE of a confirmed version and its items; insert an item into a confirmed version | All rejected |
| T-08 | AC-8 | pgTAP + API | A vs B: select, insert (with B's project_id), update, delete, RPC `confirm_scope` on B's version; anon on everything | 0 rows / errors |
| T-09 | AC-9 | E2E | Dashboard count before and after creating and archiving a project; New project action | Correct count; action works |
| T-10 | AC-10 | E2E + DB | Throwaway user with projects + confirmed scope; wrong password, then correct; try sign-in afterwards; count rows | Wrong password blocked; deleted; cannot sign in; 0 rows remain |
| T-11 | AC-11 | a11y | axe on the projects list, form, detail, scope editor, confirm dialog, settings with the deletion section, dashboard | 0 serious/critical; no overflow |
| T-12 | AC-12 | Regression | Full Phase 1 suite | Pass |
