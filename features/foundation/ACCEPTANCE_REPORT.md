# Phase 0 — Foundation & Governance — Acceptance Report

**Reviewer run mode:** separate general-purpose subagent in the same Claude Code session (fresh context, read-only, instructed to report findings only). It is *not* a separate organisation or model (DEC-002). **Commit reviewed:** working tree before `767e5ef` landed (see finding G-1).

## Criteria (PRD §13 Phase 0, §22)

| Criterion | Result | Evidence |
|---|---|---|
| Phase 0 documents exist (PRD §15 tree) | PASS | `git ls-files` |
| Protocol adapts the Playbook without weakening it | FAIL → fixed, awaiting re-review | Review found 3 omissions (Playbook §12, §13 release gate, §14). Added in protocol §3, §12, §14 |
| Architecture covers schema, RLS, link security, contracts, env, migrations, hosting, backups, rollback | FAIL → fixed, awaiting re-review | 4 HIGH technical findings, all corrected in ARCHITECTURE v0.2 (below) |
| Scaffold scripts are repeatable | PASS | `npm run check` and Playwright 2/2, recorded in PROJECT_STATUS |
| No secrets committed | PASS | Only `.env.example` is tracked |
| Phase 1 spec, plan and test plan exist | PASS (with deviations now flagged) | features/authentication |
| Vendor limits, region and terms confirmed (PRD §10) | **BLOCKED** | Marked VERIFY. Needs web verification and the region decision (OD-12) before the architecture is marked final |

## Review findings and disposition

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| G-1 | HIGH | Repo on `main`, no commits | Stale: the review ran just before commit `767e5ef` on `phase-0/foundation`. Verified with `git log` |
| T-1 | HIGH | Scope baseline lacked price, currency and deadline | Fixed: snapshotted on `scope_versions` |
| T-2 | HIGH | Owner could write state columns directly (classification, status, sent_at…) | Fixed: column-grant matrix in ARCH §4.1; change orders and versions are created only via RPC |
| T-3 | HIGH | Throttle failure row rolled back by exception | Fixed: public RPCs return error results instead of raising |
| T-4 | HIGH | Supabase default EXECUTE grants to anon/authenticated not revoked | Fixed: `alter default privileges` + per-function revokes + pgTAP grant matrix |
| T-5 | MED | `x-forwarded-for` is spoofable | Fixed: trusted edge header (VERIFY) or global circuit-breaker; throttle is secondary |
| T-6 | MED | OD-6 contradiction | Fixed: clarification is terminal only under the recommendation; the tables don't exist until Phase 4, so either outcome remains possible |
| T-7–9 | LOW | Revision check, one-active-link index, base64url decode | Fixed |
| S-1 | MED | Dashboard create-project action dropped silently | Flagged as D-P1-6 for approval |
| S-2 | LOW | Unflagged choices (enums, WCAG level, viewports, legal routes, `last_viewed_at`) | Enums marked proposed; WCAG/viewports → D-P1-7; legal routes and `last_viewed_at` removed |
| P-1 | MED | Phase 0 self-declared complete | Status now "submitted for gate"; this report is the evidence |
| D-1 | MED | Currency rule inconsistent between docs | Aligned (optional default; required per-project currency) |
| D-2 | LOW | `supabase/config.toml` defaults differ from spec (password length 6, confirmations off, port 3000) | Intentionally untouched in Phase 0. Phase 1 task B2 changes them after OD-3 is approved |
| D-3 | LOW | CI audit scope vs architecture; branch naming; CHANGELOG wording | Aligned |

## Decision
Phase 0 is **submitted to the human gate**, not self-approved. Fixes to the FAIL rows need a re-review by a fresh reviewer, which runs at the start of the next session or on request. The VERIFY items remain open until OD-12 is decided.
