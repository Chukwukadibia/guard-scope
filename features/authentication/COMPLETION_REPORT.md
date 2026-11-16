# Phase 1 — Feature Completion Report (Playbook §15.3)

**From:** Team Lead · **To:** Human supervisor · **Date:** 2026-11-16 · **Spec:** FEATURE_SPEC v0.1 (HA-002)

## Delivered scope
AUTH-001, -002, -003, -005 and -006; the app shell with Dashboard / Projects / Settings navigation; empty states; basic settings (display name, optional default currency); the `/p` placeholder; PWA; CSP and no-referrer headers. AUTH-004 moves to Phase 2 and the create-project action to Phase 2, as approved in HA-002.

## Files and migrations
See FEATURE_HANDOFF.md. One migration (`20261116100000_profiles.sql`), applied to dev only.

## Acceptance results (independent Tester; see ACCEPTANCE_REPORT.md)

| Run | Result |
|---|---|
| Initial | Not accepted. D-1 (no error summary), D-2 (removed token showed no message), D-3 (server min password 6), D-4 (copy) |
| Retest 1 (`006c7da`) | D-1, D-2 and D-4 verified fixed. D-3 fixed by the supervisor's dashboard change. New **D-5** (Medium, account enumeration through rate-limit responses) |
| Retest 2 (`808f64c`) | D-5 verified fixed (live and mocked). **Accepted, with BLOCKED items** |

All AC and T rows pass except the **BLOCKED** ones:
- AC-1 / T-01: the confirmation email step.
- AC-13 / T-20: the reset email and setting a new password from the link.

Cause: Supabase's default SMTP only mails org team members (OD-13), and the Site/Redirect URLs are not set.

Fix cycles: 2 (D-1/2/4 → 1 cycle; D-5 → 1 cycle). No critical defects. Issues ISS-003 to ISS-007 are closed.

## Security and regression
- Cross-user isolation: verified via pgTAP (34 assertions), PostgREST with real JWTs, and E2E.
- No secrets in the bundle (`check:secrets`). No enumeration in sign-in, sign-up or reset.
- The Supabase security advisor shows only ISS-008 (leaked-password protection off, a config setting).
- axe: 0 violations at 375 px and 1280 px, including error summaries.

## Limitations
See FEATURE_HANDOFF.md.

## Documentation
Spec, plan, test plan, acceptance report, handoff, changelog, data inventory, decision/risk/issue logs and Supabase settings are all current.

## Decisions requested
1. **Accept Phase 1 with the BLOCKED email-delivery steps as a non-critical exception.** These steps will be re-run once OD-13 and the URL settings are done, and before any real-user beta.
2. **OD-13:** choose a production auth email (SMTP) provider. My recommendation: a free-tier transactional provider such as Brevo or Resend (compare their terms) on a domain you own.
3. **ISS-008:** enable leaked-password protection if your plan allows it (dashboard → Authentication).
4. **Approve Phase 2** (Projects & original scope, plus AUTH-004 account deletion and the Dashboard create-project action).

Phase 2 will not start until you explicitly approve it.
