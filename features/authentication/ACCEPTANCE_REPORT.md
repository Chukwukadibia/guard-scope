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
