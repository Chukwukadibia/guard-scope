# GuardScope — Architecture

**Version:** 0.2 (revised after independent review) — **DRAFT, awaiting human approval (HA-002).** Nothing in §3–§6 is implemented yet.
**Date:** 16 Nov 2026 · **Author role:** Team Lead with the Backend Agent role
**Implements:** `MASTER_PRD.md` §9 (data model), §10 (technical direction), §11 (privacy/security), §12 (NFRs)

Items marked **⚠ OD-n** depend on PRD §20 open decision *n*. They are designed so either outcome fits without restructuring. Items marked **VERIFY** are vendor facts (limits, regions, terms) that must be confirmed against current official sources before production (PRD §10, §20.12). They have not been verified in this session.

---

## 1. System overview

```text
 Freelancer browser (React SPA / PWA)          Client browser (same SPA, public route /p)
          │  supabase-js (publishable key + user JWT)        │ supabase-js (publishable key, no session)
          ▼                                                  ▼
 ┌──────────────────────────── Supabase ───────────────────────────────┐
 │  Auth (GoTrue)   PostgREST ──► tables guarded by RLS (authenticated)│
 │                  PostgREST ──► RPC: SECURITY DEFINER functions      │
 │                               (anon may call ONLY 2 public RPCs)    │
 │  PostgreSQL: constraints, triggers (immutability, audit), RLS       │
 └─────────────────────────────────────────────────────────────────────┘
 Static hosting: Cloudflare Pages (HTTPS, _headers: CSP, no-referrer)
```

**Trust boundaries (PRD §10.2).** The browser handles presentation and convenience validation only. Ownership, entitlements, state transitions, token handling and timestamps are enforced in Postgres: RLS, constraints, triggers and `SECURITY DEFINER` functions that use `now()` server-side.

**Why database functions instead of Edge Functions (PRD §10 allows either).** Every sensitive operation is a single-database transaction: decision submission, sending, confirming scope. A PL/pgSQL function gives true atomicity (`SELECT … FOR UPDATE`), no cold starts, no extra secrets and no extra free-tier quota. Edge Functions stay available for any future need that requires outbound HTTP (none in MVP).

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite + **TypeScript** | TypeScript supports the PRD §13 "type" scripts |
| Routing | React Router | |
| Styling | Tailwind CSS | |
| Icons | lucide-react | |
| Backend SDK | @supabase/supabase-js v2 | |
| PWA | vite-plugin-pwa | App-shell precache only. **API/RPC responses are never cached** (§5.6) |
| PDF (Phase 6) | pdf-lib | Client-side generation from server-fetched stored data |
| DB / Auth | Supabase Postgres + Supabase Auth | ⚠ OD-3 auth method |
| Hosting | Cloudflare Pages | VERIFY limits; ⚠ OD-12 |
| Tests | Vitest + Testing Library; pgTAP (`supabase test db`); Playwright + @axe-core/playwright | |
| CI | GitHub Actions | format, lint, typecheck, unit, build, `npm audit --omit=dev --audit-level=high` (dev-tool advisories tracked in the issues register) |

No other runtime dependency without a recorded justification.

## 3. Data model (PRD §9)

All tables live in `public` with `id uuid primary key default gen_random_uuid()`. Timestamps are `timestamptz not null default now()`. Text fields have `check (char_length(x) <= N)` limits (PRD PROJ-002). Money is `numeric(14,2)` and never a float. Currency is `char(3)` and must be uppercase ISO 4217 (`check (currency ~ '^[A-Z]{3}$')`; ⚠ OD-9 decides which codes the UI offers).

### 3.1 Tables

All column names, enums (e.g. project `status`, `time_impact_unit`) and lengths below are **proposals for approval with this document**. Each feature's migration is reviewed again at that feature's gate.


