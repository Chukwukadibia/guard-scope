# Phase 3 — Implementation Plan

## Tasks

| # | Role | Task | Files |
|---|---|---|---|
| B1 | Backend | Migration: `requests`, `activity_events`, `revision_usages`; RLS; column grants; append-only guard; event triggers (request created, revision used/undone); RPC `classify_request(p_request_id uuid, p_classification text)` | `supabase/migrations/<ts>_requests.sql` |
| B2 | Backend | pgTAP for isolation, grants, classification events, append-only, archived lock, same-project usage link | `tests/db/requests.test.sql` |
| B3 | Backend | API `src/lib/api/requests.ts`, `revisions.ts`, `activity.ts` | `src/lib/api/*` |
| F1 | Frontend | Domain: request validation, classification labels, revision maths | `src/lib/domain/request.ts` |
| F2 | Frontend | Project detail: Requests section (quick add, list, filter), Revisions panel | `src/features/requests/*` |
| F3 | Frontend | Request detail page (edit, classify, history, record usage) | `src/features/requests/RequestDetailPage.tsx` |

## Contracts
- `requests`: select; insert (project_id, title, description, source_channel, received_on, internal_notes); update of the same minus project_id. Owner only; not on archived projects.
- `classify_request(p_request_id, p_classification) → requests row`. Errors: `not_found`, `project_archived`, `invalid_classification`.
- `revision_usages`: select; insert (project_id, request_id, note); delete. Owner only; not on archived projects; the request must be in the same project.
- `activity_events`: select only (owner via project).

## Migration rollback
`drop function public.classify_request(uuid, text); drop table public.revision_usages, public.activity_events, public.requests cascade;` plus the trigger functions. Data loss applies; needs approval on shared environments.

## New dependencies
None.
