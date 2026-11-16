# Phase 1 — Authentication & App Shell — Implementation Plan

**Version:** 0.1 · **Status:** DRAFT — awaiting approval (HA-002) · **Spec:** [FEATURE_SPEC.md](FEATURE_SPEC.md) v0.1 · **Architecture:** ARCHITECTURE.md §2, §3.1 profiles, §5.1, §5.3, §7

## 1. Approach
This is a thin vertical slice. Supabase Auth handles identity. A `profiles` table with RLS is the isolation template for later tables. A React Router layout puts a session guard on the protected routes. Accessible UI primitives are built once and reused.

## 2. Tasks

| # | Role | Task | Files owned | Depends on |
|---|---|---|---|---|
| B1 | Backend | Migration: `profiles` table, `handle_new_user` trigger (`security definer`, `search_path=''`), RLS (select/update own; no insert/delete from clients), `revoke all from anon`, `updated_at` trigger | `supabase/migrations/<ts>_profiles.sql` | Approved D-P1-12 |
| B2 | Backend | Supabase Auth config: email provider, confirmation per D-P1-3, site URL / redirect allow-list, min password length 8 | `supabase/config.toml` (local); cloud settings recorded in `docs/deployment/SUPABASE_SETTINGS.md` | B1 |
| B3 | Backend | Typed API wrapper: `getMyProfile`, `updateMyProfile({display_name, default_currency})`, auth helpers. Error-code mapping | `src/lib/api/profile.ts`, `src/lib/api/auth.ts`, `src/lib/api/errors.ts` | B1 |
| F1 | Frontend | Supabase client singleton + `AuthProvider` (session, `onAuthStateChange`, cross-tab sign-out) | `src/lib/supabase.ts`, `src/features/auth/AuthProvider.tsx` | B3 contract |
| F2 | Frontend | Routes: public (`/sign-in`, `/register`, `/reset-password`*, `/p`) and protected layout with `RequireAuth` (safe `next` param) | `src/routes.tsx`, `src/features/auth/RequireAuth.tsx`, `src/lib/domain/safeNext.ts` | F1 |
| F3 | Frontend | Sign-in, Register, (Reset*) pages with validation and generic errors | `src/features/auth/*Page.tsx` | F1 |
| F4 | Frontend | App shell: header, responsive nav (top bar on desktop, menu button + `<nav>` disclosure on mobile), skip link, offline banner | `src/components/layout/*` | F2 |
| F5 | Frontend | UI primitives: Button, TextField, SelectField, Alert, EmptyState, Spinner | `src/components/ui/*` | — |
| F6 | Frontend | Dashboard and Projects empty states; Settings page (profile form, currency picker from `Intl.supportedValuesOf('currency')`, "Not set" default) | `src/features/dashboard/*`, `src/features/projects/ProjectsPage.tsx`, `src/features/settings/*` | F4, F5, B3 |
| F7 | Frontend | `/p` placeholder that renders "This link isn't available" (reserved for Phase 5) | `src/features/public/PublicProposalPage.tsx` | F2 |
| F8 | Frontend | PWA: manifest, icons, service worker with `NetworkOnly` for `*.supabase.co` | `vite.config.ts`, `public/manifest*`, `public/icons/*` | — |

\* only if D-P1-5 = include. Tasks B and F5/F8 can run in parallel; F1+ needs the B3 contract (signatures below), not the finished implementation.

## 3. Contracts

```ts
// src/lib/api/profile.ts
type Profile = { id: string; display_name: string | null; default_currency: string | null; created_at: string; updated_at: string };
getMyProfile(): Promise<Profile>                                   // errors: 'not_authenticated' | 'network' | 'unknown'
updateMyProfile(p: { display_name?: string | null; default_currency?: string | null }): Promise<Profile>
                                                                   // errors: 'validation' | 'not_authenticated' | 'network'
// src/lib/api/auth.ts
signUp(email, password): Promise<{ needsConfirmation: boolean }>  // 'weak_password' | 'rate_limited' | 'network' (never 'already_registered' to UI)
signIn(email, password): Promise<void>                            // 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'network'
signOut(): Promise<void>
requestPasswordReset(email) / updatePassword(newPassword)         // only if D-P1-5
```

## 4. Migration
`<ts>_profiles.sql` (forward), in summary:
```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  default_currency char(3) check (default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update (display_name, default_currency) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- handle_new_user(): security definer, set search_path = '', inserts (new.id); trigger after insert on auth.users
-- set_updated_at() trigger
```
**Reverting SQL (forward-fix):** `drop trigger on_auth_user_created on auth.users; drop function public.handle_new_user(); drop table public.profiles;`. Data impact: profile names and currencies are lost. On a shared environment this needs human approval.

## 5. New dependencies

| Package | Why |
|---|---|
| @supabase/supabase-js | Approved backend SDK (PRD §10) |
| react-router-dom | Routing / protected routes |
| lucide-react | Approved icons (PRD §10) |
| vite-plugin-pwa | PWA installability (PRD §4.1) |
| (dev) @playwright/test, @axe-core/playwright | E2E and accessibility evidence |
| (dev) supabase CLI | Migrations, local stack, pgTAP |

## 6. Risks
- R-14: Docker or a Supabase project may be unavailable to the AI environment, which would make DB/E2E tests BLOCKED. Mitigation: an approved dev Supabase project.
- R-16: Supabase's default email sender rate limits slow E2E registration. Mitigation: local Inbucket/Mailpit with the CLI, or confirm test users via admin SQL in dev only.
