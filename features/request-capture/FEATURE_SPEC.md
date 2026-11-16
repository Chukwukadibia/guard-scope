# Phase 3 — Request Capture & Classification — Feature Specification

**Version:** 0.1 · **Status:** Approved to start (HA-005). Written from the approved PRD + ARCHITECTURE v0.2; new choices are listed in §7 · **PRD refs:** §4.1 Request capture, §5.2, §6.4 REQ-001..006, §6.7 HIST-001..003 (request events), §7.1, §7.2, §13 Phase 3

## 1. User problem
Client requests arrive through WhatsApp, email, calls and meetings. The freelancer needs to log them quickly, compare them with the recorded scope, and decide (themselves) whether each one is included, additional or unclear, with a history of those decisions.

## 2. Goals / non-goals
**Goals:**
- Fast manual request capture on a project.
- Freelancer-only classification, with every change recorded in an append-only history.
- Private internal notes.
- Recording revision usage against the scope's allowance (PRD §7.2), with no inference.

**Non-goals:**
- Change orders from additional requests (Phase 4). For now an additional request is only marked as ready for a change order.
- Any automatic, AI or legal classification (PRD §4.2).
- The project-wide activity timeline UI and financial totals (Phase 6). Phase 3 stores the events and shows them per request.
- Inbox or WhatsApp integrations.
- Deleting requests: requests are part of the record, so they are edited, never deleted. Account deletion still removes everything.

## 3. Scope

| Req | Notes |
|---|---|
| REQ-001 | Title (required, ≤200), description (optional, ≤5000), source channel (optional: WhatsApp, Email, Call, Meeting, Other), received date (required, defaults to today, not in the future) |
| REQ-002 | Classification: Unclassified (initial, DEC-007), Included, Additional, Needs clarification. Only the freelancer sets it |
| REQ-003 | Every classification change is recorded server-side (from → to, server timestamp, actor) in `activity_events` and shown in the request's history. Creation is recorded too |
| REQ-004 | Requests have no price or revenue fields; "Included" never creates value anywhere |
| REQ-005 | An "Additional" request shows that it can become a change order once Phase 4 ships. No dead action button |
| REQ-006 | Internal notes are labelled "Private — never shown to your client". Phase 5's public page must never select them (ARCHITECTURE §4.1) |
| §7.2 | Revision allowance comes from the latest confirmed scope (or "no confirmed scope yet"). The freelancer can record a revision as used (optional note, optional link to a request) and undo it. The display shows "N used" and, only for numeric allowances, "M remaining" (never below 0; over-use is shown as "N used of M"). Recording and undoing are logged |

## 4. User stories
- **US-1:** From a project, I log a request in a few seconds (title plus optional details), with today's date pre-filled.
- **US-2:** I see the requests list with each classification clearly labelled, and filter by classification.
- **US-3:** I open a request, compare it with the original scope (shown on the same page as a summary), and classify it. I can change my mind later, and the history shows each change.
- **US-4:** I record that a request used one of the included revisions, and see how many remain.

## 5. Business rules
- **BR-1:** Ownership is via the project. Requests can't be created or edited on archived projects, but stay readable.
- **BR-2:** Classification changes go through `classify_request` only; there is no direct column write. Setting the same value again is a no-op (no duplicate event).
- **BR-3:** `activity_events` is append-only: no update or delete (account deletion excepted). Events are written only by server functions and triggers.
- **BR-4:** A revision usage may link only to a request in the same project.
- **BR-5:** The received date can't be in the future (client and server). Dates are stored as calendar dates.
- **BR-6:** The UI never says a request is "legally" in or out of scope. It says "You marked this as …".

## 6. States & edge cases
Loading, empty ("No requests yet"), validation with an error summary, error, offline and success states. Long text wraps (no overflow at 375 px). Not-found requests show the same "Request not found" message for missing and foreign ids.

## 7. Choices made from the approved documents (for visibility)
- C-1: `activity_events` is created now (ARCHITECTURE §3.1) because REQ-003 (P0, Phase 3) needs it. The timeline UI stays in Phase 6.
- C-2: No request deletion (record integrity; the PRD doesn't list it).
- C-3: The allowance source is the latest **confirmed** scope version. Without one, the UI says "Confirm the scope to track revisions" and recording is disabled.
- C-4: A revision usage can be undone, with both actions logged, so mistakes can be corrected without hiding history.

## 8. Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | A request can be created with the title only (date defaults to today), and with all fields. It persists after reload and appears in the project's list |
| AC-2 | Validation (missing title, length limits, future date, invalid channel) shows field errors plus a summary. The server rejects the same data sent directly |
| AC-3 | Classifying with each option updates the label and appends a history entry (from → to, time). Re-selecting the same value adds no entry. History entries can't be edited or deleted via the API |
| AC-4 | A direct API write to `classification`, or any write to `activity_events`, is rejected |
| AC-5 | Internal notes show the private label and are stored only on the request row |
| AC-6 | Revision usage: allowance from the latest confirmed scope; record and undo work; used/remaining figures are correct for none / number / not specified; over-use is shown without negatives; no recording before a scope is confirmed |
| AC-7 | Archived project: requests are visible, but create, edit, classify and record usage are blocked in the UI and by the server |
| AC-8 | User B can't read, create on, classify or record usage on A's projects or requests, and can't read A's events. Anon has no access |
| AC-9 | Included requests produce no monetary value anywhere. Additional requests show the Phase 4 hint, not a dead action |
| AC-10 | axe 0 serious/critical; keyboard operable; no horizontal overflow at 375 and 1280 |
| AC-11 | Phase 1 and Phase 2 regression suites pass |
