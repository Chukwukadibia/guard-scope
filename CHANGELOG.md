# Changelog

All notable project changes, newest first. Feature-level detail lives in `features/<feature>/CHANGELOG.md`.

## 2026-11-16 — Phase 1 (authentication & app shell)
- Supabase dev project `guardscope-dev` (eu-west-2) with the `profiles` migration and RLS.
- Registration, sign-in/out, password recovery, protected routes, session-ended handling, app shell, settings, PWA.
- Independent testing: 2 fix cycles (D-1 to D-5). Accepted, with the email-delivery steps BLOCKED (OD-13).

## 2026-11-16 — Phase 0 (foundation & governance)
- Added `MASTER_PRD.md` v1.0.1 (working name changed to GuardScope per HA-001; header and §19 updated to match; no requirement changes).
- Added the Playbook as `docs/AI_MULTI_AGENT_PROJECT_DELIVERY_PLAYBOOK.md` and adapted it in `AI_TEAM_OPERATING_PROTOCOL.md`.
- Added draft `ARCHITECTURE.md` v0.1 (schema, RLS, public-link security, contracts, env, migrations, hosting, backups, rollback).
- Added status, approval, decision, risk and issue logs, plus the feature template.
- Added the Phase 1 (authentication & app shell) spec, implementation plan and test plan. **Not implemented.**
- Added the project scaffold (Vite + React + TS + Tailwind, lint/format/typecheck/test/build scripts, CI, Supabase CLI config). It contains no feature code.
