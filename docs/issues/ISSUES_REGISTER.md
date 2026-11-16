# Issues Register

Severity: CRITICAL / HIGH / MEDIUM / LOW. A fix cycle = diagnose → fix → developer checks → independent retest (max 5, then escalate).

| ID | Date | Severity | Title | Repro / evidence | Owner | Cycles | Status |
|---|---|---|---|---|---|---|---|
| ISS-001 | 2026-11-16 | HIGH (blocker for push) | No access to `Chukwukadibia/guard-scope` | `add_repo` → "you don't have access to chukwukadibia/guard-scope" (tried twice). Fix: connect GitHub at claude.ai/connect-github and install the Claude GitHub App on the repo; then start a session with the repo selected or retry `add_repo` | Product owner | n/a | **Open** |
| ISS-002 | 2026-11-16 | LOW | Moderate advisory GHSA-g3hv-75wg-m249 (minimatch ReDoS) in dev-only lint tooling (`typescript-eslint` → minimatch) | `npm audit` after `npm audit fix` and the vitest upgrade. Production deps: 0 vulnerabilities (`npm audit --omit=dev`). An earlier critical (tinypool via vitest 3) was resolved by upgrading vitest to 5.1.0 | Team Lead | n/a | Open (monitor; dev-only, not shipped) |
| ISS-003 | 2026-11-16 | LOW–MEDIUM (a11y) | D-1: validation errors not summarised on submit (FEATURE_SPEC §6) on Settings and auth forms | ACCEPTANCE_REPORT D-1; `settings-and-empty-states.spec.ts` "§6 summarised" | Debug Specialist | 1 | In fix |
| ISS-004 | 2026-11-16 | LOW | D-2: removed session token → redirect without the "session has ended" message (AC-4) | ACCEPTANCE_REPORT D-2; T-06 | Debug Specialist | 1 | In fix |
| ISS-005 | 2026-11-16 | MEDIUM (config) | D-3: server accepts 7-char passwords; dashboard minimum is still 6 (BR-1) | `api-auth-server-behaviour.log` | **Product owner** (dashboard setting) | n/a | Open, blocks acceptance of BR-1 |
| ISS-006 | 2026-11-16 | LOW | D-4: email-not-confirmed message wording differs from BR-2 | ACCEPTANCE_REPORT D-4 | Debug Specialist (align copy to spec) | 1 | In fix |
