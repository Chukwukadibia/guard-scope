# Phase 1 — Authentication & App Shell — Acceptance Report

**Tester run mode:** separate general-purpose subagent, fresh context, resumed an interrupted run
**Commit tested:** `9bf2cfa` (product code). `git diff 9bf2cfa -- src supabase public index.html vite.config.ts package.json` is empty at HEAD `9d474dd`; later commits add docs/tests only.
**Backend:** Supabase `guardscope-dev` (`eqozjuaaajstrewygqxr`) · **Date:** 2026-11-16
**Evidence folder:** `docs/testing/phase1/`

## Evidence files
| File | Content | Run by |
|---|---|---|
| `unit-tests.log` | Vitest 22/22 | interrupted run (spot-checked) |
| `lint-typecheck.log` | eslint + tsc, exit 0 | interrupted run (spot-checked) |
| `pgtap-profiles_rls.tap` | implementer pgTAP 12/12 | interrupted run (spot-checked) |
| `pgtap-profiles_rls_tester.tap` | tester pgTAP 22/22 (`tests/db/profiles_rls_tester.test.sql`) | interrupted run (spot-checked) |
| `api-T09-rls-curl.log` | PostgREST with A/B/anon/tampered JWTs | interrupted run (spot-checked) |
| `api-auth-server-behaviour.log` | T-15 / BR-1 / BR-2 against `/auth/v1` | interrupted run (spot-checked) |
| `e2e-run.log` | Playwright, desktop 1280 + mobile 375: **63 passed, 4 failed, 9 skipped** (skips = deliberate desktop-only for rate-limited/mutating tests) | this run |
| `axe/*.json` | axe-core per page/viewport (21 files) | this run |
| `screenshots/*.png` | 24 screenshots | this run |
| `supabase-edge-logs-and-cleanup.log` | auth edge logs for signup/recover, bundle-secret check, advisors, cleanup | this run |