| Table | Key columns | Integrity |
|---|---|---|
| **profiles** | `id uuid PK FK auth.users on delete cascade`, `display_name text ≤120`, `default_currency char(3) null` | Created by an `on auth.users insert` trigger. `default_currency` stays null until the user chooses it (⚠ OD-9; never assumed USD) |
| **projects** | `owner_id uuid FK profiles`, `title ≤200 not null`, `client_name ≤200 not null`, `client_contact ≤320 null`, `description ≤5000 null`, `agreed_price numeric(14,2) null check ≥0`, `currency char(3) not null`, `start_date date null`, `deadline date null`, `status text check in ('active','completed','archived')`, `archived_at` | `check (deadline is null or start_date is null or deadline >= start_date)`; index `(owner_id, status)`. `owner_id` defaults to `auth.uid()` and is checked by RLS; a client-supplied value is never trusted |
| **scope_versions** | `project_id FK`, `version_no int`, `summary ≤5000`, `agreed_price numeric(14,2) null`, `currency char(3) not null`, `deadline date null`, `revision_allowance_type text not null check in ('none','number','not_specified')`, `revision_allowance_count int null check (count >= 0)`, `notes ≤5000`, `created_by uuid`, `confirmed_at timestamptz null`, `is_original_baseline bool default false` | `unique(project_id, version_no)`; partial unique `(project_id) where is_original_baseline`; check `(revision_allowance_type = 'number') = (revision_allowance_count is not null)`. **Price, currency and deadline are snapshotted on the scope version**, so the confirmed baseline keeps the agreed commercial terms even if the project row is edited later (SCOPE-001/003/004). Assumptions are `scope_items` of kind `assumption`. **Trigger: rows with `confirmed_at` set are immutable** (UPDATE/DELETE raise) |
| **scope_items** | `scope_version_id FK`, `kind text check in ('deliverable','exclusion','assumption')`, `description ≤1000`, `sort_order int` | Trigger blocks writes when the parent version is confirmed |
| **revision_usages** | `project_id`, `scope_version_id`, `request_id null`, `note ≤500`, `recorded_at` | Tracks the PRD §7.2 "revision recorded as consumed". Only the freelancer creates rows |
| **requests** | `project_id FK`, `title ≤200`, `description ≤5000`, `source_channel text check in ('whatsapp','email','call','meeting','other') null`, `received_on date`, `classification text check in ('unclassified','included','additional','needs_clarification') default 'unclassified'`, `internal_notes ≤5000` | `internal_notes` is **never** selected by any public RPC (LINK-007, REQ-006) |
| **change_orders** | `project_id FK`, `request_id FK requests`, `current_version_id FK null`, `status text` (mirrors the current version) | Insert only allowed when the request is `additional` (CO-001, REQ-005), enforced in RPC/trigger |
| **change_order_versions** | `change_order_id FK`, `version_no int`, `description ≤5000`, `price_impact numeric(14,2) not null default 0 check ≥0`, `currency char(3)`, `time_impact_value numeric(8,2) null check ≥0`, `time_impact_unit text check in ('hours','days','weeks') null`, `proposed_deadline date null`, `assumptions ≤5000`, `exclusions ≤5000`, `client_terms ≤5000`, `status text check in ('draft','pending','approved','declined','clarification_requested','cancelled','superseded')`, `sent_at null`, `status_changed_at` | `unique(change_order_id, version_no)`; check that the value and unit are both null or both set; check `price_impact > 0 or time_impact_value > 0` on send (CO-003). **Trigger: once `sent_at` is set, content columns are immutable. Only `status`/`status_changed_at` may change, and only via §4 functions on allowed transitions** |
| **approval_links** | `version_id FK change_order_versions`, `token_hash bytea unique not null`, `expires_at timestamptz null` (⚠ OD-4), `revoked_at null`, `created_at` | Partial unique index `(version_id) where revoked_at is null`: at most one active link per version. The raw token is never stored. No access metadata is stored (minimisation; PRD §9 "only justified") |
| **client_decisions** | `version_id FK`, `link_id FK`, `decision text check in ('approved','declined','clarification_requested')`, `comment ≤2000 null`, `idempotency_key uuid not null`, `decided_at timestamptz default now()` | **`unique(version_id)`**: one decision per version (CO-009). `unique(link_id, idempotency_key)`. Trigger: no UPDATE/DELETE (HIST-002). ⚠ OD-6 (see §4.4) |
| **activity_events** | `project_id FK`, `actor_type text check in ('freelancer','client','system')`, `actor_id uuid null`, `event_type text`, `entity_type text`, `entity_id uuid`, `entity_version int null`, `summary ≤300`, `metadata jsonb ≤2KB`, `created_at` | Append-only (trigger). Written only by triggers or §4 functions, never directly by the client |
| **account_entitlements** | `owner_id PK FK profiles`, `plan_code text check in ('free','solo','pro')`, `status text`, `period_end timestamptz null`, `source text check in ('default','admin','provider')`, `provider_ref null` | **Readable by owner, writable only by service role / admin SQL** (BILL-006, BILL-008). Missing row = `free` |
| **public_link_attempts** | `ip_hash bytea`, `window_start timestamptz`, `failures int` | Abuse throttle (§5.5). `ip_hash` = sha256(ip ‖ server salt); no raw IPs |

