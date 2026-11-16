# Phase 2 — Projects & Original Scope — Feature Specification

**Version:** 0.1 · **Status:** Approved to start (HA-004). Written from the approved PRD + ARCHITECTURE v0.2; new choices are listed in §7 · **PRD refs:** §4.1 Projects / Original scope / Account, §5.1, §5.6, §6.1 AUTH-004, §6.2, §6.3, §7.2, §8, §13 Phase 2

## 1. User problem
A freelancer must be able to write down what was originally agreed (deliverables, exclusions, revisions, price, deadline) and keep that baseline unchanged, so that later requests can be compared against it.

## 2. Goals / non-goals
**Goals:** project create/list/view/edit/complete/archive/reopen; a scope draft with summary, deliverables, exclusions, assumptions, revision allowance and notes; confirming the scope creates a dated, immutable original baseline; later scope edits produce new versions without touching the baseline; the Dashboard shows the active project count and a create-project action; account deletion (AUTH-004).

**Non-goals (later phases):**
- request capture and revision-usage tracking (Phase 3);
- change orders (Phases 4–5);
- the activity timeline and financial totals (Phase 6);
- plan limits PROJ-004 (Phase 7);
- hard-deleting individual projects (not in the PRD; archive only).

## 3. Scope

| Req | Notes |
|---|---|
| PROJ-001 | Create, list, view, edit, archive; plus "Mark completed" and "Reopen" (PRD §5.6) |
| PROJ-002 | Required: title (≤200), client name (≤200), currency (ISO 4217). Optional: client contact (≤320), description (≤5000), agreed price (≥0, 2 dp), start date, deadline (≥ start date) |
| PROJ-003 | Project detail shows the status and a scope summary (status of the original scope, counts of deliverables and exclusions, revision allowance). Change summaries arrive with Phase 4 |
| SCOPE-001 | Summary (≤5000), deliverables, exclusions, assumptions (each ≤1000), revision allowance (`none` / a number ≥0 / `not specified`), notes (≤5000). Price, currency and deadline come from the project |
| SCOPE-002 | Each project has exactly one editable unconfirmed draft |
| SCOPE-003 | "Confirm original scope" snapshots the draft plus the project's price, currency and deadline with a server timestamp. The first confirmation is flagged as the **original baseline** |
| SCOPE-004 | Confirmed versions and their items are immutable (enforced in the database). After a confirmation, a new draft is created as a copy for later edits |
| SCOPE-005 | The UI labels **Original agreement (baseline, confirmed <date>)**, **Current scope (version N)** when later versions are confirmed, and **Draft changes (not confirmed)** |
| AUTH-004 | Settings → Delete account: explains the consequences, requires the current password, and permanently deletes the account and all its data |
| §8 Dashboard | Active project count, up to 5 active projects, and a "New project" action |

## 4. User stories
- **US-1:** I create a project with client details, price, currency and dates. My default currency is pre-selected if I set one.
- **US-2:** I list my projects (active first) and open one.
- **US-3:** I record the scope (deliverables, exclusions, assumptions, revisions, summary, notes) and can keep editing it while it's a draft.
- **US-4:** I confirm it as the original agreement. Afterwards I can see exactly what was agreed and when, even if I edit the project or the scope later.
- **US-5:** I can mark a project completed, archive it, or reopen it. History stays readable.
- **US-6:** I can delete my account and everything in it, after a clear warning.

## 5. Business rules
- **BR-1:** Ownership is enforced server-side. `owner_id` is set from the session, never from the client (PRD §9).
- **BR-2:** A project starts `active` with an empty scope draft (version 1), which the server creates.
- **BR-3:** Confirming requires at least one deliverable. Confirmation is blocked on archived projects.
- **BR-4:** Revision allowance `not_specified` is displayed as "Not specified", never as 0 or unlimited (PRD §7.2).
- **BR-5:** Money is shown with an explicit currency code. There is no cross-currency aggregation. The project price is optional and shown as "Not specified" when empty.
- **BR-6:** Archived projects are read-only in the UI apart from "Reopen". Completed projects stay editable.
- **BR-7:** Editing the project's price, currency or deadline after confirmation changes the project's *current* values only. The baseline keeps its snapshot, and the UI shows both whenever they differ.
- **BR-8:** Account deletion is immediate and irreversible. It removes the auth user, profile, projects and scope data (OD-10 as applied in HA-004). It never claims to remove the provider's logs.

## 6. States & edge cases
- Loading, empty, validation, error and success states on every page; error summaries as in Phase 1.
- Projects list: empty state with a create action; archived projects are behind an "Archived" filter.
- Not found / not yours: the same "Project not found" page (no existence leak).
- A double-confirm or stale draft returns a safe error message.
- Offline: actions are disabled and the banner shows.
- Long text wraps with no horizontal overflow at 375 px.

## 7. Choices made from the approved documents (for visibility)
- C-1: Project price is optional; currency is required. The PRD lists the price without making it mandatory, and freelancers may record scope before pricing.
- C-2: Revision-usage tracking moves to Phase 3, together with requests (PRD §7.2 ties usage to recorded requests).
- C-3: Account deletion re-asks for the password as a client-side safeguard. The server deletes only `auth.uid()`.
- C-4: Project deletion is not offered (the PRD lists archive only).

## 8. Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | A project can be created with required fields only. All fields save and reload correctly. The default currency is pre-selected when set |
| AC-2 | Validation: missing title, client or currency; lengths over the limits; negative price; deadline before start date. Each shows field errors plus a summary, and the server rejects the same data sent directly |
| AC-3 | Projects can be edited, marked completed, archived and reopened. Archived projects are hidden from the default list and read-only except Reopen |
| AC-4 | A scope draft can be edited: add, edit, remove and reorder deliverables, exclusions and assumptions; set revision allowance (none / number / not specified); edit summary and notes. The data persists |
| AC-5 | Confirming with no deliverable is rejected. Confirming succeeds otherwise, shows the confirmation date, and flags the version as the original baseline |
| AC-6 | After confirmation, editing the scope and the project price/deadline, then confirming again, leaves the baseline (items, summary, allowance, price, currency, deadline, date) byte-for-byte unchanged. The UI distinguishes original, current and draft |
| AC-7 | Confirmed versions and items cannot be changed or deleted through the API, even by their owner |
| AC-8 | User A cannot read, create under or modify user B's projects, scope versions or items (REST and RPC). Anon has no access |
| AC-9 | The Dashboard shows the correct active project count and a working "New project" action |
| AC-10 | Account deletion requires the correct password. Afterwards the user is signed out, cannot sign in, and none of their rows remain in any table |
| AC-11 | All new pages: axe 0 serious/critical; keyboard operable; no horizontal overflow at 375 px and 1280 px |
| AC-12 | Phase 1 regression suite still passes |
