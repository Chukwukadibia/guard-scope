# Phase 2 — Implementation Plan

**Spec:** FEATURE_SPEC v0.1 · **Architecture:** §3.1 (projects, scope_versions, scope_items), §3.2, §4.1, §5.1

## 1. Tasks

| # | Role | Task | Files |
|---|---|---|---|
| B1 | Backend | Migration: `projects`, `scope_versions`, `scope_items`; constraints; indexes; RLS; column grants; triggers (owner default, `archived_at`, initial draft, immutability with account-deletion bypass, `updated_at`) | `supabase/migrations/<ts>_projects_scope.sql` |
| B2 | Backend | RPCs `confirm_scope(p_version_id uuid)` and `delete_my_account()` (`security definer`, `search_path=''`, granted to `authenticated` only) | same migration |
| B3 | Backend | Typed API: `src/lib/api/projects.ts`, `scope.ts`, `account.ts`; error codes `not_found`, `already_confirmed`, `empty_scope`, `project_archived` | `src/lib/api/*` |
| B4 | Backend | pgTAP: isolation, immutability, confirm rules, deletion cascade, grant matrix | `tests/db/projects_scope.test.sql` |
| F1 | Frontend | Domain helpers: project validation, money/date formatting, scope labels | `src/lib/domain/project.ts`, `format.ts` |
| F2 | Frontend | Projects list (active/completed/archived filter), new/edit project form | `src/features/projects/*` |
| F3 | Frontend | Project detail: overview, original scope (baseline / current / draft), scope editor, confirm dialog, status actions | `src/features/projects/*`, `src/features/scope/*` |
| F4 | Frontend | Dashboard count, list and "New project" action | `src/features/dashboard/DashboardPage.tsx` |
| F5 | Frontend | Settings → Delete account | `src/features/settings/DeleteAccount.tsx` |

## 2. Contracts
- Tables (RLS): `projects` select/insert/update (no delete); `scope_versions` select, plus update of content columns while unconfirmed; `scope_items` select/insert/update/delete while the parent is unconfirmed.
- `confirm_scope(p_version_id) → scope_versions row`. Errors: `not_found`, `already_confirmed`, `empty_scope`, `project_archived`.
- `delete_my_account() → void`. Deletes `auth.users` where `id = auth.uid()`; everything else cascades.

## 3. Migration rollback (forward-fix SQL)
`drop function public.delete_my_account(); drop function public.confirm_scope(uuid); drop table public.scope_items, public.scope_versions, public.projects cascade;` plus dropping the trigger functions. Data impact: all project and scope data is lost. Needs human approval on any shared environment.

## 4. New dependencies
None.

## 5. Risks
- Deleting from `auth.users` inside a `security definer` function depends on the Supabase `postgres` role's privileges. This is verified on dev; the fallback is an Edge Function using the admin API, which would need approval.
- Cascading deletes vs. immutability triggers: handled with a transaction-local `guardscope.account_deletion` flag and covered by pgTAP.
