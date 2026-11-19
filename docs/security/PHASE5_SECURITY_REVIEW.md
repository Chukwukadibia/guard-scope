# Phase 5 Security Review: secret-link client approval

Reviewer: independent Security Reviewer (did not build or test the feature). Date: 2026-11-18.
Branch `feature/p5-client-approval`. Backend inspected: `guardscope-dev` (`eqozjuaaajstrewygqxr`), read-only.

## 1. Scope and method

Scope: the first unauthenticated surface: `get_public_proposal`, `submit_public_decision` (anon RPCs), `issue_approval_link` / `revoke_approval_link` (owner RPCs), the redefined `send_change_order_version` / `cancel_change_order_version`, tables `approval_links`, `client_decisions`, `public_link_config`, `public_link_attempts`, the SPA route `/p`, `public/_headers`, the PWA config, and the docs/data inventory.

Method:
- Source read of migrations `20261117100000`, `…101000`, `…102000`, ARCHITECTURE §4.2/§5/§9, FEATURE_SPEC, DEC-012..014, `src/features/public/*`, `publicProposal.ts`, `publicLink.ts`, `ApprovalLinkPanel.tsx`, `issueLink.ts`, `_headers`, `vite.config.ts`, the built `dist/`.
- Live catalog queries (read-only) on the dev project: function privileges (`has_function_privilege`), SECURITY DEFINER / `search_path`, table and column privileges, RLS flags and policy counts, role GUC settings, `pg_settings` logging parameters, security advisors.
- Live anon HTTP probes with the publishable key (key not printed).
- Tester's ACCEPTANCE_REPORT read; its claims spot-checked where I doubted them (below).
- Not done: no authenticated probes (no users may be created), no writes, no E2E, no deployed-header check (nothing is deployed to Cloudflare Pages yet), no load or concurrency tests of my own (I relied on the Tester's evidence plus code reasoning for locks).

Reviewer's side effect (disclosure): one probe I sent for timing (submit_public_decision with token `x`, two calls: 100 KB and 1 MB whitespace comment) passed validation and hit the invalid-token path, so it recorded 2 throttle failures against my egress source key in `public_link_attempts`. No other write was made. The probe also gave a useful measurement (SEC-5-8).

## 2. What I verified (evidence)

| # | Check | Result |
|---|---|---|
| V1 | Token generation: `extensions.gen_random_bytes(32)` (pgcrypto CSPRNG), base64url, 43 chars, 256 bits. Only `sha256(token)` stored (`bytea`, length check, unique). Raw token returned once from `issue_approval_link`, never inserted into events/summary. | OK |
| V2 | Lookup is by hash equality through a unique B-tree index on the hash of the supplied value. No comparison of the secret itself, so timing differences leak nothing useful. Invalid/malformed/not-found all return the identical `invalid` shape. Expired/revoked/superseded/cancelled/decided responses differ, but only for a holder of a real token (256-bit), so they are not an enumeration oracle. | OK |
| V3 | State precedence implemented as `_link_state` (after fix `…102000`) and matches BR-2 (invalid > superseded > cancelled > decided > revoked > expired > valid; "not latest" now before revoked/expired). Latest-version computation excludes drafts (F-1 fix). | OK |
| V4 | One decision per version: `unique(version_id)` plus status check under row locks; idempotency unique is `(link_id, key)` so a key cannot be replayed across links; replay needs the token; key replay returns the original decision only. Key guessing is pointless (UUID, scoped to a token-bound link). | OK |
| V5 | Locking: `submit` locks change_order then version; `issue`, `cancel`, `send`, `revoke` go through `_lock_change_order` (change_order first) then version. Consistent order, no cycle between the app functions. Residual: account-deletion cascade takes locks in FK order (INFO SEC-5-11). | OK |
| V6 | Privileges (live `has_function_privilege`): anon can execute exactly `get_public_proposal` and `submit_public_decision`. All `_link_state`, `_throttle_*`, `_lock_change_order`, `*_guard`, `handle_new_user` are not executable by anon/authenticated/public (the `…101000` fix is live). Owner RPCs executable by authenticated only. Every SECURITY DEFINER function has `search_path=""`; owner is `postgres`. All internal references schema-qualified (`extensions.digest`, `public.*`). | OK |
| V7 | Tables: RLS enabled on all four; no anon privileges on any public table (`has_table_privilege(anon, select,insert,update,delete)` false for all). `authenticated` has no write privilege on the new tables. Column grants on `approval_links` exclude `token_hash`; `client_decisions` excludes `idempotency_key`. Owner policy joins to `projects.owner_id = auth.uid()`. `public_link_*` have RLS and no policy and no grants (advisor INFO, intended). Anon REST probes: GET approval_links / client_decisions / public_link_config -> 401 `42501`; anon `_throttle_key` and `issue_approval_link` -> 401 `42501`. | OK |
| V8 | Immutability triggers: `approval_links_guard` (only revoked_at null -> value), `client_decisions_guard` (everything blocked) on update/delete. TRUNCATE not covered (privileged roles only). | OK, see SEC-5-4 |
| V9 | Projection (`get_public_proposal`): explicit `jsonb_build_object`, no `to_jsonb(row)`. Fields = BR-1 only. No owner id/email, no `client_contact`, no private request notes, no other versions, no comment, no link id/hash, no idempotency key. `display_name` is NULL by default (`handle_new_user` inserts only `id`), so no email fallback leak. Decided link returns decision + `decided_at` only, not the client comment. Unavailable states return only `freelancer_name`. Activity event for a client decision stores `has_comment` boolean only, `actor_id` null. | OK |
| V10 | Error bodies: all business outcomes are HTTP 200 JSON with fixed enum strings; no SQLERRM or id echoed. Anon `validation` probe returned `{"error":"validation"}` only. | OK |
| V11 | GUC bypass (`guardscope.account_deletion`): see SEC-5-4. Not reachable by API roles. `pg_catalog.set_config` is executable by anon/authenticated in SQL but is not exposed over PostgREST: live probe `POST /rest/v1/rpc/set_config` -> 404 PGRST202 (public schema only). The only public function using `set_config` is `delete_my_account` (fixed GUC name, value `on`, transaction-local, then `off`). No public function builds dynamic SQL (`EXECUTE`) (catalog scan of `prosrc`). Roles `anon`/`authenticated` carry only `statement_timeout` (3s / 8s) role settings. | Not exploitable |
| V12 | Client bundle: `dist/` scanned for `service_role`, `sb_secret`, JWT prefixes. Only hit is the string `sb_secret_` inside supabase-js's own "secret key in browser" guard. Publishable key only. | OK |
| V13 | XSS: no `dangerouslySetInnerHTML`/`innerHTML` anywhere in `src`; all proposal fields, comment, names rendered as React text nodes (`whitespace-pre-wrap`, no linkification). Owner view of comment is a `<blockquote>` text node. | OK |
| V14 | Token handling: read from fragment only if exactly 43 base64url chars, `history.replaceState` before any request, held in a module variable and React state, RPC via POST body, no storage, no console calls in `src`, `hashchange` handled (F-5 fix). `<meta name=referrer no-referrer>` and `Referrer-Policy: no-referrer`. | OK, residuals SEC-5-9 |
| V15 | Headers file: CSP `default-src 'self'; script-src 'self'; connect-src 'self' <supabase host>; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, `X-Frame-Options: DENY`, nosniff, `/p` and `/p/*` `Cache-Control: no-store` + `X-Robots-Tag: noindex, nofollow` (the Tester's O-11 is already fixed in the file). No third-party scripts, no analytics. `style-src 'self'` is satisfied by React CSSOM styles. | OK (config only; not verified deployed) |
| V16 | Service worker: shell precache only, `NetworkOnly` for `*.supabase.co`, no caching of RPC (POST anyway). `navigateFallback` serves the precached shell for `/p` (contains no per-link data). | OK |
| V17 | Link forwarding / dishonest freelancer / no identity: documented in spec §9 and PRD §11; wording scan of public copy and owner copy: no "signed/binding/certified/legally/paid". LINK-011 honoured in `src`. Status-changing action requires a confirm click and a POST, so link-preview bots and GET prefetch cannot record a decision. | OK |
| V18 | Advisors (security): only the documented INFO/WARN items; two anon SECURITY DEFINER WARNs are the two intended public RPCs. | OK |
| V19 | Statement logging: `log_parameter_max_length_on_error=0`, `log_statement=ddl`, `log_min_duration_statement=-1`: tokens passed as RPC parameters are not written to Postgres logs on error. | OK |
| V20 | Throttle key: `cf-connecting-ip` else the last `x-forwarded-for` entry (consistent with ARCHITECTURE §9 empirical test and the Tester's hash-match evidence); salt in a no-grant singleton table; hash is salted SHA-256; raw IP never stored. Not independently re-tested live (a live test needs invalid-token writes, which I was told not to do). | Accepted on Tester evidence |

## 3. Findings

No CRITICAL or HIGH findings.

| ID | Severity | Title |
|---|---|---|
| SEC-5-1 | MEDIUM | Throttle table: unbounded row growth, weak cleanup, IPv6 rotation |
| SEC-5-2 | LOW | Throttle blocks even valid-token requests; shared-IP lockout and breaker amplification |
| SEC-5-3 | LOW | Revoke and expiry do not apply once a link is decided |
| SEC-5-4 | INFO | Immutability bypass GUC: not exploitable today; harden |
| SEC-5-5 | LOW | DATA_INVENTORY not updated for Phase 5 data |
| SEC-5-6 | LOW | Phishing/abuse of the branded public page (sender-controlled text) |
| SEC-5-7 | LOW | HTTPS/HSTS not enforced by the repo; headers unverified in production |
| SEC-5-8 | LOW | Unthrottled CPU amplification on `submit_public_decision` validation path |
| SEC-5-9 | LOW | Token residue: module variable, Navigation Timing, browser/synced history |
| SEC-5-10 | LOW | Owner-side unbounded link issuance / event spam |
| SEC-5-11 | INFO | Decisions allowed on completed/archived projects; account-deletion lock order |
| SEC-5-12 | INFO | Bidi/control characters in the client comment |

### SEC-5-1 MEDIUM: throttle table growth and cleanup
- **Status: FIXED** in migration `20261117103000_throttle_hardening` (IPv6 /64 keying, `window_start` index, bounded cleanup per failure call) and `20261117104000_throttle_breaker_cap` (per-source rows and the 20 cap kept while global < hard cap 5000; at the hard cap no new rows and every source blocked until the window ends, a lockdown trade-off tied to SEC-5-2). ISS-027.
- Description: `_throttle_record_failure` inserts one row per `(source_key, 10-min window)` per failure. The source key is the full address, so an attacker rotating IPv6 addresses in one /64 (free, effectively unlimited) creates a new row and never hits the 20/window per-source cap. Cleanup runs only with probability 1% inside a failure call, and `delete ... where window_start < now() - 1 day` cannot use an index (`window_start` is the second PK column, there is no other index), so on a large table it is a seq scan under `anon`'s 3 s statement timeout: it can time out, rolling back that failure record and returning a 500. At low traffic cleanup may never run, so hashed-IP rows can outlive the "1 day" intent.
- Reproduction (not run, would write): send invalid 43-char tokens from many source addresses; every call adds ~100-150 bytes (row plus PK index). 100 req/s is roughly 1 GB/day.
- Impact: storage exhaustion of the database (free tier 500 MB makes the project read-only), degradation of the cleanup path, and the per-source throttle is ineffective against a multi-address attacker. The global row is a single hot row updated on every failure (serialises failures only; valid requests do not touch it).
- Fix: key IPv6 on the /64 (and IPv4 on the full address); add `create index on public_link_attempts (window_start)`; run cleanup on a schedule (pg_cron) or deterministically; once the global breaker is open, stop inserting new per-source rows (count only in the global row); consider a hard row cap.

### SEC-5-2 LOW: throttle semantics against legitimate clients
- **Status: FIXED** in migration `20261119100000_token_first_throttle` (HA-009 / DEC-015): the token is looked up first, a correct token is always served, and the per-source, breaker and hard-cap blocks apply only to failed lookups. ISS-029.
- Description: `_throttle_blocked` runs before any token check, so a blocked source gets `rate_limited` even for a correct token (Tester O-3 confirmed live). The global breaker (1000 failures per 10 min) blocks every source that has at least one failure in the window; 1000 failures is trivial with address rotation. Fixed 10-minute bins allow 40 failures across a boundary.
- Reproduction: from the same NAT/CGNAT or office egress as a client, send 20 invalid tokens; the client's valid link shows "Too many attempts" for up to 10 minutes. The breaker needs about 1000 failures in a window and then affects any user who had one earlier typo.
- Impact: availability of approvals for a targeted client; no confidentiality or integrity impact.
- Fix: look up the hash first and process a found token regardless of the block (possessing a 256-bit token proves no guessing); apply the block only to misses. This removes the lockout and keeps the anti-guessing purpose. Optionally make the breaker only slow the miss path.

### SEC-5-3 LOW: revocation and expiry ignored for decided links
- Description: precedence `decided` before `revoked`/`expired` (BR-2) means that after the client answers, `get_public_proposal` returns the full proposal projection (title, description, price, terms, client and freelancer names) for any holder of the token, forever, even after the owner clicked Revoke or after the 30-day expiry. `revoke_approval_link` on a decided version also sets `revoked_at` and writes a "revoked" event, giving the owner a false sense of having cut access. (Cascade on account deletion does remove it.)
- Impact: a leaked/forwarded link keeps exposing commercial terms indefinitely; "revoked" is not honest in the UI for decided versions.
- Fix: for read, apply revoked (and optionally expired) before decided and then return only the decision summary; or do not offer Revoke for decided versions and state in the UI that a recorded answer stays viewable via its link. Update BR-2 if the behaviour is intended.

### SEC-5-4 INFO: `guardscope.account_deletion` bypass
- Question asked: can an authenticated user make the immutability triggers pass?
- Analysis and evidence: the trigger checks `current_setting('guardscope.account_deletion', true) = 'on'`. Any SQL session can set a custom GUC, but API roles have no SQL access: PostgREST exposes only `public` (anon probe of `rpc/set_config` returned PGRST202), PostgREST itself only sets `request.*` GUCs, there is no public function with dynamic SQL, and the only `set_config('guardscope…')` caller is `delete_my_account` with fixed arguments and transaction scope. GraphQL has no mutation path to these tables (no privileges). So not exploitable by client-supplied headers, JWT claims or RPC arguments today. The Tester's O-5 (any SQL session, i.e. privileged roles, can set it) is correct and is service-role/superuser only.
- Residual risk is latent: one future exposed function, a newly exposed schema (e.g. `pg_catalog` or `extensions` via the Data API config) or a SQL-injection in any SECURITY DEFINER function would turn the flag into a universal bypass of the history guarantee.
- Hardening: in each guard require the flag AND a trusted caller, for example `and current_user not in ('anon','authenticated')` (cascade runs as the SECURITY DEFINER owner), or use a SECURITY DEFINER-set marker the invoker cannot forge, and add TRUNCATE triggers (or revoke TRUNCATE) on `client_decisions`, `approval_links`, `activity_events`. Add a pgTAP test that `set_config('guardscope.account_deletion','on',true)` as `authenticated` followed by a delete of a decision still fails once the role check is added.

### SEC-5-5 LOW: data protection documentation
- Description: `docs/security/DATA_INVENTORY.md` has no rows for `client_decisions.comment` (new free-text personal data written by a third party, up to 2000 chars, stored indefinitely and shown to the freelancer), `approval_links`, `public_link_attempts` (salted IP hashes, which are personal data while the salt exists; actual retention is probabilistic, see SEC-5-1) and `public_link_config.salt`. The change-proposals row says "owner only in Phase 4". Protocol §12 requires the inventory in the phase that adds data. The comment contains data of a person with no account and no notice; the public page tells the client "Your comment will be included" but gives no privacy statement, retention or contact.
- Deletion: cascade chain version -> link -> decision is declared `on delete cascade`, immutability bypass is flag-scoped to `delete_my_account` (Tester pgTAP #148-157 cover it). The client has no way to ask for erasure except through the freelancer. Also Supabase API/auth logs hold IPs (provider retention, already listed).
- Fix: add rows; add a short privacy line to the public page; state retention for throttle rows.

### SEC-5-6 LOW: phishing / abuse of the public page
- Description: anyone with an account (open signup) can place arbitrary text (display name up to 120 chars, project title, client name, descriptions, terms) on a branded page on the product's own domain, sent to a victim. Text is not linkified and there are no buttons that navigate away, which limits it to social engineering ("pay to account X"). The page has no sender-verification warning and no abuse report path.
- Fix: footer text on the public page ("GuardScope does not verify senders; approving is not a payment; never enter passwords or card details here"), an abuse contact, and an admin way to disable a link (service role only today).

### SEC-5-7 LOW: transport hardening
- Description: link secrecy relies on HTTPS (a MITM over http could read the fragment via injected script). `_headers` sets no `Strict-Transport-Security`; `VITE_APP_URL` (used to build the shared link) is unvalidated and is `http…` in `.env.local` (dev). `connect-src` is hard-coded to the dev project and must be edited by hand for production (the file says so). The deployed headers cannot be verified from this repo (the Tester also could not).
- Fix: enable Always-HTTPS and HSTS at Cloudflare (or add the header), refuse to build/shows a link when `VITE_APP_URL` is non-https and not localhost, and add a production deploy checklist step: fetch `/p` and assert the headers.

### SEC-5-8 LOW: CPU amplification before validation
- **Status: FIXED** (early length check) in migration `20261117103000_throttle_hardening`: raw comment length over 8000 characters is rejected before the trim regex. Counting validation errors toward the throttle is not implemented. ISS-028.
- Description: in `submit_public_decision` the comment is trimmed with `regexp_replace(..., '^\s+|\s+$', ...)` before the length check, and validation failures are neither throttled nor counted. Measured live (anon, whitespace-heavy comment): 100 KB total 0.8 s, 1 MB total 1.5 s round trip including the upload. The regex is linear-ish (no catastrophic backtracking), but PostgREST accepts multi-MB bodies, so each call costs DB CPU up to the 3 s timeout, unthrottled.
- Fix: reject `char_length(p_comment) > 4000` (or `octet_length`) before any regex, and count validation errors from anon toward the throttle (or add an early body-size check at the edge). A 1 MB `p_token` is cheap by comparison (length checked first; Tester measured 5 MB in 3.4 s mostly transport).

### SEC-5-9 LOW: token residue on the client
- The token stays in a module-level variable after the user navigates elsewhere in the SPA (re-entering `/p` without a hash reloads the old proposal). Navigation Timing `name` retains the original URL including the fragment for the life of the page (Tester O-10). The browser history store, and any synced history (e.g. Chrome Sync, Safari iCloud), may retain the full original URL with the fragment from before `replaceState` ran; the app cannot remove that. Any same-origin script could read these but CSP has `script-src 'self'` and no third-party scripts.
- Fix (cheap): clear the module variable on unmount of the public route; document the synced-history residual and keep expiry short (30 days is acceptable). Not exploitable without local/device or account access.

### SEC-5-10 LOW: owner-side unbounded rows
- `issue_approval_link` has no per-version or per-owner limit; each call revokes the previous link (rows are immutable and cannot be deleted except by account deletion) and writes an activity event. An authenticated user (open signup) can grow `approval_links` and `activity_events` without bound within the 8 s statement timeout per call. Tester's 200-issue test shows it works functionally.
- Fix: cap reissues per version per day or per owner per hour.

### SEC-5-11 INFO
- `submit_public_decision` and `_link_state` do not look at the project status; a client can answer a proposal on a `completed` or `archived` project (issuance requires `active`, BR-7 does not require auto-revocation). Decide whether archive/complete should revoke links.
- Account-deletion cascade locks rows in FK order while `submit` locks change_order -> version; a deadlock between a deletion and an in-flight submit is theoretically possible and would surface as a retryable `40P01` to one party. Race with deleted rows would raise an FK error (500), not data corruption.

### SEC-5-12 INFO
- The comment is rendered as text, so no XSS, but Unicode bidirectional overrides and control characters are stored and displayed to the freelancer and can visually reorder the text. Optional: strip bidi controls (U+202A-202E, U+2066-2069) on write.

## 4. Accepted residual risks (reviewed, acceptable for MVP)

1. Possession of the link is the only credential; the freelancer sees the raw link once and anyone who receives it can decide (spec §9, PRD §11). Wording is consistent (no "signed/binding"). The record proves that a response was made through the link, not by whom.
2. One decision per version; a wrong click cannot be undone by the client (owner must send a new version).
3. Throttle is best-effort (256-bit tokens are the real control); fixed-bin windows and shared-IP effects (subject to SEC-5-1/2 improvements).
4. Distinct `expired/revoked/superseded/cancelled/decided` responses for real-token holders; they reveal only freelancer display name or the BR-1 projection.
5. Privileged roles (service key, superuser) can TRUNCATE and set the bypass GUC; service key not exposed to clients (same pattern as Phases 2-4).
6. Pre-JS page shell is the same for every route; noindex is both a header (`/p`) and a runtime meta.
7. Supabase warnings: leaked-password protection off (Phase 1 item), SECURITY DEFINER advisor WARNs are intended.

## 5. Tester claims I doubted and checked

- "Anon only has the 2 public RPCs; internal helpers denied": confirmed from the live catalog (V6).
- "Raw token never readable": confirmed by column privileges and projection source (V7, V9).
- "No Cache-Control/noindex in `_headers` (O-11)": already corrected in the current file (V15).
- "Spoofed headers do not create new throttle keys": consistent with the code (last XFF/cf-connecting-ip); I did not re-run it live.
- "GUC bypass limited to privileged SQL sessions (O-5)": confirmed, with the latent-risk hardening in SEC-5-4.

## 6. Overall verdict

**Pass with conditions.** The core design is sound: strong random tokens stored only as hashes, an explicit minimal projection, correct privilege model (verified live), atomic one-decision-per-version with consistent lock order, no XSS sink, token never leaves the fragment/POST body, and the immutability bypass is not reachable from the Data API. No CRITICAL/HIGH issues.

Conditions before a public production launch:
1. Fix SEC-5-1 (throttle storage/cleanup/IPv6 keying) and SEC-5-8 (early length check), both small SQL changes.
2. Decide and implement or document SEC-5-3 (revocation after decision).
3. Update DATA_INVENTORY and add a privacy/sender-verification line to the public page (SEC-5-5, SEC-5-6).
4. Production deploy checklist: HTTPS/HSTS, production `connect-src`, verify headers on `/p` (SEC-5-7).
5. Recommended hardening: SEC-5-2 (valid token bypasses block), SEC-5-4 (role check in guards plus TRUNCATE protection).