E2E command: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e -- --trace off --reporter=list --workers=2` (`--workers=2` added to stay under auth rate limits; `TESTER_PW` exported only in the shell for the T-02 unconfirmed fixture, never written to a file).

## Acceptance criteria
| Criterion | Result | Evidence |
|---|---|---|
| AC-1 register → confirm → sign in → Dashboard | **BLOCKED** (OD-13) | Register form submits and shows "Check your email" (`e2e-run.log`, `screenshots/desktop-T15-register-new.png`), but the server returned 400 for a new non-team address and created no user (`supabase-edge-logs-and-cleanup.log`). Confirmation email cannot be delivered. Sign-in → Dashboard for a confirmed user passes (T-03, T-04, T-18). |
| AC-2 sign out, then protected pages redirect | PASS | T-03 (`e2e-run.log`, `screenshots/*-T03-signed-out.png`) |
| AC-3 guard, `next`, no flash, no open redirect | PASS | T-04 (MutationObserver saw no protected DOM), T-05 (`unit-tests.log`), off-site `//evil.example` ignored (`e2e-run.log`) |
| AC-4 expired/invalid session → message | **FAIL** (partial) | Tampered token PASS; expired + invalid refresh PASS; **token removed → redirect but no message** (D-2) (`e2e-run.log` failures 1 and 3) |
| AC-5 profile row by trigger | PASS | `pgtap-profiles_rls.tap` #1, `pgtap-profiles_rls_tester.tap` #1; every user in `auth.users` had a profile before cleanup |
| AC-6 A cannot read/update/delete B; anon no access | PASS | `pgtap-profiles_rls_tester.tap` #6–#21, `api-T09-rls-curl.log` |
| AC-7 no password columns; no service key in bundle | PASS | `pgtap-profiles_rls_tester.tap` #3; `npm run check:secrets` clean (`supabase-edge-logs-and-cleanup.log`) |
| AC-8 settings persist; validation errors | PASS | T-11, T-12 (`e2e-run.log`, `screenshots/desktop-T11-settings-saved.png`, `*-T12-name-too-long.png`). See D-1 for the §6 summary gap |
| AC-9 375/1280, no overflow, keyboard nav | PASS | T-13 (`e2e-run.log`, `screenshots/*-AC09-nav.png`, `*-T13-skip-link-focus.png`) |
| AC-10 axe 0 serious/critical, focus, labels, headings | PASS | T-14: `axe/*.json` — **0 violations of any impact** on all 9 pages × 2 viewports + 3 mobile menu-open states |
| AC-11 no account enumeration | PASS | T-15 API + UI (`api-auth-server-behaviour.log`, `e2e-run.log` "register outcomes") |
| AC-12 empty states, no dead actions | PASS | T-16 (`screenshots/*-T16-*.png`) |
| AC-13 password reset email + new password | **BLOCKED** (OD-13, redirect URLs pending) | Request UI passes and is neutral (T-20 UI part); email cannot be delivered, so setting a new password from the link is untested |

## Test scenarios
| ID | Result | Evidence |
|---|---|---|
| T-01 | BLOCKED (OD-13) | UI part PASS (form → "Check your email"); server 400 / no user for new address; no mail catcher |
| T-02 | PASS | API `email_not_confirmed` (`api-auth-server-behaviour.log`); UI shows "Please confirm your email address first. Check your inbox for the link." and stays on sign-in (`screenshots/desktop-T02-unconfirmed.png`). Wording differs from BR-2 (D-4) |
| T-03 | PASS | `e2e-run.log` (desktop + mobile), stored session removed |
| T-04 | PASS | `e2e-run.log`: `/`, `/projects`, `/settings` → `/sign-in?next=…`, no protected DOM; returns to `/projects` after sign-in |
| T-05 | PASS | `unit-tests.log` (safeNext 10 cases) |
| T-06 | **FAIL** (partial) | tampered + expired cases PASS; token-removed case FAIL (D-2) |
| T-07 | PASS | pgTAP |
| T-08 | PASS | pgTAP 12/12 + 22/22 |
| T-09 | PASS | `api-T09-rls-curl.log` (A→B GET `[]`, PATCH denied; anon 401) |
| T-10 | PASS | pgTAP #3; `check:secrets` clean |
| T-11 | PASS | EUR + name persist after reload; currency started "Not set"; profile reset to null afterwards |
| T-12 | PASS | 121-char name and unknown currency give field errors linked by `aria-describedby`, no PATCH sent. §6 "summarised on submit" check FAILS separately (D-1) |
| T-13 | PASS | no overflow on 9 pages × 2 viewports; keyboard nav incl. mobile menu; skip link first; `:focus-visible` outline |
| T-14 | PASS | `axe/*.json` (sign-in, register, forgot-password, reset-password, dashboard, projects, settings, /p, 404) |
| T-15 | PASS | API identical `invalid_credentials`; UI identical "Email or password is incorrect." for existing vs unknown email; register existing vs new identical outcome |
| T-16 | PASS | "No projects yet" / "Projects will appear here"; no buttons in `main`, no dead links |
| T-17 | PASS | offline banner + disabled submit on sign-in, register, forgot-password, settings; re-enabled when online |
| T-18 | PASS | double-click Sign in → exactly 1 password-grant POST |
| T-19 | PASS | sign out in tab 1 → tab 2 on `/settings` redirected to `/sign-in?next=%2Fsettings` with no action |
| T-20 | BLOCKED (OD-13) | UI part PASS: identical neutral message for unknown vs registered email; `/reset-password` without session shows "Reset link not valid" |
| §6 error summary on submit | **FAIL** | D-1 |
| BR-1 server minimum 8 | **FAIL** (config pending) | D-3 (`api-auth-server-behaviour.log`); client-side rule PASS (7 chars → field error, no request) |

## Defects raised
**D-1 — Validation errors are not summarised on submit (§6). Suggested severity: Low–Medium (accessibility).**
Steps: sign in, open `/settings`, enter 121 characters in "Display or business name", click Save settings.
Expected (§6): field error with `aria-describedby` **and** a summary on submit (alert/status region). Actual: only the inline field message appears; no alert/status summary; focus is not moved. The same pattern applies to sign-in, register and forgot-password forms (field errors only). Test: `settings-and-empty-states.spec.ts` "§6: validation errors are summarised on submit" (desktop + mobile).

**D-2 — Removed session token: redirect without the "session has ended" message (AC-4). Suggested severity: Low.**
Steps: sign in, open `/settings`, delete the `sb-eqozjuaaajstrewygqxr-auth-token` localStorage entry, reload.
Expected (AC-4, "token removed or tampered"): redirect to sign-in with "Your session has ended. Please sign in again." Actual: redirect to `/sign-in?next=%2Fsettings` with no message (the app only detects a lost session if a token was still stored at startup). Tampered and expired tokens do show the message. Fix in the app (e.g. a non-secret "had session" marker), or the spec owner clarifies AC-4.

**D-3 — Server accepts 7-character passwords (BR-1). Suggested severity: Medium (must be fixed before release; configuration, not code).**
Steps: `PUT /auth/v1/user` with a 7-character password as a signed-in user. Expected: rejected (minimum 8). Actual: HTTP 200; the server minimum is still 6 (5 chars → 422 `weak_password`). The UI enforces 8, but the API can be called directly. Cause: the pending supervisor dashboard setting in `docs/deployment/SUPABASE_SETTINGS.md`.

**D-4 — BR-2 message wording differs. Suggested severity: Low (cosmetic).**
Expected: "Check your email to confirm your account". Actual: "Please confirm your email address first. Check your inbox for the link." Same meaning and no enumeration; the spec owner can accept the wording or the copy can be changed.

## Observations (not defects)
- Security advisor: 1 WARN `auth_leaked_password_protection` (Leaked Password Protection Disabled; dashboard setting, may need a paid plan). No RLS, `security definer` or `search_path` findings.
- Because of the uniform-outcome design, a signup that fails server-side (here, the SMTP refusal) shows the user the same "Check your email" message. This is intended by AC-11, but it will hide real delivery failures until OD-13 is resolved.
- `public/_headers` sets `Referrer-Policy: no-referrer`, CSP with `frame-ancestors 'none'`, `nosniff` (reviewed, not served by `vite preview`).

## Blocked items
- T-01 / AC-1 and T-20 / AC-13 email steps: **BLOCKED by OD-13** (the default SMTP only sends to org team members; new-address signup and recovery for `a@` returned 400) and by the pending Site URL / Redirect URL settings.

## Tester changes
- Reviewed `tests/e2e/helpers.ts`, `auth-guard.spec.ts`, `layout-a11y.spec.ts`, `settings-and-empty-states.spec.ts`: found them correct and meaningful; no changes needed. The two failures are product defects, not test errors; the tests were not weakened.
- Added `tests/e2e/session-and-auth-ui.spec.ts` (T-17, T-18, T-19, BR-1 client rule, UI parts of T-01/T-02/T-15/T-20).

## Cleanup confirmation
Deleted dev users `t-pwlen@`, `t-unconfirmed@` (and `t-e2e-new@`, which was never created). User A's profile was left with display_name/default_currency null. Final `select email from auth.users`:
```
a@guardscope.test
b@guardscope.test
```
Removed scratch files `tester.env`, `pw7.json`, `pgtap.sql` from the parent scratchpad folder. Nothing was committed; `src/` and `supabase/` were not modified.

## Decision
**Not accepted yet.** Core security (RLS, route guard, no enumeration, no secrets) and accessibility pass. Before acceptance: fix or waive D-1 and D-2, apply the BR-1 dashboard setting (D-3) and re-run the BR-1 check, decide on the D-4 wording, and re-run T-01/T-20 once OD-13 and the URL settings are resolved.

---

# Retest 1 (commit 006c7da)

**Tester run mode:** independent general-purpose subagent, fresh context · **Date:** 2026-11-16 · **Backend:** `guardscope-dev` (`eqozjuaaajstrewygqxr`)
**Product change reviewed:** `git diff 1e2a34c 006c7da -- src` (ErrorSummary + stable field ids; `guardscope.hadSession` marker; BR-2 copy). Tooling diff (`tests eslint.config.js .prettierignore`) reviewed: E2E changes are formatting only; the `react-hooks/rules-of-hooks` override is scoped to `tests/e2e/**/*.ts` (Playwright `use()` false positive); `.prettierignore` only adds `docs/testing`. No assertion was weakened by those changes.

## Retest evidence
| File | Content |
|---|---|
| `check-retest1.log` | `npm run check`: format, lint, typecheck, unit **33/33**, build, `check:secrets` clean. Exit 0 |
| `e2e-run-retest1.log` | Full E2E, 1280 + 375: **89 passed, 4 failed, 9 skipped** (skips = deliberate desktop-only) |
| `e2e-run-retest1-rerun.log` | Re-run after the BR-1 client test locator fix + T-02: 3 passed, 1 skipped (mobile, by design) |
| `axe-retest1/*.json` | axe with the **error summary visible**: sign-in, register, forgot-password, reset-password, settings × 1280/375 = 10 scans, **0 violations of any impact** |
| `axe/*.json` | regression: 21 scans regenerated, all still 0 violations (files byte-identical to the committed ones) |
| `screenshots/*-R1-*-summary.png` | 10 screenshots of the summary state |
| `api-retest1-br1-br2.log` | BR-1 server check (7 → 422, 8 → 200) and BR-2 API (`email_not_confirmed`) |
| `supabase-retest1-email-rate-limit.log` | edge logs for the T-15/T-20 failures (D-5), advisors, cleanup |

E2E command: `set -a && . ./.env.test.local && set +a && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e -- --trace off --workers=2 --reporter=list` (with `TESTER_PW` for an SQL-created unconfirmed fixture, shell only, never written to the repo).

## Defect status
| Defect | Verdict | Evidence |
|---|---|---|
| D-1 / ISS-003 §6 error summary | **Verified fixed** | On all five forms, 1280 and 375: a `role="alert"` box headed "There is a problem" appears on failed submit, takes focus, is re-focused on each failed submit, lists errors in form order as links to `#fieldId`; Tab → first link, Enter → the field receives focus; inline errors remain, `aria-invalid` + `aria-describedby` intact; no request sent; summary removed after a valid resubmit. Heading order valid (h2 on auth pages, h3 under Settings h2). axe 0 violations with the summary visible. Tests: `retest1-error-summary-a11y.spec.ts`, `debug-d1-d2-regression.spec.ts`, `settings-and-empty-states.spec.ts` §6 |
| D-2 / ISS-004 removed token → message | **Verified fixed** | `auth-guard.spec.ts` "stored token removed, then reload" passes at 1280 and 375; first-time visitor sees no message; marker holds only `"1"` (no token/PII) and is cleared after it is reported, so a later fresh visit shows no message; deliberate sign-out still shows "You've signed out." (T-03), T-19 multi-tab still passes |
| D-3 / ISS-005 BR-1 server minimum | **Verified fixed (config applied)** | `PUT /auth/v1/user` with a throwaway user: 7 chars → **422 `weak_password` "Password should be at least 8 characters."**; 8 chars → 200. User A's password was not touched. ISS-005 can be closed by the owner |
| D-4 / ISS-006 BR-2 wording | **Verified fixed** | UI (T-02, desktop, real unconfirmed user): "Check your email to confirm your account, then sign in." Test strengthened to assert the BR-2 sentence. Server still returns `email_not_confirmed` |

### The 6 settings failures reported by the developer
Test locator issue, not a product problem. The GOV.UK error-summary pattern intentionally repeats each inline message as a summary link; a page-wide `getByText` then matches two elements (strict mode). Duplicated text is acceptable for accessibility: the summary is a separate landmark-like alert with its own heading, links have unique targets, and axe reports nothing. The same issue affected the BR-1 client-side test (`session-and-auth-ui.spec.ts`), which the developer did not list. Fix: the inline error is now located **through the field's own `aria-describedby` ids** (settings) or the `*-err` inline element (BR-1), with `toHaveCount(1)` and the existing `aria-invalid`/`aria-describedby` assertions kept. Assertion strength is unchanged or stronger.

### `state.ended` survives a reload of the sign-in page
Not a defect against the spec. AC-4 requires the message on the redirect; it does not require it to disappear on reload, and after a reload the user still has no session, so the statement remains true. It disappears on any fresh navigation, after a successful sign-in, and is suppressed after a deliberate sign-out. Recorded as an observation (cosmetic, optional: clear the history state after first render).

## New defect
**D-5 — Email-send rate limit reveals whether an email is registered (AC-11 / BR-5). Suggested severity: Medium (security; conditional).**
Steps: exhaust the project's email-send quota (small on the default SMTP; any visitor can trigger sends), then (a) register a new address vs an existing address, and (b) request a reset for an unknown vs a registered address.
Expected (AC-11): identical outcomes. Actual (edge logs, `supabase-retest1-email-rate-limit.log`): only requests that would send an email get **429 `over_email_send_rate_limit`**; the others get 200. The UI maps 429 to "Too many attempts. Please wait a minute and try again." while the other case shows the neutral "Check your email" / "If an account exists…" message, so the visible outcome differs by registration state.
Failing tests: `session-and-auth-ui.spec.ts` T-15 "registering an already-registered email…" and T-20 "forgot-password shows the same neutral confirmation…" (desktop). Not introduced by 006c7da (the 429 mapping predates it; in the first run SMTP 400s happened to map to the neutral message). Suggested fix: on `signUp` and `resetPasswordForEmail`, treat `over_email_send_rate_limit` like success (neutral outcome), keep the rate-limit message only for sign-in; plus custom SMTP/higher quota and CAPTCHA when OD-13 is resolved. Owner decision needed.

## Retest acceptance criteria
| Criterion | Result | Change vs first run |
|---|---|---|
| AC-1 register → confirm → sign in | **BLOCKED** (OD-13) | unchanged; this run the new-address signup got 429 (D-5) instead of SMTP 400 |
| AC-2 sign out → redirect | PASS | — |
| AC-3 guard / `next` / no open redirect | PASS | — |
| AC-4 expired/invalid session message | **PASS** | was FAIL (D-2 fixed) |
| AC-5 profile by trigger | PASS | SQL fixtures got profiles automatically this run as well |
| AC-6 RLS isolation | PASS (not re-run; no `supabase/` change since `9bf2cfa`) | — |
| AC-7 no passwords / no service key in bundle | PASS | `check:secrets` clean on the new build |
| AC-8 settings persist + validation | PASS | T-11, T-12 (locators scoped) |
| AC-9 375/1280, keyboard nav | PASS | — |
| AC-10 axe / focus / labels / headings | PASS | 0 violations incl. 10 new summary-visible scans |
| AC-11 no account enumeration | **FAIL** (D-5) | was PASS; password-grant messages still identical (T-15 sign-in PASS) |
| AC-12 empty states | PASS | — |
| AC-13 password reset | **BLOCKED** (OD-13) | — |
| §6 error summary | **PASS** | was FAIL (D-1 fixed) |
| BR-1 server minimum 8 | **PASS** | was FAIL (D-3; dashboard setting now applied) |
| BR-2 wording | **PASS** | D-4 fixed |
| T-02 | PASS · T-06 PASS · T-12 PASS · T-15 sign-in PASS / register FAIL (D-5) · T-20 UI FAIL (D-5) | |

## Tester changes (retest 1)
- `tests/e2e/settings-and-empty-states.spec.ts`: `inlineError()` helper locates the inline error via the field's `aria-describedby`; used in the two T-12 tests and the §6 test.
- `tests/e2e/session-and-auth-ui.spec.ts`: BR-1 client test locator scoped to the inline `*-err` element; T-02 now also asserts the exact BR-2 sentence.
- Added `tests/e2e/retest1-error-summary-a11y.spec.ts` (summary focus, links, keyboard, form order, removal, heading order, overflow, axe at 1280/375 on all five forms).
- `src/` and `supabase/` not modified. Nothing committed.

## Cleanup (retest 1)
Temporary SQL fixtures `t-unconfirmed@` and `t-pwlen@` deleted (no `t-e2e-new@`/`valid-r1@` row was ever created). Final `auth.users`: `a@guardscope.test`, `b@guardscope.test`; both profiles have `display_name` and `default_currency` null. Scratch files removed. Security advisor unchanged (1 WARN, leaked password protection).

## Decision (retest 1)
**Not accepted yet.** D-1, D-2, D-3 and D-4 are verified fixed and no regressions were found. Remaining before acceptance: decide and fix **D-5** (AC-11 enumeration through the email rate limit), then re-run T-15/T-20 once the email quota resets; AC-1/T-01 and AC-13/T-20 email steps remain **BLOCKED by OD-13** and the Site/Redirect URL settings.

---

# Retest 2 (commit 808f64c)

**Tester run mode:** independent general-purpose subagent, fresh context · **Date:** 2026-11-16 · **Backend:** `guardscope-dev` (`eqozjuaaajstrewygqxr`)
**Product change reviewed:** `git diff 4b64f14 808f64c` — `src/lib/api/auth.ts` (`isTransportFailure()`; `signUp` throws only `network` and `weak_password`; `requestPasswordReset` throws only `network`), new `tests/unit/authEnumeration.test.ts`, ISSUES_REGISTER line. No other `src/` or `supabase/` change.

## Retest 2 evidence
| File | Content |
|---|---|
| `check-retest2.log` | `npm run check`: format, lint, typecheck, unit **50/50** (7 files), build, `check:secrets` clean. Exit 0 |
| `unit-retest2-mutation-prefix.log` | the new unit tests run against the **pre-fix** `auth.ts` (scratch copy): **8 failed / 9 passed** — the 429 and 5xx cases catch the old bug |
| `e2e-retest2-d5-mocked.log` | tester spec `retest2-d5-enumeration.spec.ts`, network mocked with `page.route`, 1280 + 375: **8 passed** (2 live tests skipped here by design) |
| `e2e-retest2-d5-mutation-prefix.log` | the same mocked spec against a build with the **pre-fix** `auth.ts`: both server-answer tests **fail**, so the spec detects D-5 |
| `e2e-retest2-d5-live.log` | live D-5 check (desktop, run once with `R2_LIVE=1`): real status per call + UI outcome |
| `api-retest2-d5-weakpw.log` | `/auth/v1/settings`; signup with a 7-character password for registered vs unregistered address |
| `e2e-run-retest2.log` | full E2E regression, 1280 + 375: **101 passed, 0 failed, 11 skipped** |
| `supabase-retest2-edge-logs-and-cleanup.log` | edge-log statuses for every signup/recover call, advisors, cleanup |
| `screenshots/*-R2-*.png` | live register/forgot outcomes (new vs existing), mocked 429 forgot outcome |

Skipped (11): 9 deliberate desktop-only rate-limited/mutating tests on mobile (as before) + the 2 `R2_LIVE` tests (they ran once, separately, see `e2e-retest2-d5-live.log`).

## Code and unit-test review
- `isTransportFailure()` is correct for supabase-js 2.119 (`auth-js` `handleError`): a request with no HTTP response becomes `AuthRetryableFetchError(…, 0)` → `network`; real 500–530 responses become `AuthRetryableFetchError(…, status)` with `status > 0` → neutral; 4xx with a non-JSON body becomes `AuthUnknownError` → neutral. `navigator.onLine === false` maps to `network` only when no response arrived (status 0). Nothing that reaches the server can produce a registration-dependent difference.
- `weak_password` is thrown before the user lookup: **verified live** — 7-character password gives byte-identical `422 weak_password "Password should be at least 8 characters."` for `a@` (registered) and an unregistered address.
- `signIn` unchanged: T-15 sign-in still identical `Email or password is incorrect.` for existing vs unknown email.
- Unit tests are meaningful: they use the real `AuthApiError` / `AuthRetryableFetchError` classes and the real `auth.ts`; only the supabase client is mocked. Mutation check proves they fail on the pre-fix code. Limitation: they bypass the wire-format parsing (`handleError`); this gap is covered by the tester's Playwright route mocks (real supabase-js parses mocked 429/500/502/422/400 responses) and by the live run. The unit `weak_password` case uses `AuthApiError` rather than `AuthWeakPasswordError`; harmless, as both carry `code: 'weak_password'` and the E2E mock exercises the real class.
- Accepted trade-off (documented in code): a genuinely rate-limited or SMTP-failing user sees the neutral message, not a rate-limit hint. This is what AC-11 requires; it continues to hide delivery failures until OD-13 (observation from the first run).

## D-5 / ISS-007 verdict: **Verified fixed**
- **Live, D-5 condition present:** the email-send quota was exhausted throughout the retest. Edge logs: register new → **429**, register existing → 200; forgot unknown → 200, forgot registered → **429** (both in the R2 live spec and again in the full run T-15/T-20). In every case the UI was **identical** for both addresses: "Check your email — If this email can be registered, we've sent a link…" and "If an account exists for that email, we've sent a link to reset the password."
- **Mocked (1280 + 375):** for register and forgot-password, 429 `over_email_send_rate_limit`, 500 JSON, 502 non-JSON, 422 `user_already_exists`, 400 `email_address_not_authorized` each give exactly the same page text as a mocked 200, for both a@ and an unregistered address. `weak_password` (422) shows the strong-password message and a transport failure (aborted request) shows the connection message — identically for both addresses.
- Previously failing T-15 register and T-20 tests now pass in the full run.

## New defects
None.

## Retest 2 acceptance criteria
| Criterion | Result | Evidence / note |
|---|---|---|
| AC-1 register → confirm → sign in | **BLOCKED** (OD-13) | register UI PASS; no email can be delivered (429 / team-only SMTP); sign-in → Dashboard PASS |
| AC-2 sign out → redirect | PASS | T-03, full run |
| AC-3 guard / `next` / no open redirect | PASS | T-04, T-05 |
| AC-4 expired/invalid/removed session message | PASS | `auth-guard.spec.ts`, 1280 + 375 |
| AC-5 profile by trigger | PASS | SQL fixture got its profile row automatically; pgTAP unchanged (no `supabase/` change) |
| AC-6 RLS isolation | PASS (not re-run; no `supabase/` change since `9bf2cfa`) | |
| AC-7 no passwords / no service key | PASS | `check:secrets` clean |
| AC-8 settings persist + validation | PASS | T-11, T-12, §6 |
| AC-9 375/1280, keyboard nav | PASS | |
| AC-10 axe / focus / labels / headings | PASS | axe specs in full run, 0 serious/critical |
| AC-11 no account enumeration | **PASS** | was FAIL (D-5 fixed): live + mocked, sign-in + register + forgot-password |
| AC-12 empty states | PASS | |
| AC-13 password reset | **BLOCKED** (OD-13 + URL settings) | request UI PASS and neutral; set-new-password from link untested |
| §6 error summary | PASS | |
| BR-1 server minimum 8 | PASS | 7 chars → 422 `weak_password` (signup, this run) |
| BR-2 wording | PASS | T-02 |
| BR-5 generic messages | PASS | as AC-11 |

## Retest 2 test scenarios
| ID | Result |
|---|---|
| T-01 | BLOCKED (OD-13) — UI part PASS |
| T-02 | PASS (BR-2 sentence asserted; SQL fixture) |
| T-03 | PASS |
| T-04 | PASS |
| T-05 | PASS (unit) |
| T-06 | PASS |
| T-07 | PASS (no DB change; pgTAP evidence from earlier runs) |
| T-08 | PASS (no DB change; pgTAP evidence from earlier runs) |
| T-09 | PASS (no DB change; `api-T09-rls-curl.log`) |
| T-10 | PASS |
| T-11 | PASS |
| T-12 | PASS |
| T-13 | PASS |
| T-14 | PASS |
| T-15 | **PASS** (sign-in, register; with the email limit exhausted) |
| T-16 | PASS |
| T-17 | PASS |
| T-18 | PASS |
| T-19 | PASS |
| T-20 | BLOCKED (OD-13) — request UI part **PASS** (was FAIL in retest 1) |

## Site / Redirect URL settings
`GET /auth/v1/settings` does not expose the Site URL or Redirect URLs, so they could not be verified. **Still pending** (supervisor dashboard setting, `docs/deployment/SUPABASE_SETTINGS.md`).

## Tester changes (retest 2)
- Added `tests/e2e/retest2-d5-enumeration.spec.ts` (mocked 429/5xx/4xx/weak_password/transport answers for register and forgot-password at 1280 + 375; live check gated by `R2_LIVE=1`). No existing test was changed or weakened.
- `src/` and `supabase/` not modified. Nothing committed.

## Cleanup (retest 2)
Temporary fixture `t-unconfirmed@guardscope.test` deleted; no user was created by any signup call. Final `auth.users`: `a@guardscope.test`, `b@guardscope.test`; both profiles have `display_name` and `default_currency` null. Throwaway fixture password file deleted; no password appears in any log. Security advisor unchanged (1 WARN, leaked password protection).

## Final acceptance decision
**Accepted, with BLOCKED items.** Every acceptance criterion passes except the email-delivery-dependent steps: AC-1 / T-01 (confirmation email) and AC-13 / T-20 (reset email and setting a new password from the link) remain **BLOCKED by OD-13** (default SMTP: team-only recipients and a tiny send quota) and the pending Site URL / Redirect URL settings. Re-run T-01 and T-20 end to end once custom SMTP and the URLs are configured. Observation carried forward: enable Leaked Password Protection if the plan allows; consider CAPTCHA on signup/recover with OD-13.
