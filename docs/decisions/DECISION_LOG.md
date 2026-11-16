# Decision Log

Records technical and process decisions, plus recommendations for PRD §20 open decisions. Status values: **Proposed** (awaiting the human), **Accepted** (cites an HA-ID), **Rejected**, **Superseded**.

## Team decisions (within approved boundaries, or pending approval with ARCHITECTURE.md)

| ID | Date | Decision | Rationale | Status |
|---|---|---|---|---|
| DEC-001 | 2026-11-16 | Use TypeScript with React + Vite | PRD §13 Phase 0 requires "type" scripts; TS catches contract drift | Proposed (HA-002) |
| DEC-002 | 2026-11-16 | Roles run as Claude Code subagents or role prompts; the Tester always uses a separate context from the implementer | Playbook §3, PRD §14.1 environment limitation | Proposed (HA-002) |
| DEC-003 | 2026-11-16 | Master Review becomes a web/PWA hosting, privacy and security audit instead of an Apple/Google store audit | PRD §4.2 has no native apps; PRD §14.1 wording | Proposed (HA-002) |
| DEC-004 | 2026-11-16 | Sensitive operations use Postgres `SECURITY DEFINER` RPCs rather than Edge Functions | Atomic transactions, no cold start, no extra secrets; PRD §10 allows either | Proposed (HA-002) |
| DEC-005 | 2026-11-16 | Approval token travels in the URL fragment and is sent to the RPC in the POST body | Keeps the token out of host logs and Referer (PRD §10.3) | Proposed (HA-002) |
| DEC-006 | 2026-11-16 | Add `revision_usages` and `public_link_attempts` tables, which are not listed in PRD §9 | Needed for PRD §7.2 (record revision consumption) and PRD §10.3 (rate limiting). This is a **data-model addition** and needs explicit approval | Proposed (HA-002) |
| DEC-007 | 2026-11-16 | Add `unclassified` as the initial request classification | PRD §5.2 records a request *before* classifying it. This avoids forcing an early choice | Proposed (HA-002) |
| DEC-008 | 2026-11-16 | Migration rollback uses forward-fix migrations | Supabase CLI has no down-migrations; DDL is transactional | Proposed (HA-002) |

## PRD §20 open decisions — recommendations only

| OD | Topic | Recommendation | Blocks | Status |
|---|---|---|---|---|
| 1 | Brand clearance | Run trademark, domain and app-store checks before launch; spend nothing until then | Release | Open |
| 2 | Initial freelancer category | No build impact; product validation question | — | Open |
| 3 | Auth method | Email + password via Supabase Auth with email confirmation on (no magic-link only: it adds email-deliverability dependence and friction on shared devices). Social login is LATER | **Phase 1** | Open |
| 4 | Link expiry | 30 days from send; the freelancer can reissue; revocation always available. Not user-customisable in MVP | Phase 5 | Open |
| 5 | Client name/email on decision page | Not required; optional free-text comment only (data minimisation) | Phase 5 | Open |
| 6 | Clarification workflow | Terminal for the version; the freelancer sends a new version (ARCHITECTURE §4.4) | Phase 4/5 | Open |
| 7 | "Active" definitions | Active project = status `active`. Active change request = change order whose current version is `draft`, `pending` or `clarification_requested` | Phase 7 | Open |
| 8 | Payment provider | Deferred; Phase 7 uses admin-set entitlements only (BILL-008) | Phase 7+ | Open |
| 9 | Currencies / default | Offer all ISO 4217 codes via `Intl.supportedValuesOf('currency')`. Optional default currency in Settings, with no pre-filled value. Project currency is required on each project, pre-selected from the default if set, otherwise chosen by the user | **Phase 1** (profile field) | Open |
| 10 | Retention | Keep until the user deletes the project/account; account deletion removes everything; backups age out within N days (set N when the backup plan is approved) | Phase 1 if AUTH-004 is in Phase 1; else Phase 8 | Open |
| 11 | PDFs | Three separate PDFs (scope, proposal, decision record); the decision record is included in the proposal PDF once decided | Phase 6 | Open |
| 12 | Region / hosting | Supabase region nearest the expected users (supervisor to choose); Cloudflare Pages; verify free-tier limits before production | **Phase 1** (project creation) | Open |
