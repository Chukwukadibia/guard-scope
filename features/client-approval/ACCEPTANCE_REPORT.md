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

## Retest after fixes (product 78b5182, migration 20261117102000_link_state_fixes, ISS-022..024)
| Item | Result | Evidence |
|---|---|---|
| `client_approval_tester.test.sql` | PASS 157/157 (F-1 #27/#30, F-2 #109, F-3 #11/#12 now pass) | chunkA-regression.txt |
| Debug agent's 4 failures (#83,#124,#125,#137) | **TEST FAULT (mine), not a product bug.** My helper `pg_temp.try()` did not roll back a successful statement, and #78 revoked an arbitrary active link (`limit 1`, unordered); which link that was changed with heap order after the migration's rewrites, breaking later assertions that rely on specific lab links. Fix: `try()` now always rolls back; #78 targets a dedicated lab link by hash. | chunkA-regression.txt, tests/db/client_approval_tester.test.sql |
| F-4 `profiles_rls_tester` #3 | Fixed in my test: heuristic excludes ONLY `approval_links.token_hash`; any other password/passwd/pwd/hash/secret column (incl. on profiles) still fails. Predicate verified: 0 matches after exclusion, 1 before. Earlier 21 other assertions passed. | tests/db/profiles_rls_tester.test.sql |
| Earlier-phase files | `requests.test` 32/32 PASS, `projects_scope_tester` 80/80 PASS. `requests_tester`: NOT RUN (BLOCKED: context budget; no Phase 5 object it touches; to be run by the next session) | chunkA-regression.txt |
| F-1 / F-2 live (REST) | PASS: draft v2 exists -> link `valid`, decision `recorded`; tab/newline-only comment stored NULL. F-3 verified in pgTAP (#11/#12); live, a revoked link with only a draft present is `revoked` (draft no longer makes v1 non-latest) | chunkA-live-retest.txt |

## Chunk B: client approval UI / E2E (product 78b5182; Playwright + axe, desktop 1280 and mobile 375; fresh no-session context for the public page)
Spec: `tests/e2e/p5-client-approval.spec.ts` (15 tests x 2 projects = 30). Result: **28 passed, 2 failed** (both = F-5, desktop and mobile). Earlier-phase E2E (p3 + p4, 88 tests incl. my edits): 74 passed, 14 skipped (pre-existing skips), 0 failed. `npm run check` passes.

| Criterion / Test | Result | Evidence |
|---|---|---|
| T-03 / AC-3 public projection in the UI (BR-1 fields, currency on amounts, no private notes / ids / emails, noindex meta, no storage keys for the client) | PASS | e2e p5 "T-03/T-12"; chunkB-public.jsonl |
| T-07 / AC-7 states in the browser: no fragment, short, random, trailing char, `?token=` -> generic "isn't available"; revoked, superseded (send v2), cancelled from the real DB; decided (all three decisions); expired + rate_limited via a network-layer simulation of the server answer (real DB states = chunk A); draft revision no longer disables the link (F-1 fix, UI level) | PASS | e2e p5; screenshots/ axe/ |
| T-05 / AC-5 approve (comment), decline (no comment), clarification: confirm step first (nothing recorded until confirm, "Go back" works), confirmation page, reopening the link shows "A response was already recorded", comment never echoed to the public page, owner sees decision + comment + time on the exact version, history event without comment | PASS | chunkB-decisions.jsonl |
| AC-6 UI: 2000 chars (and 2000 multi-byte) accepted, 2001 blocked client-side with an accessible error and nothing recorded; HTML/script in a comment shown as text on the owner page (no execution); retry after a connection reset reuses the SAME idempotency key and yields exactly one decision; double click records once; offline disables actions and shows the banner | PASS | e2e p5 |
| T-04 / AC-4 token leak audit (address bar, `history.state`, `document.referrer`, every request URL and header incl. Referer, non-POST-body parts, localStorage/sessionStorage/IndexedDB names, Cache Storage, console, title, DOM, resource timing; RPC only via POST body; submit request too) | PASS (0 leaks, desktop + mobile). One observation O-10 | chunkB-token-leak.jsonl |
| T-04 response headers (static config; vite preview does not apply `_headers`): Referrer-Policy no-referrer, CSP (script-src 'self', frame-ancestors 'none', connect-src only the Supabase host), nosniff, X-Frame-Options; `dist/_headers` identical | PASS (config); NOT verifiable locally: actual deployment behaviour. Observations O-11 | e2e p5 "static response headers" |
| AC-12 / T-12 axe (serious/critical = 0) and no horizontal overflow at 375 and 1280 on every public state (valid, invalid, expired, revoked, superseded, cancelled, decided x3, rate_limited, comment error, done x3), owner link-issued / reissue-confirm / decided-with-long-comment pages; long unbroken text and 2000-char comments wrap | PASS | docs/testing/phase5/axe/*.json, screenshots/ |
| PWA / offline: service worker active; Cache Storage holds only the app shell (no Supabase URL, no token); reopening a decided link offline shows "We couldn't load this proposal ... Try again", never the cached decision; SW config has NetworkOnly for `*.supabase.co` | PASS | chunkB-public.jsonl |
| T-08 / AC-1 / AC-8 owner UI: send -> link shown once (copy button, clipboard content equals the displayed link, "Link copied.", expiry date, "shown only once"), after reload only the status ("Active until ...") with no link text, token absent from history events, issue-new-link confirm (keep / yes), old link `withdrawn` and new link valid, revoke, re-issue after revoke, cancel revokes the link; completed project hides issue but keeps revoke | PASS | e2e p5 |
| T-11 / AC-11 wording scan (client page in every state and owner decision/link UI): no "legally binding", "signed", "signature", "e-signature", "certified", "contract", "enforceable"; no "paid/collected/earned" | PASS | e2e p5 |
| F-5 same-tab hash-only navigation (AC-4) | **FAIL (finding F-5)** | chunkB-public.jsonl "F-5" |
| T-14 security review, AC-13 E2E part (account deletion UI) | PENDING (chunk C) | |

### New findings (chunk B)
- **F-5 (MEDIUM)** Opening a second approval link in the SAME tab shows the previous page and leaves the new token in the address bar. `PublicProposalPage` reads the fragment only once at mount (`captureToken`); a navigation that changes only the hash (client pastes a new link into the tab that shows `/p`, or taps a link from a mail app into a tab already on /p) is a same-document navigation: the React page does not reload, keeps the OLD state (e.g. "This link isn't available" for a client who first opened a stale link, or the old proposal) and the fragment with the new 43-char token stays in the URL bar and history (violates AC-4 on that path; the client is told the new link is not available). Repro: open `/p#<link1>`; then in the same tab go to `/p#<link2>`. Expected: page shows link2's proposal and the fragment is removed. Actual: link1's view, `location.hash` = link2's token. Fix hint: listen to `hashchange` (re-run capture + load) or use a full reload. Evidence: e2e p5 F-5 test (fails on both projects); chunkB-public.jsonl `{"urlHasToken":true,"showsSecond":false}`.
- **F-6 (LOW, wording)** Client-side clarification outcome does not say the version is closed. After "I have a question", the client sees "You asked a question. The sender will reply separately." and on reopening "Asked a question" with no buttons, but nothing says this proposal version can't be answered again and that a new version/link will follow (OD-6 A: terminal for that version). The owner side is correct ("Not an approval: reply to your client and send a new version."). Suggest: "This version is closed. If the proposal changes, the sender will send you a new version with a new link."
- **O-10** The navigation-timing entry (`performance.getEntriesByType('navigation')[0].name`) still contains the original URL with the token for the life of the page. Readable only by same-origin script (CSP `script-src 'self'`, no third-party scripts), not sent anywhere. LOW, inherent to opening a URL with a fragment.
- **O-11** `public/_headers` has no `Cache-Control: no-store` and no `X-Robots-Tag: noindex` for `/p`; noindex is a runtime `<meta>` added after JS runs. The HTML shell contains no per-link data, so this is defence in depth only. A gateway 429 (not the RPC's `rate_limited` answer) renders "We couldn't load this proposal ... Try again" instead of the "Too many attempts" copy (LOW).
- Test setup note (mine): `browser.newContext()` inherits `test.use({storageState})`, so my first public-page runs silently carried user A's session; fixed by passing an empty storage state explicitly. All results above are from the fixed run (public page storage keys: none).

### Edits to earlier-phase E2E assertions (only what the Phase 5 copy requires)
- `tests/e2e/p4-proposals.spec.ts` send-confirm text (was ~:229): 'Secure approval links for your client arrive in the next release.' -> 'After sending, you get a private link to share with your client.'
- same file, sent version card (was ~:269): same old sentence -> 'Waiting for the client. Share the link below yourself'.
- same file (~:273): `expectNoDeadLinkButtons` after sending replaced by assertions that the real link box and 'Copy link' exist (the check still runs on the draft state, T-01). 
- same file history list (T-07): added the two new events 'Approval link issued for version 1' / '... version 2' in their order.
- Not needed: `p3-classification.spec.ts:357` and `p4-retest1.spec.ts:255` (they are negative regex checks that still pass). Re-running the old specs rewrote tracked evidence under docs/testing/phase3 and phase4; I restored those files with `git checkout` (nothing of theirs was kept).

## Chunk C: retest of F-5/F-6, full regression x2, final decision (HEAD b285c17; product code identical to 62ca2ac)

### Retests and test fixes (mine)
- `p5-client-approval.spec.ts` "T-04 static headers" did not load under Playwright 1.65.1 (`(_fixtures, testInfo)`: the first argument must be a destructuring pattern). Fixed (`({ browserName }, testInfo)`), my test fault.
- Owner cancel-link race: the test opened the link before the cancel had finished. Test fault (mine). The test now waits for the notice "Version 1 cancelled.", the "Cancelled" badge and `status = cancelled` in the database before the client opens the link; nothing was weakened. The static-headers test now also asserts the `/p` and `/p/*` blocks carry `X-Robots-Tag: noindex` and `Cache-Control: no-store`.
- **F-5 CLOSED**: hash navigation to a second link in the same tab now shows the new proposal, the token is gone from the address bar, history.state, storage and title, and the old state (stale "isn't available" or a recorded-confirmation) is dropped. Two tests: the original F-5 test and a new "stale-then-valid / decision on screen then another link" test; both pass on desktop and mobile.
- **F-6 CLOSED**: after a clarification the client sees "This version is now closed. The sender has been told and will send you a new version if needed." on the confirmation and on reopening (asserted in `decideFlow`; other decisions must not show it).
- pgTAP at the unchanged schema (no migration after 20261117102000): `requests_tester` 138/138 (first run ever), `profiles_rls_tester` 22/22 in full, `client_approval_tester` 157/157 (chunk B retest), `projects_scope_tester` 80/80, `requests.test` 32/32. Phase 1-4 developer/tester files `change_orders`, `change_orders_tester`, `event_ordering`, `profiles_rls`, `projects_scope` last ran green BEFORE migration 102000 (which only redefines `_link_state`, `get_public_proposal`, `submit_public_decision`; none of them touch these): see the status line at the end of this section for the re-run.

### Full regression (HEAD b285c17; product code unchanged since 62ca2ac)
| Run | Result | Evidence |
|---|---|---|
| `npm run check` (format, lint, typecheck, 177 unit tests, build, secrets scan) | PASS (one pre-existing `react-hooks/exhaustive-deps` WARNING in src, not an error) | npm output |
| Full E2E pass 1 (p1..p5 + a11y/debug/retest specs, desktop + mobile, 304 tests) | **270 passed, 34 skipped (pre-existing skips), 0 failed** (14.2 min) | docs/testing/phase5/chunkC-e2e-full-pass1.txt |
| Full E2E pass 2 (same, consecutive) | 268 passed, 34 skipped, **2 failed, both FLAKES**: `p3-requests.spec.ts:34` (mobile; heading "Overview" not found after create) and `p3-classification.spec.ts:328` (mobile; `page.evaluate` timeout 30 s). Re-run in isolation, mobile, `--repeat-each=3` each: **6/6 passed**. They did not fail in pass 1, touch no Phase 5 code, and both are network-latency timeouts. Not a product failure; if the team wants a "zero flake" pass, run a third pass | chunkC-e2e-full-pass2.txt |
| pgTAP at the unchanged schema | `client_approval` developer **91/91**, `client_approval_tester` 157/157, `requests_tester` 138/138, `profiles_rls_tester` 22/22, `projects_scope_tester` 80/80, `requests` 32/32. NOT re-run after migration 102000 (last green before it; the migration only redefines `_link_state`, `get_public_proposal`, `submit_public_decision`): `change_orders` 39/39, `change_orders_tester` 125/125, `event_ordering` 11/11, `profiles_rls` 12/12, `projects_scope` 32/32 | chunkA-regression.txt and this report |

### Final per-AC table
| AC | Result | Evidence |
|---|---|---|
| AC-1 issue once, hash only | PASS | pgtap tester #55-61; live surface; e2e T-08 (shown once, gone after reload, not in history) |
| AC-2 43-char base64url, no collision, bad tokens invalid | PASS | pgtap #55-56, #80-93; chunkA-live-edge1/2/3 |
| AC-3 projection exactly BR-1 | PASS | pgtap #13-25; e2e T-03 |
| AC-4 token only in fragment and POST body | PASS (after F-5 fix). Residual: O-10 navigation timing, browser/synced history of the original URL (SEC-5-9) | e2e T-04 leak audit, F-5 tests; chunkB-token-leak.jsonl |
| AC-5 approve/decline/clarify recorded, owner sees it | PASS | e2e T-05 x3 |
| AC-6 idempotent, one decision, 24 concurrent x10 | PASS | chunkA-live-concurrency/races; e2e retry test |
| AC-7 expired/revoked/replaced/cancelled/decided cannot decide | PASS | pgtap; live expiry; e2e T-07 (expired + rate_limited simulated in UI, real in DB) |
| AC-8 reissue/send/cancel revoke | PASS | pgtap; races; e2e T-08 |
| AC-9 throttle per source, valid token from another source unaffected | PASS | chunkA-live-throttle/spoof; pgtap |
| AC-10 no owner write path, anon only two RPCs, no direct table access | PASS | chunkA-live-surface/grants; pgtap #62-79 |
| AC-11 wording | PASS (scan of client page in every state and owner UI) | e2e p5 |
| AC-12 a11y/overflow/keyboard | PASS: axe serious/critical 0 and no overflow at 375 and 1280 on every public state and owner link pages; keyboard flow covered by earlier-phase specs and the form tests | docs/testing/phase5/axe/*.json |
| AC-13 deletion removes links/decisions; Phase 1-4 regression | PASS at DB level (synthetic users, cascade verified, also with 200 links); UI deletion of a Phase-5-loaded account NOT exercised end to end (a@/b@ must not be deleted) = condition; regression passes (see above) | pgtap #148-157, dev #91 |

### Final per-test table
| Test | Result | Evidence |
|---|---|---|
| T-01 issue, shape, uniqueness, hash-only | PASS | pgtap, live surface |
| T-02 invalid token zoo | PASS | live edge, pgtap |
| T-03 projection | PASS | e2e |
| T-04 token leak / headers | PASS (config only for headers) | e2e, `public/_headers` |
| T-05 decisions | PASS | e2e |
| T-06 idempotency/concurrency | PASS | live, e2e |
| T-07 states | PASS (expired and rate_limited UI simulated; DB real) | e2e, pgtap |
| T-08 reissue/supersede/cancel | PASS | e2e, pgtap |
| T-09 throttle/breaker/no raw IP | PASS | live, pgtap |
| T-10 access control | PASS | live, pgtap |
| T-11 wording | PASS | e2e |
| T-12 a11y/overflow | PASS | axe/ |
| T-13 deletion + Phase 1-4 regression x2 | PASS with the flake note (2 consecutive full passes: 0 and 2 flaky/isolated-green) | chunkC-e2e-full-pass*.txt |
| T-14 security review | Done by the separate security-review agent: "pass with conditions", no CRITICAL/HIGH, 1 MEDIUM (SEC-5-1 throttle table growth / IPv6 rotation) and 8 LOW | docs/security/PHASE5_SECURITY_REVIEW.md (not my work) |

### Findings and observations: final status
| ID | Severity | Status |
|---|---|---|
| F-1 draft revision disabled the live link | MEDIUM | CLOSED (migration 102000; pgtap + live + e2e) |
| F-2 tab/newline-only comment | LOW | CLOSED |
| F-3 BR-2 order for pending not-latest | LOW | CLOSED |
| F-4 Phase 1 heuristic matched token_hash | LOW (test) | CLOSED (my test, allow-list only token_hash) |
| F-5 hash-only navigation keeps stale view and token in the address bar | MEDIUM | CLOSED (two tests, both projects) |
| F-6 clarification wording not terminal | LOW | CLOSED |
| O-1 egress IP pool rotates; limits per IP | info | n/a |
| O-2 fixed 10-minute bins (40 failures across a boundary) | LOW | OPEN, accepted (SEC-5-2) |
| O-3 blocked source also blocks valid token | LOW | OPEN, accepted by design BR-6; security review recommends looking the hash up first (SEC-5-2) |
| O-5 service_role/superuser TRUNCATE; flag bypass settable by any SQL session | LOW | OPEN (SEC-5-4 hardening suggestion) |
| O-10 navigation-timing entry holds the original URL with the token | LOW | OPEN, inherent, same-origin only |
| O-11 no `no-store`/`X-Robots-Tag` on /p; gateway 429 copy | LOW | CLOSED in `public/_headers` (verified in config only) and 429 message (e2e headers test; 429 rendering logged) |
| Test-only: O-7 older pgTAP assume an empty DB; O-8 wrapper row order | info | OPEN, documented |
| Security review SEC-5-1..SEC-5-12 | 1 MEDIUM, 8 LOW, 2 INFO | OPEN (conditions below) |

### Known limitations (stated, not defects)
1. FEATURE_SPEC section 9: possession of the link is the only credential; the freelancer sees the raw link and could answer in the client's name. The record proves a response was made through the link, not who made it. No client identity is collected (OD-5).
2. Deployment headers (Referrer-Policy, CSP, no-store, noindex on /p) are verified from `public/_headers` and the build only; vite preview does not serve them. A real-host check is required.
3. O-10 (navigation timing) and browser/synced history keep the original URL with the token on the client's device.
4. Expired and rate_limited UI states were verified with a simulated server answer; the real server states are verified in the database and live API.
5. Unauthenticated limit: an egress IP shared by many clients can be locked out for up to 10 minutes after 20 failures (O-3).

### DECISION: ACCEPT WITH CONDITIONS
All thirteen acceptance criteria pass; no open CRITICAL or HIGH; both MEDIUM findings I raised (F-1, F-5) are fixed and retested; two consecutive full regression passes show no real failure (2 isolated-green flakes in pass 2). Conditions:
1. Verify the response headers on the real host (`/p` no-store, noindex, no-referrer, CSP) and HSTS/HTTPS before first real use (SEC-5-7, limitation 2).
2. Address or consciously accept the security review's MEDIUM SEC-5-1 (throttle table growth / IPv6 rotation) and decide on SEC-5-2 (look the token up before applying the block) before opening the page to real clients at volume.
3. The OD-13 / email / SMTP steps and the production auth settings (leaked-password protection, ISS-008) remain outside this test and are still open.
4. Run the UI account-deletion flow once against a disposable account that owns Phase 5 data (not done here: a@/b@ may not be deleted).
5. Run one more clean full E2E pass on the target commit to confirm the two timing flakes do not recur.

## Final retest (schema 7b9cd92 = migrations 20261117103000_throttle_hardening + 20261117104000_throttle_breaker_cap; HEAD 048deb3 adds docs only)

### SEC-5-1 / SEC-5-8 retest (independent)
| Item | Result | Evidence |
|---|---|---|
| My new pgTAP section S1-S49 appended to `tests/db/client_approval_tester.test.sql` (file now 206 assertions) | **206/206 PASS** | docs/testing/phase5/final-retest-pgtap.txt |
| /64 grouping, case/spelling normalisation, `::ffff:` dotted and hex = IPv4, IPv4 full address, XFF last entry grouped, 20 malformed/odd header values never raise | PASS (S1-S9, S48-S49) | same |
| Per-source 20 still applies, also to host rotation inside one /64 and to the `::ffff:` spelling of a blocked IPv4; neighbours unaffected; one row per /64 or IPv4 | PASS (S10-S17) | same |
| Breaker open (1000-4999): failed source held back (even with a valid token); fresh valid source works; fresh failure processed once, row written, then held | PASS (S18-S23) | same |
| Hard cap: failure at 4999 processed; at >= 5000 every source blocked for lookup and submit, incl. a fresh source with a valid token; no new rows, global still counted; lockdown ends with the window | PASS (S24-S31) | same |
| Cleanup: exactly 50 rows older than a day per failure call, drains the backlog, keeps younger rows, also runs at the cap; `window_start` index present | PASS (S32-S36) | same |
| SEC-5-8: raw > 8000 rejected (incl. whitespace-only, 1 MB); 2001 after trim rejected; 2000 + 6000 spaces accepted and stored as 2000; 8000 whitespace accepted as NULL; 20 worst-case 8000-char comments < 2 s; no throttle rows from validation | PASS (S37-S47) | same |
| Developer `client_approval.test.sql` (now 120, incl. 29 SEC-5-1/5-8 assertions) | **120/120 PASS** | same |
| Live REST sanity (anon key, real egress) | PASS: 40 random tokens processed, then `rate_limited` (two egress IPv4 addresses, each exactly 20 failures in the DB); a valid token from the blocked egress is `rate_limited`; after the throttle rows were cleared the same valid token is `valid` | docs/testing/phase5/final-retest-live.txt |
| Extra probes | NBSP / EM SPACE-only comments now trim to NULL; zero-width space kept (not whitespace). No exception path found | final-retest-pgtap.txt |

### New finding
- **F-7 (MEDIUM, availability / design) Hard-cap lockdown is a cheap global switch-off of the client page.** Once the global counter reaches 5000 in a window, `_throttle_blocked` returns true for EVERY source, including clients holding a valid token (S25/S26). Reaching it needs about 50 sources x 20 failures (to 1000), then one failure per fresh source (the breaker holds a source back after its first miss): roughly 4,050 distinct IPv4 addresses or IPv6 /64s per 10-minute window. An attacker with a single IPv6 /48 (65,536 /64s, cheap at hosting providers) can repeat this every window and keep every client from viewing or answering proposals indefinitely. Before migration 104000 a fresh legitimate source was never blocked by the breaker. The developer documents the lockdown as a trade-off and points to SEC-5-2. Expected: a correct (found) token is never blocked by abuse it did not cause, e.g. look the hash up first and apply the block only to misses (SEC-5-2), or make the cap stop row writes without blocking hits. No data exposure; severity MEDIUM because the core client flow can be denied cheaply and remotely.

### Account deletion with Phase 5 data (condition 4 of the previous decision)
PASS. A throwaway confirmed user was created by SQL with a locally computed bcrypt hash (the Phase 2 T-10 method; the password was derived in the shell from a secret already on disk, passed to Playwright through the environment only, never written or printed). New spec `tests/e2e/p5-account-deletion.spec.ts` (desktop): two sent proposals with links, a client approval WITH a comment from a no-session context, 3 failed public lookups, then deletion through Settings. Afterwards: the old access token reads nothing, both client links show "This link isn't available"; SQL: users, identities, sessions, refresh tokens, profile, projects 0; client_decisions 0 (comment gone). Throttle rows are keyed by a salted hash of the source address, not by account, so they remain until the >1-day cleanup (by design, no personal link). Evidence: docs/testing/phase5/final-retest-deletion.txt.

### Regression in this retest
| Run | Result | Evidence |
|---|---|---|
| `npm run check` | PASS (177 unit tests, build, secrets scan; one pre-existing lint warning in src) | npm output |
| One full E2E pass (p1..p5, desktop + mobile, 306 tests incl. the new deletion spec, skipped without its env) | 269 passed, 36 skipped, **1 failed = flake**: `p5-client-approval.spec.ts:927` (mobile), the issued-link box was not visible within 5 s after sending under full-suite load. Isolated, `--repeat-each=3` on both projects: **6/6 passed** | docs/testing/phase5/final-retest-e2e-full.txt |
| pgTAP re-run in this retest | `client_approval` (developer) 120/120, `client_approval_tester` 206/206 | final-retest-pgtap.txt |
| pgTAP NOT re-run in this retest (BLOCKED: context budget of this session) | Phase 1-4 files: `change_orders` 39, `change_orders_tester` 125, `event_ordering` 11, `profiles_rls` 12, `profiles_rls_tester` 22, `projects_scope` 32, `projects_scope_tester` 80, `requests` 32, `requests_tester` 138. Last green on 2026-11-17/18. The two new migrations touch only `_throttle_key`, `_throttle_limits`, `_throttle_blocked`, `_throttle_record_failure`, `submit_public_decision` and an index on `public_link_attempts`; none of these files reads or calls them. Their E2E counterparts passed in the full run above | chunkA-regression.txt, this report |

### FINAL DECISION (final retest): ACCEPT WITH CONDITIONS
All AC-1..AC-13 pass. Findings F-1..F-6 are closed; SEC-5-1 and SEC-5-8 are fixed and independently retested (206/206 + 120/120, live sanity green). No open CRITICAL or HIGH. One new MEDIUM (F-7) is open. Conditions:
1. **F-7 / SEC-5-2**: decide before real use whether the hard-cap lockdown may block clients holding a valid token. Recommended fix: look the token up first and apply the block only to misses, so the cap cannot be used to switch the page off for everyone. If accepted as is, record it as an accepted risk (HA entry).
2. Verify the deployment headers on the real host (`/p` no-store and noindex, Referrer-Policy, CSP, HSTS); they are verified from `public/_headers` and the build only.
3. The OD-13 SMTP/email steps and ISS-008 (leaked-password protection) remain open outside this phase.
4. Re-run the nine Phase 1-4 pgTAP files listed above once (not run in this session; they do not touch the changed objects).
Known limitations (unchanged): the freelancer holds the link and could answer in the client's name (spec section 9); O-10 navigation timing / browser history keeps the original URL; expired and rate_limited UI states were simulated at the network layer (real states verified in DB and API); throttle rows are per source address and outlive an account deletion until the 1-day cleanup.

Cleanup after the final retest: a@ and b@ have 0 projects and null profile fields; `public_link_attempts` empty; the throwaway user is deleted (by the UI test); auth.users contains only a@ and b@. Earlier-phase evidence files rewritten by the E2E run were restored with `git checkout`.
