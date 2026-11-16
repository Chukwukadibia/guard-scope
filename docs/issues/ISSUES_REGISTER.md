# Issues Register

Severity: CRITICAL / HIGH / MEDIUM / LOW. A fix cycle = diagnose → fix → developer checks → independent retest (max 5, then escalate).

| ID | Date | Severity | Title | Repro / evidence | Owner | Cycles | Status |
|---|---|---|---|---|---|---|---|
| ISS-001 | 2026-11-16 | HIGH (blocker for push) | No access to `Chukwukadibia/guard-scope` | `add_repo` → "you don't have access to chukwukadibia/guard-scope" (tried twice). Fix: connect GitHub at claude.ai/connect-github and install the Claude GitHub App on the repo; then start a session with the repo selected or retry `add_repo` | Product owner | n/a | **Open** |
| ISS-002 | 2026-11-16 | LOW | Moderate advisory GHSA-g3hv-75wg-m249 (minimatch ReDoS) in dev-only lint tooling (`typescript-eslint` → minimatch) | `npm audit` after `npm audit fix` and the vitest upgrade. Production deps: 0 vulnerabilities (`npm audit --omit=dev`). An earlier critical (tinypool via vitest 3) was resolved by upgrading vitest to 5.1.0 | Team Lead | n/a | Open (monitor; dev-only, not shipped) |