### 3.2 Deletion and retention

`profiles → projects → …` cascade on delete, so deleting an account removes all of that freelancer's data (AUTH-004). The immutability triggers allow deletes only inside `delete_my_account()`, which sets the transaction-local flag `guardscope.account_deletion = on`. Retention for archived projects, backups and activity is **⚠ OD-10**. Until it is decided, nothing is purged automatically, and the privacy policy must state that backups expire on the provider's rotation schedule (VERIFY).

## 4. API contracts

### 4.1 Direct table access (authenticated, RLS)

The freelancer UI reads its own rows through PostgREST, subject to the RLS in §5.1. **Direct writes are limited by column-level grants plus RLS `with check`**, so state and history columns can only change through the RPCs below:

| Table | Direct INSERT (authenticated) | Direct UPDATE columns | Never directly writable |
|---|---|---|---|
| projects | title, client_name, client_contact, description, agreed_price, currency, start_date, deadline | same + status (`active`/`completed` only; archive via the same column, logged by trigger) | owner_id (defaults to `auth.uid()`), timestamps |
| scope_versions / scope_items | only while the parent is unconfirmed (RLS `with check confirmed_at is null`) | content columns while unconfirmed | `confirmed_at`, `is_original_baseline`, `version_no` |
| requests | title, description, source_channel, received_on, internal_notes | same | `classification` (via `classify_request`) |
| change_orders | **none** (via `create_change_order`) | **none** | all |
| change_order_versions | **none** (via `create_change_order` / `new_change_order_version`) | content columns only, RLS `using (status = 'draft')` | `status`, `sent_at`, `version_no`, `change_order_id` |
| approval_links, client_decisions, activity_events, account_entitlements | none | none | all |

RPCs:

| RPC (`security definer`, `search_path=''`) | Caller | Input | Output / errors |
|---|---|---|---|
| `confirm_scope(scope_version_id)` | owner | — | Sets `confirmed_at=now()`. First confirmation also sets `is_original_baseline`. Creates the next draft version as a copy so the current scope stays editable (SCOPE-003/4/5). Errors: `not_found`, `already_confirmed`, `empty_scope` |
| `classify_request(request_id, classification)` | owner | enum | Updates and logs an event (REQ-003). Error `invalid_classification` |
| `create_change_order(request_id)` | owner | — | Creates the order plus draft version 1. Error `request_not_additional`; ⚠ OD-7 limit check (Phase 7) |
| `new_change_order_version(change_order_id)` | owner | — | Copies the current sent version into a new draft (CO-006). Error `draft_exists` |
| `send_change_order_version(version_id)` | owner | — | In one transaction: validates the draft; supersedes the prior pending version and revokes its link; sets `pending`/`sent_at`; creates a link. **Returns the raw token once.** Errors: `not_draft`, `invalid_impact`, `project_archived` |
| `cancel_change_order_version(version_id)` | owner | — | `pending → cancelled`; revokes the link |
| `revoke_link(link_id)` / `reissue_link(version_id)` | owner | — | Revoke sets `revoked_at`. Reissue revokes the old link and returns a new raw token for the same pending version |
| `record_revision_usage(project_id, note, request_id?)` | owner | — | Inserts a usage row |
| `delete_my_account()` | owner | — | Deletes all owned data, then the `auth.users` row (requires an elevated function owner). Exact behaviour is specified in the feature that owns AUTH-004 |
| **`get_public_proposal(token text)`** | **anon** | raw token | `{state, proposal?}` where `state ∈ valid, invalid, expired, revoked, superseded, decided, cancelled`. `proposal` holds only: project title, client name, freelancer display name, version no, description, price impact + currency, time impact, proposed deadline, assumptions, exclusions, client terms, sent_at, and the existing decision if one exists. **Never** internal notes, other projects, emails or ids beyond the version no |
| **`submit_public_decision(token, decision, comment, idempotency_key uuid)`** | **anon** | | `{result: recorded | already_recorded, decision, decided_at}` or an error `invalid | expired | revoked | superseded | decided | cancelled | rate_limited | validation` |

Error codes are stable strings that map to safe UI messages. Raw database errors are never shown (PRD §10.5). **The two public RPCs return errors as a JSON result and do not raise exceptions**, so the failure counter written in the same transaction (§5.5) is committed rather than rolled back. Authenticated RPCs raise exceptions (§5.4).

### 4.2 Decision submission algorithm (LINK-008/009, CO-008/009)

