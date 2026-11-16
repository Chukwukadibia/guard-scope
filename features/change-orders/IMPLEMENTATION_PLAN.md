# Phase 4 — Implementation Plan

## Tasks

| # | Role | Task | Files |
|---|---|---|---|
| B1 | Backend | Migration: `change_orders`, `change_order_versions`, constraints, RLS, column grants, guard trigger (immutability plus transition matrix), RPCs `create_change_order`, `send_change_order_version`, `cancel_change_order_version`, `new_change_order_version`, `discard_change_order_draft`, history events | `supabase/migrations/<ts>_change_orders.sql` |
| B2 | Backend | pgTAP: isolation, grants, transitions, immutability, supersede, project-status locks, events | `tests/db/change_orders.test.sql` |
| B3 | Backend | API `src/lib/api/changeOrders.ts`; error codes | `src/lib/api/*` |
| F1 | Frontend | Domain: validation, status labels, impact formatting | `src/lib/domain/changeOrder.ts` |
| F2 | Frontend | Request page "Create change proposal"; project page proposals section; proposal page (draft editor, client preview, send panel, versions, cancel/new/discard, history) | `src/features/changes/*` |

## Contracts
- **Tables:** `change_orders` select only. `change_order_versions` select, plus update of content columns while `status='draft'` on an active project.
- **RPCs** (`security definer`, authenticated only):
  - `create_change_order(p_request_id) → uuid`. Errors: `not_found`, `request_not_additional`, `change_order_exists`, `project_not_active`.
  - `send_change_order_version(p_version_id) → versions row`. Errors: `not_found`, `not_draft`, `invalid_impact`, `missing_content`, `invalid_time_impact`, `deadline_in_past`, `project_not_active`.
  - `cancel_change_order_version(p_version_id)`. Errors: `not_found`, `not_pending`, `project_not_active`.
  - `new_change_order_version(p_change_order_id) → uuid`. Errors: `not_found`, `draft_exists`, `project_not_active`.
  - `discard_change_order_draft(p_version_id) → boolean` (true when the whole proposal was removed). Errors: `not_found`, `not_draft`, `project_not_active`.

## Rollback
Drop the five functions and the trigger functions, then `drop table public.change_order_versions, public.change_orders cascade;`. Data loss applies; needs approval on shared environments.
