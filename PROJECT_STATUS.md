# Project Status

**Updated:** 2026-11-17 · **Current phase:** 4 complete · **State:** Phase 4 **accepted** by the independent Tester. ⏳ **Awaiting supervisor approval for Phase 5 and decisions OD-4/OD-5.**

## Repository (GitHub `Chukwukadibia/guard-scope`)

| Branch | Contents |
|---|---|
| `main` | Supervisor's initial README (an ancestor of all feature branches since cff6d62) |
| `feature/p1-authentication` | Phase 0 + 1 |
| `feature/p2-projects-and-scope` | + Phase 2, + merge of `main` |
| `feature/p3-request-capture` | + Phase 3 (accepted) |
| `feature/p4-change-orders` | + Phase 4 (accepted) |

## Environments
- `guardscope-dev` Supabase (`eqozjuaaajstrewygqxr`, eu-west-2, Free).
- Migrations: profiles, projects_scope, inline_deletion_flag, requests, event_ordering, change_orders. Remote version numbers differ from the file names (ISS-016).
- Test users a@ and b@ only; no project data.

## Phase status

| Phase | Status |
|---|---|
| 0 | Approved (HA-002) |
| 1 | Accepted with email-delivery exception (HA-004) |
| 2 | Accepted (HA-005) |
| 3 Request capture & classification | Accepted (HA-007) |
| 4 Change-order proposals & versioning | Accepted by Tester; completion report submitted |
| 5–8 | Not started |

## Open items needing the supervisor
1. Approve Phase 5 (secure client approval) and decide OD-4 (link expiry) and OD-5 (client identity on the decision page). Recommendations are in the Phase 4 completion report.
2. OD-13 SMTP provider account; ISS-008 leaked-password protection.
3. When to merge feature branches into `main` (via PR on request).

## Next safe action
Wait for Phase 5 approval and the OD-4/OD-5 decisions.
