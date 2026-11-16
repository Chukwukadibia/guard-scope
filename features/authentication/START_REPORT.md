# Architecture & Phase 1 Start Report (Playbook §15.1, PRD §16, §22.8)

**From:** Team Lead · **To:** Human supervisor (product owner) · **Date:** 2026-11-16

## 1. Feature and objective
Phase 1 covers authentication and the app shell (PRD §13). Objective: freelancers can register, sign in and sign out; protected pages are guarded; the account-scoped data foundation is in place; and the responsive, accessible shell is ready for later features.

## 2. Documents submitted for approval
| Doc | Version |
|---|---|
| `ARCHITECTURE.md` | 0.2 draft (revised after independent review; see `features/foundation/ACCEPTANCE_REPORT.md`) |
| `AI_TEAM_OPERATING_PROTOCOL.md` | 1.0 draft |
| `features/authentication/FEATURE_SPEC.md`, `IMPLEMENTATION_PLAN.md`, `TEST_PLAN.md` | 0.1 drafts |
| Proposed team decisions DEC-001 to DEC-008 (`docs/decisions/DECISION_LOG.md`) | — |

Two data-model additions beyond PRD §9 need your explicit approval (DEC-006): `revision_usages` (for PRD §7.2) and `public_link_attempts` (for PRD §10.3 rate limiting). DEC-007 adds an `unclassified` initial request state.

## 3. Dependencies
- Repository access (ISS-001, **blocking**).
- A Supabase environment where tests can run. Docker is unavailable to the AI environment (R-14), so a dev Supabase cloud project is needed.

## 4. Task owners
Backend Agent: B1–B3. Frontend Agent: F1–F8. Tester Specialist: a separate subagent runs TEST_PLAN T-01 to T-20. Debug Specialist: on failure. Details are in IMPLEMENTATION_PLAN §2.

## 5. Expected files and modules
`supabase/migrations/<ts>_profiles.sql`, `supabase/config.toml`, `src/lib/{supabase.ts,api/*,domain/safeNext.ts}`, `src/features/{auth,dashboard,projects,settings,public}/*`, `src/components/{ui,layout}/*`, `tests/{unit,db,e2e}/*`, and PWA config in `vite.config.ts`.

## 6. Risks
R-13 (staged work not pushed), R-14 (no local DB), R-16 (auth email rate limits), R-15 (schedule pressure). See `docs/risks/RISK_REGISTER.md`.

## 7. Decisions that block Phase 1 (only these)
| # | Decision | Recommendation |
|---|---|---|
| 1 | **OD-3 Auth method** | Email + password via Supabase Auth, email confirmation **on**, minimum 8 characters |
| 2 | **OD-12 Supabase region + creating a dev project** for Phase 1 testing (free tier; no spend) | You choose the region closest to your target users. Approve creating `guardscope-dev` under your Supabase organisation. Production is a later, separate approval |
| 3 | **OD-9 Default currency** | Optional ISO 4217 picker in Settings, no pre-filled default (never assume USD) |
| 4 | **AUTH-004 account deletion placement** | Build it in Phase 2, when user data first exists. Still required before release. Retention (OD-10) is decided then |
| 5 | **AUTH-005 password recovery** (P1) | Include it in Phase 1 |
| 6 | **Dashboard create-project action** (PRD §8) | Defer to Phase 2, when projects exist (avoids a dead button) |
| 7 | **Test targets** | WCAG 2.2 AA; 375 px and 1280 px minimum viewports |

Also a gate condition: before ARCHITECTURE.md is marked *final*, the Team Lead verifies the current Supabase and Cloudflare free-tier limits, backups, pausing and terms for the region you choose (PRD §10). Those items are marked VERIFY today.

## 8. Test approach
Unit (Vitest), DB/RLS (pgTAP, two users plus anon), E2E with axe (Playwright, 375 px and 1280 px). Run by an independent Tester subagent. Evidence goes to `docs/testing/phase1/` and `ACCEPTANCE_REPORT.md`.

## 9. Approval requested
Please confirm or adjust items 1–5 and approve the architecture, protocol and Phase 1 documents. These will be recorded as **HA-002**. Phase 1 implementation will not start until then.