```text
BEGIN
  reject unless token ~ '^[A-Za-z0-9_-]{43}$'; h := extensions.digest(token, 'sha256'); throttle check (§5.5)
  SELECT link, version FROM approval_links JOIN change_order_versions … WHERE token_hash = h FOR UPDATE OF version
  not found                         → record failure, RETURN {error:'invalid'} (no exception, so the failure row commits)
  existing decision with same (link, idempotency_key) → return already_recorded (idempotent retry)
  link.revoked_at not null          → revoked
  link.expires_at < now()           → expired
  version.status = 'superseded'     → superseded ; 'cancelled' → cancelled
  version.status <> 'pending' or version.id <> change_order.current_version_id → decided/superseded
  INSERT client_decisions (unique(version_id) is the final guard against races)
  UPDATE version.status, change_orders.status ; INSERT activity_event(actor_type='client')
COMMIT
```

The row lock serialises concurrent submissions. The unique constraint turns any remaining race into a clean `decided` response.

### 4.3 State machine (PRD §7.3) — enforced in the functions, plus a trigger that rejects other transitions

`draft → pending` (send) · `pending → approved | declined | clarification_requested` (client) · `pending → cancelled` (freelancer) · `pending → superseded` (new version sent). Approved, declined, cancelled and superseded are terminal for that version. `clarification_requested` is terminal **only under the OD-6 recommendation** (§4.4).

### 4.4 ⚠ OD-6 Clarification workflow — recommendation, not yet decided

**Recommended:** `clarification_requested` is terminal for that version. The freelancer answers outside the app and sends a new version, which gets a new link. This keeps "one decision per version", the simplest audit meaning, and needs no reopen path. The alternative (reopen the same version as pending) would require relaxing `unique(version_id)` to a decision sequence. `unique(version_id)` in §3.1 reflects the recommendation. These tables are not created until Phases 4–5, so the alternative can be adopted at no migration cost if OD-6 is decided before Phase 4. It does not block Phase 1.

## 5. Security

### 5.1 RLS (PRD §10.4)

- RLS is enabled on **every** table. `anon` gets **no** table privileges (`revoke all … from anon`). `authenticated` gets only the grants listed in §4.1.
- Ownership pattern: `projects` uses `owner_id = (select auth.uid())`. Child tables use `exists (select 1 from projects p where p.id = <child>.project_id and p.owner_id = (select auth.uid()))`, through `change_orders` for version, link and decision tables.
- `profiles`: `id = auth.uid()`. `account_entitlements`: select only. `activity_events` and `client_decisions`: select only. `approval_links`: select without `token_hash` (column-level grant).
- Every `security definer` function sets `search_path = ''`, uses schema-qualified names and checks ownership explicitly. Supabase grants `EXECUTE` to `anon` and `authenticated` by default, so the first migration runs `alter default privileges in schema public revoke execute on functions from public, anon, authenticated;`, and each function gets an explicit `revoke execute … from public, anon, authenticated` followed by a grant **only** to its intended role. pgTAP asserts the expected grant matrix.
- Tests: pgTAP with **user A, user B and anon** for every table and RPC (`tests/db/`).

### 5.2 Public approval link (PRD §10.3)

| Control | Design |
|---|---|
| Entropy | 32 bytes from `extensions.gen_random_bytes(32)` (pgcrypto CSPRNG), base64url-encoded with `translate(rtrim(encode(b,'base64'),'='),'+/','-_')` (43 chars, 256-bit) |
| Storage | Only `digest(token_text,'sha256')` is stored. The raw token is returned once from `send_change_order_version` / `reissue_link` and is never logged or persisted |
| Scope | The link is tied to exactly one `version_id`. Actions are limited to view, approve, decline and clarify |
| Transport | URL `https://<app>/p#<token>`. The token is in the **fragment**, so browsers never send it to Cloudflare or Supabase logs or in `Referer` headers. The SPA reads `location.hash` and sends the token in the RPC **POST body**, then `history.replaceState` removes it from the address bar |
| Headers | `Referrer-Policy: no-referrer` on all pages; CSP `default-src 'self'; connect-src 'self' https://<project>.supabase.co; frame-ancestors 'none'; object-src 'none'`; `X-Content-Type-Options: nosniff` |
| No third-party scripts | No analytics or error-reporting SDK in MVP, so nothing can leak the token |
| Expiry / revocation | `expires_at` ⚠ OD-4 (recommendation: 30 days from send, freelancer can reissue). Revocation is always available |
| Stale versions | Superseded, cancelled or decided states are checked on every call |

### 5.3 Secrets

