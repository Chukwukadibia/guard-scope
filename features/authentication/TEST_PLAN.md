# Phase 1 — Authentication & App Shell — Test Plan

**Version:** 0.1 · **Status:** APPROVED (HA-002) · **Spec:** FEATURE_SPEC v0.1 · **Executed by:** Tester Specialist in a separate subagent/session from the implementers.

## 1. Environments & fixtures
- Local: `supabase start` (Docker) + `npm run dev`. Fallback if Docker is unavailable: an approved dev Supabase cloud project (R-14).
- Browsers: Playwright Chromium (desktop 1280×800, mobile 375×812). WebKit/Firefox are optional in Phase 1.
- Fixtures: synthetic users `a@test.invalid` and `b@test.invalid`, created via the auth admin API in a test setup script (dev only, service key held in local env, never committed). No real personal data.

## 2. Scenarios

| ID | AC | Type | Steps | Expected |
|---|---|---|---|---|
| T-01 | AC-1 | E2E | Register a new email; confirm via local mail catcher; sign in | Lands on Dashboard |
| T-02 | AC-1, BR-2 | E2E | Sign in before confirming | Blocked with the confirm-email message |
| T-03 | AC-2 | E2E | Sign out; visit `/settings` | Redirect to `/sign-in` |
| T-04 | AC-3 | E2E | Signed out, visit `/projects` | Redirect to `/sign-in?next=%2Fprojects`; after sign-in, on `/projects`; no protected DOM rendered before redirect |
| T-05 | AC-3 | Unit | `safeNext()` with `//evil.com`, `https://evil.com`, `/\evil`, `javascript:` | All fall back to `/` |
| T-06 | AC-4 | E2E | Signed in, corrupt the stored session token, reload/navigate | Redirect with the "session has ended" message |
| T-07 | AC-5 | DB (pgTAP) | Insert into `auth.users` | Matching `profiles` row exists |
| T-08 | AC-6 | DB (pgTAP) | As A: select/update B's profile; as anon: select profiles; as A: insert/delete a profile | 0 rows / permission denied in every case |
| T-09 | AC-6 | API | `curl` PostgREST with A's JWT for `profiles?id=eq.<B>` | `[]` |
| T-10 | AC-7 | Static | Query `information_schema.columns` in `public` for `%password%`; `grep -r` service key patterns in `dist/` | None found |
| T-11 | AC-8 | E2E | Set name and currency (EUR), reload | Values persist; currency was empty before |
| T-12 | AC-8 | Unit/E2E | Name of 121 characters; currency not in list | Field errors with `aria-describedby` |
| T-13 | AC-9 | E2E | 375 px and 1280 px: every page, check `scrollWidth <= clientWidth`; operate nav with keyboard only | No overflow; nav fully operable |
| T-14 | AC-10 | a11y | axe on sign-in, register, dashboard, projects, settings, /p | 0 serious/critical |
| T-15 | AC-11 | E2E | Register with an existing email; sign in with a wrong password for existing and non-existing emails | Identical generic messages |
| T-16 | AC-12 | E2E | New user's Dashboard and Projects | Empty states; no dead buttons |
| T-17 | §6 | E2E | Offline (Playwright `setOffline`) on the sign-in page | Offline banner; submit disabled |
| T-18 | §6 | E2E | Double-click sign in | One request (network log) |
| T-19 | §6 | E2E | Two tabs; sign out in one | Other tab redirects to sign-in |
| T-20 | AC-13 | E2E | Only if D-P1-5: reset flow via mail catcher | New password works; old fails |

## 3. Security checks
T-05, T-08, T-09, T-10 and T-15, plus a review of the migration for `security definer` + `search_path`, and of CSP/`Referrer-Policy` headers in `public/_headers`.

## 4. Regression scope
None (first feature). From Phase 2, every phase reruns T-03, T-04, T-08 and T-14.

## 5. Commands
```bash
npm run lint && npm run typecheck && npm test        # unit
npx supabase test db                                 # pgTAP (tests/db/*.sql)
npm run test:e2e -- --trace off                      # Playwright incl. axe
```
Evidence: command output saved to `docs/testing/phase1/` and summarised in ACCEPTANCE_REPORT.md.
