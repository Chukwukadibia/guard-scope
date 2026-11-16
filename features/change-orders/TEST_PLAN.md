# Phase 4 — Test Plan
**Executed by:** Tester Specialist (separate subagent). Same environment and conventions as Phases 1–3. Terminal client states (approved / declined / clarification) don't exist until Phase 5: create them in pgTAP as superuser only, to prove the guard behaviour.

| ID | AC | Type | Scenario |
|---|---|---|---|
| T-01 | AC-1 | E2E + API | Create from Additional (pre-fill, no private notes); attempts from other classifications; second proposal for the same request |
| T-02 | AC-2 | E2E + API | Edit and save every field; each validation rule in the UI and via REST |
| T-03 | AC-3 | E2E + API | Send valid; each send-time rejection |
| T-04 | AC-4 | API + pgTAP | REST PATCH/DELETE on a sent version; superuser update of content |
| T-05 | AC-5 | E2E + DB | v2 creation/copy; send v2 → v1 superseded; v1 content unchanged; draft/pending uniqueness under concurrent calls |
| T-06 | AC-6 | pgTAP + E2E | Cancel; discard v1 and vN; every forbidden transition, including direct status writes |
| T-07 | AC-7 | E2E + DB | History entries and order |
| T-08 | AC-8 | E2E + API | Completed and archived projects: every write is blocked |
| T-09 | AC-9 | pgTAP + API | A vs B across tables and RPCs; anon |
| T-10 | AC-10 | E2E | Currency shown everywhere; wording "proposed"; no paid/collected/earned |
| T-11 | AC-11 | a11y | axe + overflow on the proposal page (draft, sent, multi-version), the request page and the project page |
| T-12 | AC-12 | Regression | Phases 1–3 |
