# Phase 5 — Implementation Plan

**Spec:** FEATURE_SPEC v0.1 · **Architecture:** §3.1, §4.1, §4.2, §5.2, §5.5, §9 (header findings)

## Tasks

| # | Role | Task | Files |
|---|---|---|---|
| B1 | Backend | Migration: `approval_links`, `client_decisions`, `public_link_attempts`; RLS and column grants; guard triggers; RPCs `get_public_proposal`, `submit_public_decision`, `issue_approval_link`, `revoke_approval_link`; add link revocation inside `cancel_change_order_version` and `send_change_order_version` | `supabase/migrations/<ts>_client_approval.sql` |
| B2 | Backend | pgTAP: token hashing, every link state, idempotency, double decision, stale link, projection contents, grants, throttle, immutability, cascade | `tests/db/client_approval.test.sql` |
| B3 | Backend | API: `src/lib/api/publicProposal.ts` (anon, no session) and owner additions in `changeOrders.ts` | `src/lib/api/*` |
| F1 | Frontend | Public page `/p`: reads and clears the fragment, state pages, decision form with confirm and idempotency key, confirmation | `src/features/public/*` |
| F2 | Frontend | Freelancer: issue/copy link once, link status, reissue, revoke, decision display | `src/features/changes/*` |

## Contracts
- **`get_public_proposal(p_token text) → jsonb`** (anon, authenticated): `{state, proposal?, decision?, freelancer_name?, expires_at?}`. Never raises for bad input; failures are counted.
- **`submit_public_decision(p_token text, p_decision text, p_comment text, p_idempotency_key uuid) → jsonb`** (anon, authenticated): `{result:'recorded'|'already_recorded', decision, decided_at}` or `{error:'invalid'|'expired'|'revoked'|'superseded'|'cancelled'|'decided'|'rate_limited'|'validation'}`.
- **`issue_approval_link(p_version_id uuid) → jsonb`** (authenticated): `{token, expires_at}`. Revokes any active link; pending version and active project only. Errors: `not_found`, `not_pending`, `project_not_active`.
- **`revoke_approval_link(p_version_id uuid) → boolean`** (authenticated): true if an active link was revoked.

All four are `security definer`, `search_path=''`, with explicit grants; the lock order is change order → version → link (deadlock-free with send/cancel).

## Migration rollback (forward-fix)
Drop the four RPCs and the three tables with their trigger functions; restore `cancel_change_order_version` and `send_change_order_version` from migration `20261116190000`. Data loss applies (links and decisions); needs approval on shared environments.

## New dependencies
None.

## Risks
- Anon-executable `security definer` functions are the central risk. Mitigations: constant-shape JSON outputs, explicit projection, hashed token, throttle, pgTAP and adversarial testing, and the dedicated security review.
- Write operations inside public RPCs require POST (supabase-js `rpc` uses POST); tests assert this.