| Variable | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local`, Cloudflare Pages env | No (public) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same | No (public, RLS-bound). Use the legacy anon key if the project predates publishable keys |
| `VITE_APP_URL` | same | No |
| `SUPABASE_SERVICE_ROLE_KEY` / secret key | **Never in the frontend.** Used only by an admin locally for entitlement changes, or as a GitHub Actions secret if the backup job is approved | **Yes** |
| `SUPABASE_DB_URL` | GitHub Actions secret for `pg_dump` backup, only if approved | **Yes** |
| `LINK_THROTTLE_SALT` | Postgres setting via Vault or a migration-time secret | **Yes** |

`.env.example` lists the public variables only.

### 5.4 Errors and logging

UI shows mapped messages. Functions `raise exception using errcode = 'P0001', message = '<code>'`. Nothing logs tokens or comments. Supabase API logs record request paths, which carry no token, because the token goes in the POST body.

### 5.5 Abuse controls

**Primary control: 256-bit tokens make guessing infeasible.** As a secondary, best-effort control, the public RPCs record failed lookups per source key and return `rate_limited` after 20 failures in 10 minutes. Client-supplied headers such as `x-forwarded-for` can be spoofed, so the source key must come from a header set by the platform edge (VERIFY which header Supabase exposes to PostgREST and whether clients can override it). If no trustworthy header exists, the fallback is a **global** failure circuit-breaker: above N failures/minute all public lookups slow down. The throttle is never relied on for confidentiality. Supabase Auth has its own built-in rate limits (VERIFY current values).

### 5.6 PWA caching

The service worker precaches only built static assets. Requests to `*.supabase.co` use `NetworkOnly`. The `/p` route uses the same shell, but proposal data is never cached.

## 6. Migrations, environments, hosting, backups, rollback

- **Migrations:** Supabase CLI, `supabase/migrations/<timestamp>_<slug>.sql`, append-only and reviewed. Never edited after being applied anywhere shared. Local: `supabase db reset` replays everything plus `supabase/seed.sql` (synthetic data only).
- **Planned migration order:** 1 profiles + auth trigger + base grants (Phase 1) → 2 projects/scope (P2) → 3 requests/revisions (P3) → 4 change orders/versions (P4) → 5 links/decisions/public RPCs/throttle (P5) → 6 activity views/summaries (P6) → 7 entitlements/limits (P7).
- **Rollback:** Postgres DDL is transactional, so a failed migration rolls back automatically. For an applied migration, recovery is **forward-fix**: write a new migration that reverts it. Each feature's `IMPLEMENTATION_PLAN.md` includes the reverting SQL. Destructive reverts (dropping columns with data) need human approval.
- **Environments:** local (Docker + Supabase CLI), **staging** Supabase project + Pages preview, **production** Supabase project + Pages production. Creating either cloud project needs approval (⚠ OD-12 region).
- **Hosting:** Cloudflare Pages connected to GitHub, with SPA fallback via `public/_redirects` (`/* /index.html 200`) and headers via `public/_headers`. VERIFY current free-tier build and bandwidth limits.
- **Backups:** VERIFY whether the Supabase Free plan includes downloadable backups or PITR. **Proposed (needs approval):** a weekly GitHub Actions `pg_dump` of the production schema and data, encrypted with `age` and stored as a short-retention private artifact. Restore is tested on staging before release. Retention ⚠ OD-10. Free-plan projects can be paused after inactivity (VERIFY); this is noted in the risk register.
- **Deployment rollback:** Cloudflare Pages lets you redeploy a previous build. The database uses forward-fix as above. The release checklist goes in `docs/deployment/` (Phase 8).

## 7. Frontend structure

```text
src/
  main.tsx, App.tsx, routes.tsx
  lib/supabase.ts          single client (publishable key only)
  lib/api/                 typed wrappers per RPC/table (Backend-owned contract)
  lib/domain/              pure business rules (currency grouping, state labels) – unit tested
  features/<feature>/      pages + components per feature
  components/ui/           Button, Field, Alert, EmptyState, Spinner (accessible primitives)
  styles/index.css         Tailwind
```

Business rules live in `lib/domain`, not in components (PRD §12). Money is formatted with `Intl.NumberFormat` and an explicit currency code. Totals are grouped by currency and never summed across currencies (HIST-006).

## 8. Open decisions referenced here

OD-3 auth method · OD-4 link expiry · OD-6 clarification flow · OD-7 "active" definitions · OD-9 currencies/default · OD-10 retention · OD-12 region/provider. See `docs/decisions/DECISION_LOG.md` for each recommendation and status.
