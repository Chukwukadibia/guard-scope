# Decision Log

Records technical and process decisions, plus recommendations for PRD §20 open decisions. Status values: **Proposed** (awaiting the human), **Accepted** (cites an HA-ID), **Rejected**, **Superseded**.

## Team decisions (within approved boundaries, or pending approval with ARCHITECTURE.md)

| ID | Date | Decision | Rationale | Status |
|---|---|---|---|---|
| DEC-001 | 2026-11-16 | Use TypeScript with React + Vite | PRD §13 Phase 0 requires "type" scripts; TS catches contract drift | Accepted (HA-002) |
| DEC-002 | 2026-11-16 | Roles run as Claude Code subagents or role prompts; the Tester always uses a separate context from the implementer | Playbook §3, PRD §14.1 environment limitation | Accepted (HA-002) |
| DEC-003 | 2026-11-16 | Master Review becomes a web/PWA hosting, privacy and security audit instead of an Apple/Google store audit | PRD §4.2 has no native apps; PRD §14.1 wording | Accepted (HA-002) |
| DEC-004 | 2026-11-16 | Sensitive operations use Postgres `SECURITY DEFINER` RPCs rather than Edge Functions | Atomic transactions, no cold start, no extra secrets; PRD §10 allows either | Accepted (HA-002) |
| DEC-005 | 2026-11-16 | Approval token travels in the URL fragment and is sent to the RPC in the POST body | Keeps the token out of host logs and Referer (PRD §10.3) | Accepted (HA-002) |
| DEC-006 | 2026-11-16 | Add `revision_usages` and `public_link_attempts` tables, which are not listed in PRD §9 | Needed for PRD §7.2 (record revision consumption) and PRD §10.3 (rate limiting). This is a **data-model addition** and needs explicit approval | Accepted (HA-002) |
| DEC-007 | 2026-11-16 | Add `unclassified` as the initial request classification | PRD §5.2 records a request *before* classifying it. This avoids forcing an early choice | Accepted (HA-002) |
| DEC-009 | 2026-11-16 | Dev/test users are created already confirmed via SQL fixture (`tests/db/fixtures/create_test_users.sql`), **dev project only** | Default SMTP can't email non-team addresses (OD-13); within approved Phase 1 testing scope | Accepted (Team Lead, within HA-002 test scope) |
| DEC-010 | 2026-11-16 | Sign-out scope is `local` (this browser), not `global` (all devices) | Signing out on a phone shouldn't end a laptop session; spec AC-2 concerns this browser | Accepted (Team Lead, within spec) |
| DEC-011 | 2026-11-16 | Server accepts `received_on` up to UTC today + 1; the UI enforces local today | Users ahead of UTC (up to +14 h) would otherwise be rejected for a legitimate "today". Spec BR-5 wording clarified (Phase 3 observation O-b) | Accepted (Team Lead, clarification within approved spec) |
| DEC-012 | 2026-11-17 | Abuse throttle keys on `cf-connecting-ip`, falling back to the **last** `x-forwarded-for` entry, hashed with a salt; never the first entry. A global circuit-breaker is a second layer | Empirical header test on the dev project (ARCHITECTURE §9): the first XFF entry is client-controlled; `cf-connecting-ip` is edge-set and spoof-rejected. The 256-bit token remains the real protection | Accepted (Team Lead, within approved ARCHITECTURE §5.5 design) |
| DEC-008 | 2026-11-16 | Migration rollback uses forward-fix migrations | Supabase CLI has no down-migrations; DDL is transactional | Accepted (HA-002) |

## PRD §20 open decisions — recommendations only

| OD | Topic | Recommendation | Blocks | Status |
|---|---|---|---|---|
| 1 | Brand clearance | Run trademark, domain and app-store checks before launch; spend nothing until then | Release | Open |
| 2 | Initial freelancer category | No build impact; product validation question | — | Open |
| 3 | Auth method | Email + password via Supabase Auth with email confirmation on (no magic-link only: it adds email-deliverability dependence and friction on shared devices). Social login is LATER | **Phase 1** | Accepted (HA-002) |
| 4 | Link expiry | 30 days from send; the freelancer can reissue; revocation always available. Not user-customisable in MVP | Phase 5 | Accepted (HA-008): 30 days, reissue/revoke |
| 5 | Client name/email on decision page | Not required; optional free-text comment only (data minimisation) | Phase 5 | Accepted (HA-008): not collected; optional comment only |
| 6 | Clarification workflow | Terminal for the version; the freelancer sends a new version (ARCHITECTURE §4.4) | Phase 4/5 | **Accepted (HA-006): Option A** |
| 7 | "Active" definitions | Active project = status `active`. Active change request = change order whose current version is `draft`, `pending` or `clarification_requested` | Phase 7 | Open |
| 8 | Payment provider | Deferred; Phase 7 uses admin-set entitlements only (BILL-008) | Phase 7+ | Open |
| 9 | Currencies / default | Offer all ISO 4217 codes via `Intl.supportedValuesOf('currency')`. Optional default currency in Settings, with no pre-filled value. Project currency is required on each project, pre-selected from the default if set, otherwise chosen by the user | **Phase 1** (profile field) | Accepted (HA-002) |
| 10 | Retention | Keep until the user deletes the project/account; account deletion removes everything; backups age out within N days (set N when the backup plan is approved) | Phase 1 if AUTH-004 is in Phase 1; else Phase 8 | Accepted for account deletion (HA-004); backup retention N still open with the backup plan |
| 11 | PDFs | Three separate PDFs (scope, proposal, decision record); the decision record is included in the proposal PDF once decided | Phase 6 | Open |
| 12 | Region / hosting | Supabase region nearest the expected users (supervisor to choose); Cloudflare Pages; verify free-tier limits before production | **Phase 1** (project creation) | Accepted (HA-003 (eu-west-2)) |
| 13 | Production auth email (SMTP) provider | Found 16 Nov: Supabase's default sender only mails team members. Recommend a free-tier transactional provider (e.g. Brevo or Resend; compare terms) on a domain you own. Needed before beta users can register | Release (and any real-user beta) | Accepted in principle (HA-004); provider account setup pending (supervisor) |
