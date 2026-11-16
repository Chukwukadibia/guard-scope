# Phase 4 — Change-Order Proposal & Versioning — Feature Specification

**Version:** 0.1 · **Status:** Approved to start (HA-007), with the Team Lead's recommendations in §7 · **PRD refs:** §4.1 Change orders, §5.3, §5.5, §5.6, §6.5 CO-001..CO-010, §7.3, §7.4, §7.5, §13 Phase 4 · OD-6 decided (HA-006)

## 1. User problem
Once the freelancer decides a request is additional, they need to turn it into a clear, priced and/or timed proposal. Once sent, it must be frozen exactly as presented, and any change must produce a new version without rewriting the old one.

## 2. Goals / non-goals
**Goals:**
- Create a change proposal from an "Additional" request.
- Draft editing.
- Price and/or time impact, with currency and units.
- Client-facing title, description, assumptions, exclusions and terms.
- **Send** freezes the version.
- New versions preserve the old ones.
- Status transitions enforced in the database.
- History per proposal.

**Non-goals (Phase 5):**
- Approval links, the public client page, and the client decisions themselves (approved / declined / clarification requested).

  In Phase 4, a sent version is shown as "Sent — waiting for the client". The UI says plainly that the shareable approval link arrives with the next release; there are no dead buttons.

**Non-goals (Phase 6):**
- Financial totals, message templates, PDFs.

**Non-goals (Phase 7):**
- Plan limits on active change requests (OD-7).

## 3. Scope

| Req | Notes |
|---|---|
| CO-001 | Created from a request classified **Additional**; linked to the project and the request. One change proposal per request (further changes are new versions) |
| CO-002 | Version fields: title (≤200, required), description (≤5000, required), price impact (≥0, 2 dp), currency (ISO 4217, defaults to the project's), time impact value (≥0, ≤2 dp) + unit (hours / days / weeks), optional proposed deadline, assumptions, exclusions, client-visible terms (≤5000 each) |
| CO-003 | Price impact may be 0 for time-only changes. Sending requires price > 0 **or** time > 0 |
| CO-004 | Statuses: draft, pending (sent), approved, declined, clarification_requested, cancelled, superseded. Transitions are enforced by the database (§5) |
| CO-005 | Sending sets `sent_at` (server time) and freezes all content columns permanently |
| CO-006 | "Create new version" copies the latest version into a new draft (v n+1). Sending it supersedes any pending earlier version |
| CO-007 | All sent versions remain readable, and their content is immutable |
| CO-008 / CO-009 | Phase 5 decisions may only attach to a pending, current version. Phase 4 guarantees the state model they depend on |
| CO-010 | Declined / cancelled / superseded versions stay in history; a replacement is a new version |
| §5.6 | Change proposals can be created, edited, sent or cancelled only while the project is **Active**. Completed and archived projects are read-only for proposals |
| §7.4 | No proposal amount is ever labelled paid, collected or earned. Amounts are labelled "proposed" |

## 4. User stories
- **US-1:** From an Additional request, I click "Create change proposal" and get a draft pre-filled from the request.
- **US-2:** I set the price and/or time impact and the client-facing wording, and preview what the client will see.
- **US-3:** I send it; that version is now frozen with its send time.
- **US-4:** If something changes, I create a new version. The old one is kept, and sending the new one marks the old pending one as superseded.
- **US-5:** I can cancel a sent proposal before the client decides, or discard a draft I no longer want.
- **US-6:** I see all proposals on the project page with their current status and proposed impact.

## 5. Business rules (database-enforced)
- **BR-1:** Allowed transitions:
  - `draft → pending` (send);
  - `pending → cancelled` (freelancer);
  - `pending → superseded` (a newer version is sent);
  - `pending → approved | declined | clarification_requested` (client, Phase 5).

  Every other transition is rejected. Approved, declined, clarification_requested (HA-006), cancelled and superseded are terminal for that version.
- **BR-2:** Once `sent_at` is set, content columns can never change, for any role. Sent versions can't be deleted (account deletion excepted).
- **BR-3:** Each change order has at most one draft version. `version_no` is sequential per change order. Each change order has at most one pending version.
- **BR-4:** Discarding a draft deletes only that draft. If it was version 1 (never sent), the whole proposal is removed.
- **BR-5:** Every state change is recorded in the append-only history (`activity_events`, entity `change_order`, with the version number): created, sent, superseded, cancelled, new version, draft discarded.
- **BR-6:** Internal request notes are never copied into a proposal. Only the request title and details (description) pre-fill the draft.
- **BR-7:** Sending validates server-side: title and description present; impact > 0; time value and unit both present or both empty; proposed deadline not in the past.

## 6. States & edge cases
- Loading, empty ("No change proposals yet"), validation with an error summary, offline and success states.
- Long text wraps.
- Not-found and foreign ids show the same "not found" page.
- A stale tab (sending an already-sent version) gets a safe message.
- Proposals on completed/archived projects are read-only.

## 7. Choices (Team Lead recommendations applied under HA-007)
- C-1: One change proposal per request; revisions are versions.
- C-2: Proposal writes only on Active projects (PRD §5.6: "disabled or require an explicit reopen"). Reopening the project re-enables them.
- C-3: The status lives on each version. The proposal's status is its latest version's status.
- C-4: "Send" in Phase 4 freezes the version and marks it pending without creating a link. Phase 5 adds link creation inside the same send step.
- C-5: A new version may be created after any terminal state, including approved (PRD §7.3: "corrections require a new record/version").
- C-6: Reclassifying the request later doesn't delete or alter existing proposals. The request page shows the link to its proposal either way.
- C-7: Currency defaults to the project currency and can be changed per proposal. Amounts are never combined across currencies.

## 8. Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | An "Additional" request can create exactly one proposal, pre-filled (title and details, project currency, no private notes). Unclassified, included and needs-clarification requests can't (UI and server) |
| AC-2 | A draft can be edited and saved; all fields persist. Validation errors show field messages plus a summary, and the server rejects invalid data sent directly |
| AC-3 | Sending a valid draft sets pending + server send time. Sending without impact, without a description, with mismatched time value/unit or a past deadline is rejected |
| AC-4 | After sending, no role can change the version's content or delete it (API and DB guard), including the owner via REST |
| AC-5 | A new version copies the latest one. Sending it supersedes the earlier pending version; the old content is unchanged; at most one draft and one pending per proposal |
| AC-6 | Cancel works only on pending versions. Discard works only on drafts (v1 discard removes the proposal). Every other transition is rejected server-side, including forced status writes |
| AC-7 | History records every state change in order, with version numbers |
| AC-8 | Proposals can't be created, edited, sent or cancelled when the project is completed or archived |
| AC-9 | User B can't read, create, edit, send, cancel or discard A's proposals. Anon has no access |
| AC-10 | Amounts are always shown with currency and labelled proposed; nothing says paid, collected or earned |
| AC-11 | axe 0 serious/critical; keyboard operable; no horizontal overflow at 375 and 1280 |
| AC-12 | Phase 1–3 regression suites pass |
