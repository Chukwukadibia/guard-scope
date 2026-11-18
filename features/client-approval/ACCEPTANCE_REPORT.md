# Client Approval (Phase 5) — Acceptance Report
**Tester run mode:** separate general-purpose subagent, fresh context (Tester Specialist). Chunked; this file is updated as chunks complete.
**Commit tested:** ee35044 (branch feature/p5-client-approval) · Backend: Supabase guardscope-dev (eqozjuaaajstrewygqxr) only.

## Chunk A — database, token and RPC security (STATUS: COMPLETE except 3 regression files not run)

### Results (Chunk A)
| Criterion / Test | Result | Evidence |
|---|---|---|
| Developer pgTAP `client_approval.test.sql` | PASS 83/83 (reviewed: no meaningless assertions found; gaps filled below) | docs/testing/phase5/dev-client_approval-pgtap-83.txt |
| Tester pgTAP `tests/db/client_approval_tester.test.sql` (157 assertions: precedence matrix 56 combos, e2e states, projection keys, column privileges, privileged-role immutability on every column, token/comment edge cases, key reuse, issue on every status, owner vs other owner, 200 issues, deletion cascade) | 151 PASS / 6 FAIL: 4 spec deviations (F-1, F-3), 1 = F-2, 1 = my own test bug (fixed, verified standalone) | docs/testing/phase5/chunkA-pgtap-tester-run1.txt |
| T-01 / AC-1 (issue via REST as owner, raw token once, 30-day expiry, hash only; raw token in no REST-readable table/column/event/header/error) | PASS | chunkA-live-surface.txt; pgtap #55-61 |
| T-02 / AC-2 (guessed, malformed, 42/44 chars, whitespace, unicode lookalikes, case variants, SQLi, 1 MB and 5 MB tokens: all `invalid`, no 5xx, 5 MB in 3.4 s; NUL char -> clean HTTP 400 22P05) | PASS | chunkA-live-edge1/2/3.txt; pgtap #80-93 |
| T-06 / AC-6 (10 rounds x 24 simultaneous mixed decisions/keys on fresh versions: exactly 1 `recorded`, rest `decided` or `already_recorded` only for the winner's key and returning the ORIGINAL decision; DB: 1 decision, status = decision, 1 client event; no 5xx/deadlock) | PASS | chunkA-live-concurrency.txt |
| Races (30 rounds: decision vs owner cancel / supersede (send v2) / revoke, both orderings observed) | PASS: never a decision on a cancelled/superseded/revoked-before version; no 5xx, no deadlock | chunkA-live-races.txt |
| T-09 / AC-9 (120 random tokens: 40 processed then `rate_limited` ... per source; a valid token AND a decision from a blocked source are `rate_limited`; failures capped at 20 per key; reset at the 10-min window boundary verified live (valid again 3 s after rollover); other sources unaffected) | PASS (see O-1: egress IP pool rotates, measured per IP) | chunkA-live-throttle.txt; pgtap #126-147 |
| Spoofing: X-Forwarded-For first/last/trailing-comma, X-Real-IP, True-Client-IP, Forwarded: no new throttle key created for any spoofed value (checked by hashing candidate values against `public_link_attempts`); client-supplied CF-Connecting-IP is rejected by Cloudflare with HTTP 403 before reaching the database | PASS | chunkA-live-spoof.txt |
| AC-7 (expired / revoked / replaced / cancelled / decided cannot record a decision) | PASS (DB matrix + live expiry: link set to expire in 12 s via the test-only privileged bypass, flipped to `expired` after 22 s, decision -> `{error:expired}`) | pgtap #13-26, #53-54; chunkA-live-expiry.txt |
| AC-8 (reissue / supersede / cancel / revoke) | PASS | pgtap #31-34, #48-52; chunkA-live-races.txt |
| T-10 / AC-10 (REST: anon and B denied 401/403 42501 on every new table, versions, events; anon only the 2 public RPCs; internal helpers 42501 for anon and authenticated; owner cannot POST/PATCH/DELETE decisions or links; B cannot issue/revoke on A's version (`not_found`); DB: exact column privileges, service_role + superuser cannot update any column/delete) | PASS | chunkA-live-surface.txt, chunkA-live-grants.txt; pgtap #62-79 |
| Anon GET on the RPCs | PASS: HTTP 405 (SQLSTATE 25006, read-only transaction), no state change, no 5xx | chunkA-live-surface.txt |
| T-13 / AC-13 DB part (deletion cascade) | PASS | pgtap #148-157 |
| T-13 Phase 1-4 regression (run 1 of the required x2) | PARTIAL. PASS: change_orders.test 39/39, change_orders_tester 125/125 (covers redefined send/cancel), event_ordering 11/11, profiles_rls 12/12, projects_scope 32/32. FAIL 1: profiles_rls_tester 21/22: assertion 3 "no password-like columns in public" (column_name ilike '%hash%') now matches the legitimate Phase 5 column `approval_links.token_hash` (SHA-256 of a random token, not a password): a stale heuristic in the Phase 1 test, NOT a product defect (F-4, test maintenance; I may not edit earlier phases' tests). NOT RUN (context budget; none touch objects changed by Phase 5): requests.test, requests_tester, projects_scope_tester: BLOCKED, to be run by the next session or the Team Lead | docs/testing/phase5/chunkA-regression.txt |
| Supabase advisors (security) | PASS: only the dispositions in ADVISOR_NOTES.md (2 INFO rls_enabled_no_policy, 2 anon + 12 authenticated SECURITY DEFINER WARN, leaked-password WARN) | this report |
| Chunks B/C (T-03, T-04, T-05, T-07 UI, T-08 UI, T-11, T-12, T-14, AC-3, AC-4, AC-5, AC-11, AC-12, T-13 E2E + x2 regression) | PENDING | |

### Findings
- **F-1 (MEDIUM)** Creating an UNSENT draft revision of a pending version silently disables the live client link. `_link_state` compares `version_no` with the max version_no INCLUDING drafts, and `new_change_order_version` does not check the latest version's status. Repro: owner sends v1, issues link, creates draft v2 ("new version"). The client now sees "replaced by a newer version" and `submit_public_decision` returns `{error:'superseded'}` although nothing was sent and v1 is still the current pending version. Discarding the draft restores the link. Expected (CO-008 "current, pending version"; BR-1 "replaced"): link stays valid until a newer version is SENT (or the state helper should compare against the max SENT version). Impact: a client mid-decision loses the ability to answer; the freelancer is not warned. Also lets `issue_approval_link` mint a link that is born `superseded` while a draft exists. Evidence: pgtap #27, #30 (fail), #28-29 (restore); live: chunkA-live-races.txt supersede rounds (the chain creates the draft first).
- **F-2 (LOW)** A comment containing only tabs/newlines (not plain spaces) is stored as a non-empty comment (`btrim` trims spaces only) and the history event says `has_comment: true`. Expected: normalised to NULL. Evidence: pgtap #109.
- **F-3 (LOW)** BR-2 precedence deviation: for a pending, not-latest version that is also revoked or expired, the implementation returns revoked/expired; spec orders superseded first. Reachable only together with F-1. Evidence: pgtap #11, #12.

- **F-4 (LOW, test maintenance)** `tests/db/profiles_rls_tester.test.sql` assertion 3 fails at HEAD because its '%hash%' column-name heuristic matches `approval_links.token_hash`. Suggested fix by its owner: allow-list `approval_links.token_hash` (and keep the intent: no password/secret columns). Product behaviour is correct (token_hash is not readable by any API role).

### Observations (no defect)
- O-1 The test egress pool (Anthropic IPs 160.79.106.x) rotates source IPs per request; the throttle keys on `cf-connecting-ip` as designed (verified in the edge logs and by hashing). Result: limits apply per egress IP (each IP capped exactly at 20 recorded failures; blocked attempts are not counted further).
- O-2 Fixed 10-minute bins (not sliding): an attacker can send 20 failures just before a boundary and 20 just after (40 in a few seconds). Irrelevant against a 256-bit token, noted for the record.
- O-3 `get_public_proposal` on a blocked source returns `rate_limited` before checking the token, so a legitimate client behind a shared NAT/egress IP that was abused is also blocked for up to 10 minutes (observed live: even a VALID token read and decision were rate_limited). Accepted by design (BR-6), worth a UI message.
- O-4 `validation` errors on submit happen before the token is checked and are not counted as failures; they reveal nothing about a token's existence.
- O-5 `service_role`/superuser can still TRUNCATE `client_decisions`/`approval_links` (no TRUNCATE trigger) and any SQL session can set the `guardscope.account_deletion` flag to bypass the guards. The service key is not exposed to clients; same pattern as Phases 2-4. LOW, informational.
- O-6 `already_recorded` is returned for a key replay even when the link is revoked/expired (by design, BR-3).
- O-7 The Phase 1-4 pgTAP files other than the tester ones assume an empty database (unscoped selects); they fail with "more than one row" if live fixtures exist. Clean first.
- O-8 pgtap-wrap emits TAP rows in heap order (no ORDER BY), so numbering can look shuffled; results unaffected.
- O-9 Run-note: my own `tests/api/p5-chunkA-live.mjs` label "old link after reissue" prints the NEW token's state (valid); the old-token revocation is covered in pgTAP #10 (dev) and #48-49.

### Cleanup (Chunk A)
All live fixtures deleted with the test-only SQL; a@/b@ have 0 projects and null profile fields; public_link_attempts empty; users a@/b@ kept. Test-only privileged change: one fixture link's expires_at was moved to now()+12s via the deletion-flag bypass (fixture deleted afterwards; nothing to restore).
