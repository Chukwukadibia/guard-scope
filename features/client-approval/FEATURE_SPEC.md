# Phase 5 — Secure Client Approval — Feature Specification

**Version:** 0.1 · **Status:** Approved to start (HA-008) · **PRD refs:** §4.1 Client approval link, §5.4, §5.5, §6.5 CO-008/009, §6.6 LINK-001..011, §10.3, §11, §13 Phase 5 · OD-4, OD-5 decided (HA-008) · OD-6 decided (HA-006) · DEC-012 (throttle), DEC-013 (link issuance)

## 1. User problem
The freelancer needs the client to see exactly one proposal version and answer it, without the client creating an account, and needs a trustworthy record of that answer tied to the exact version.

## 2. Goals / non-goals
**Goals:**
- Create a private, expiring, revocable link for a sent (pending) version.
- A public page showing only that version's client-facing content.
- Approve / decline / request clarification, with an optional comment.
- Exactly one decision per version, recorded atomically.
- The freelancer sees the decision against the exact version.

**Non-goals:**
- Sending the link (manual copy and share only, PRD §4.2).
- Collecting the client's name or email (OD-5).
- Message templates and PDFs (Phase 6).
- E-signature or any legal-validity claim (LINK-011).

## 3. Scope

| Req | Notes |
|---|---|
| LINK-001/002 | 256-bit token from `gen_random_bytes(32)`, base64url; only its SHA-256 is stored; the raw token is shown once |
| LINK-003 | A link is tied to one version and allows only view, approve, decline, clarify |
| LINK-004 | Expiry **30 days** after issue (OD-4); revoke at any time; reissue revokes the previous link |
| LINK-005 | States: valid, invalid, expired, revoked, superseded, cancelled, decided, rate_limited, each with a safe explanation |
| LINK-006/007 | No account needed. The public projection contains only the fields in §5; never private notes, other projects or account data |
| LINK-008/009 | Decision, server timestamp, version, optional comment (≤2000, OD-5). Atomic; idempotent on retry; a second different decision is rejected |
| LINK-010 | Confirmation after a successful decision |
| LINK-011 | Wording is "recorded response"/"decision history"; never "signed", "legally binding", "certified" |
| CO-008/009 | Only the **current**, **pending** version can receive a decision. No double or conflicting decisions |
| §10.3 | Token only in the URL fragment and the RPC body; abuse throttle (DEC-012); no third-party scripts; no token in logs |

## 4. User stories
- **Freelancer:** after sending, I issue a link, copy it once, and share it myself. I can see whether it's active, when it expires, reissue it (the old one stops working) or revoke it. When the client responds I see the decision, their comment and the time against the exact version.
- **Client:** I open the link on my phone, read the proposal in plain language with the amount and currency, and approve, decline or ask a question, optionally with a comment. I see a clear confirmation.

## 5. Business rules
- **BR-1:** Public projection (nothing else): project title, client name, freelancer display name (or "Your freelancer" if unset), version number, sent date, link expiry date, proposal title, description, price impact + currency, time impact, proposed deadline, assumptions, exclusions, terms; plus the decision and time once decided. Expired, revoked, replaced and cancelled links reveal only the freelancer's display name, so the client knows whom to contact.
- **BR-2:** State precedence: invalid → replaced (superseded) → cancelled → decided → revoked → expired → valid.
- **BR-3:** One decision per version (database unique constraint). Retry with the same idempotency key returns the original result; a different key after a decision returns "already decided".
- **BR-4:** Approving does not mean payment (PRD §7.4). The page and the freelancer view say "approved" for the proposal and never "paid", "collected" or "earned".
- **BR-5:** Clarification is terminal for that version (HA-006). The freelancer answers outside the app and sends a new version, which needs a new link. The UI never counts clarification as approval.
- **BR-6:** Failed lookups are throttled per source (key: `cf-connecting-ip`, else the last `x-forwarded-for` entry, hashed with a salt; DEC-012): over 20 failures in 10 minutes → `rate_limited` before the token is even checked. A global failure breaker is a second layer. A valid token never counts as a failure.
- **BR-7:** Links can only be issued for a pending version on an **active** project, by its owner. Cancel and supersede revoke the link atomically. Account deletion removes links and decisions.
- **BR-8:** Comments are untrusted text: rendered as text only, never as HTML.

## 6. States & edge cases
- The client page: loading, each link state, validation (comment too long), offline, retry after a network error (same idempotency key, so no duplicate), double-click protection, success.
- A malformed token (not 43 base64url characters) is "invalid" without a database lookup of the hash.
- No token in the URL fragment → the generic "This link isn't available" page.
- The freelancer view: no active link, active link (expiry date), expired, revoked, decided.

## 7. Choices (Team Lead recommendations under HA-008)
- C-1: The public page is the same SPA at `/p` (fragment token). The SPA removes the fragment from the address bar immediately after reading it.
- C-2: Decisions are shown to the freelancer on the proposal page and recorded in the history as a client event. The comment text is stored on the decision and shown to the owner there, **not** copied into the history event (minimisation).
- C-3: The throttle thresholds are 20 failures per source per 10 minutes and a global breaker at 1,000 failures per 10 minutes, both tunable in one place.
- C-4: The client sees the proposal content again after deciding (they already saw it), alongside their recorded response.

## 8. Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | The owner can issue a link for a pending version. The raw token is returned once and is not retrievable afterwards (not in any table, event or log). Only a SHA-256 hash is stored |
| AC-2 | The token is 43 base64url characters; two issues never collide; guessed, malformed and truncated tokens are "invalid" |
| AC-3 | The link opens without an account and shows exactly the BR-1 projection. No private notes, other versions' content, other projects or account data |
| AC-4 | The token travels only in the URL fragment and the POST body: it never appears in any request URL, in the Referer header, or in the address bar/history after load |
| AC-5 | Approve, decline and request clarification each record one decision against the exact version, with server time and the optional comment; the version's status changes accordingly; the freelancer sees it |
| AC-6 | Duplicate submission (same key) is idempotent; a second different decision is rejected; concurrent decisions (≥20 at once) produce exactly one |
| AC-7 | Expired, revoked, replaced, cancelled and already-decided links can't record a decision and show a safe explanation |
| AC-8 | Issuing a new link revokes the old one; sending a new version replaces the old pending one and its link stops working; cancel revokes the link |
| AC-9 | Throttle: repeated failed guesses from one source return `rate_limited`; a valid token from another source is unaffected |
| AC-10 | The freelancer can't decide, and the client can't access any other table or RPC: anon has no table privileges and only the two public RPCs are executable; direct REST access to links, decisions and versions is denied |
| AC-11 | Wording never claims a legal signature or certification and never calls approval "paid" |
| AC-12 | Client page: mobile-first, accessible (axe 0 serious/critical, keyboard, no horizontal overflow at 375 and 1280), long comments and long text wrap |
| AC-13 | Account deletion removes links and decisions; Phase 1–4 regression passes |
