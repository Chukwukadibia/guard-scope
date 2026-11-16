# Phase 3 — Test Plan
**Executed by:** Tester Specialist (separate subagent). Same environment and conventions as Phases 1–2.

| ID | AC | Type | Scenario |
|---|---|---|---|
| T-01 | AC-1 | E2E | Quick add with title only; full add; reload; list order (newest received first) |
| T-02 | AC-2 | E2E + API | Each invalid input in the UI and via PostgREST (incl. future date, bad channel, 201-char title) |
| T-03 | AC-3 | E2E + DB | Classify through all values; history entries; same value twice; API UPDATE/DELETE on events |
| T-04 | AC-4 | API/pgTAP | PATCH `classification` directly; INSERT into `activity_events` |
| T-05 | AC-5 | E2E | Private notes label; notes absent from any list or other surface beyond the owner's request view |
| T-06 | AC-6 | E2E + DB | Allowance none / 2 / not specified; record, undo, over-use; disabled before confirmation; foreign-project request link rejected |
| T-07 | AC-7 | E2E + API | Archive the project, then try every write |
| T-08 | AC-8 | pgTAP + API | A vs B on requests, events, usages and the RPC; anon |
| T-09 | AC-9 | E2E | No money shown for requests; Additional shows the Phase 4 hint |
| T-10 | AC-10 | a11y | axe + overflow on the project page (requests and revisions sections) and the request detail |
| T-11 | AC-11 | Regression | Full Phase 1 + 2 suites |
