# Phase 5 — Test Plan

**Executed by:** Tester Specialist (separate subagent), in short checkpointed chunks (the Team Lead commits and pushes after each). Same environment as earlier phases. The public page is tested **without** a session (a fresh browser context).

| ID | AC | Type | Scenario |
|---|---|---|---|
| T-01 | AC-1/2 | pgTAP + API | Issue a link: shape, uniqueness over many issues, hash-only storage (no raw token anywhere: tables, events, logs), one active link per version |
| T-02 | AC-2 | API | Guessed, empty, short, long, wrong-alphabet, SQL-injection-like and unicode tokens: all `invalid`, none crash |
| T-03 | AC-3 | API + E2E | Public projection: exactly BR-1 fields; private notes, other versions, other projects and account data never present |
| T-04 | AC-4 | E2E | Token only in the fragment and POST body: inspect every request URL and header, the address bar and history after load |
| T-05 | AC-5 | E2E + DB | Approve, decline, clarify, with and without a comment: status, event, timestamp, freelancer view |
| T-06 | AC-6 | API | Retry with the same key; a second decision with a new key; ≥20 simultaneous decisions (mixed values) on one version, repeated ≥10 times |
| T-07 | AC-7 | E2E + API | Expired (time-travel via SQL on dev), revoked, replaced, cancelled, decided: no decision accepted, safe message |
| T-08 | AC-8 | pgTAP + E2E | Reissue, supersede, cancel revoke the old link; the old link shows the right state |
| T-09 | AC-9 | API | N failed guesses from one source then `rate_limited`; the global breaker; a valid token still works from a fresh source; throttle rows hold no raw IP |
| T-10 | AC-10 | pgTAP + API | anon and authenticated direct table access denied (links, decisions, versions, attempts); only the two public RPCs executable by anon; the owner can't decide; B can't issue or revoke on A's versions |
| T-11 | AC-11 | E2E | Wording scan of the client page and the freelancer view |
| T-12 | AC-12 | a11y | axe + overflow + keyboard on every client page state at 375 and 1280; long comments |
| T-13 | AC-13 | pgTAP + E2E | Account deletion cascade; Phase 1–4 regression ×2 |
| T-14 | — | Security review | A separate adversarial review (token handling, leakage, projection, throttle, CSP, enumeration) → `docs/security/PHASE5_SECURITY_REVIEW.md` |
