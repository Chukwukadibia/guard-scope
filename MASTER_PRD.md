# GUARDSCOPE — MASTER PRODUCT REQUIREMENTS DOCUMENT
## Single source of truth for product, architecture, AI-agent delivery and acceptance

**Version:** 1.0.1 (working name updated per HA-001; no other content changed)  
**Status:** Product direction approved for planning; each feature requires separate human approval before implementation.  
**Date:** 16 November 2026  
**Product:** GuardScope (working name per HA-001; not brand-cleared)  
**Type:** Web-first SaaS / responsive PWA  
**Initial market:** Global solo freelancers and independent digital service providers  
**Delivery target:** A focused functional MVP in approximately three development days, subject to quality and security gates.  
**Governing operating standard:** The user-supplied *AI Multi-Agent Project Delivery Playbook*, Version 1.0.

---

# 0. DOCUMENT AUTHORITY AND HOW TO USE IT

This file is the authoritative product requirements document for GuardScope. Every AI agent, developer, tester, reviewer and future session must consult it alongside the approved `ARCHITECTURE.md` and the feature-specific documents.

It defines the product, users, scope, user journeys, business rules, functional and non-functional requirements, proposed architecture, delivery sequence, acceptance outcomes and agent governance. It is not permission to implement every roadmap item immediately.

## 0.1 Source-of-truth hierarchy

Resolve conflicts using this order:
1. Human supervisor's explicit recorded decision — final authority for approvals, exceptions and material changes.
2. This `MASTER_PRD.md` — product goals, scope and requirements.
3. Approved `ARCHITECTURE.md` — technical boundaries, stack and data flows.
4. Approved feature `FEATURE_SPEC.md` — detailed behaviour and acceptance criteria for that feature.
5. Git repository and version history — evidence of what actually exists.
6. `PROJECT_STATUS.md`, decision/risk/issue logs and `HUMAN_APPROVAL_LOG.md` — current state and approvals.
7. Session handoff documents — continuity and next safe action.

If requirements conflict or a material detail is ambiguous, stop and report it to the Team Lead. Do not guess, silently reconcile or implement an unapproved interpretation.

## 0.2 Binding rules

- Agents must not invent product scope.
- Repository state, not an agent's claim or documentation alone, establishes implementation reality.
- Deliver small, verifiable increments, one feature at a time by default.
- Implementation agents never approve their own work.
- A feature is complete only after independent testing, evidence, documentation and required human approval.
- The human supervisor controls scope changes, exceptions, architecture changes and release decisions.
- Prefer the simplest maintainable solution that meets approved requirements.
- Never rely on chat history as the only project record.

Use **MUST** for mandatory requirements, **SHOULD** for strong recommendations, **MAY** for optional capabilities, and **LATER** for items outside MVP. Test outcomes must be **PASS**, **FAIL** or **BLOCKED**.

# 1. PRODUCT DEFINITION

## 1.1 What GuardScope does

GuardScope is a lightweight scope and change-approval workspace for freelancers. It helps a service provider record what was originally agreed, capture new client requests, decide whether a request is included or additional, calculate the cost/time impact of extra work, and obtain a documented client decision before doing that work.

The client reviews and responds through a secure private link without creating an account.

**Core promise: Know what's included. Charge for what's extra.**

**Expanded promise:** GuardScope helps freelancers know what they agreed to, recognise what has changed, communicate the impact professionally, and obtain approval for additional work before doing it.

## 1.2 Problem statement

Freelancers often agree to a fixed project fee and defined deliverables. During delivery, clients may request extra sections, features, revisions, copy, design changes or other work not included in the agreement. The freelancer may not remember the exact boundary, may feel awkward requesting more money, or may have discussions scattered across WhatsApp, email, calls and documents. Extra work can therefore become unpaid work.

A researched Reddit example described a $2,000 landing-page project accumulating 23 additional hours, valued by the freelancer at $2,300, without extra payment. This is an illustrative reported experience, not a representative market statistic.

## 1.3 Market and competitive context

Research identified direct or adjacent products including ScopeYes, Docket, StayInScope, ScopeFrame, ScopePaid, Scopit, EZChangeOrders, ChangeOrder: Job Extras, Jobvia, Addenvo and ScopeLock. Broader freelancer/business suites include Bonsai, Dubsado, HoneyBook and PandaDoc.

Implications:
- This is not an empty category. “Create a change order and send an approval link” is not a sufficient differentiator by itself.
- Several direct tools already offer client approval without client registration.
- Many dedicated mobile change-order products focus on construction and trades.
- Broader suites can be perceived by some small operators as expensive, complex or overbuilt; individual reviews are not universal evidence.
- Ratings and download counts for some newer products are sparse and do not prove commercial success or failure.

**Recommended position:** Start with solo digital freelancers—web developers, designers, writers, content professionals and digital marketers—not construction firms or agencies.

Differentiate through:
1. Fast original-scope setup.
2. Clear deliverables, exclusions and revision allowance.
3. Quick manual capture of requests from any channel.
4. A useful comparison against the freelancer's recorded scope.
5. Professional cost/time communication and client approval.
6. No client account and a mobile-friendly decision page.
7. A trustworthy, versioned history of what was proposed and decided.

Do not attempt to match all-in-one CRM, invoicing, project-management or contractor suites in MVP.

## 1.4 Product principles

1. Scope clarity before workflow complexity.
2. Human judgement remains central; the system is not a legal or contractual decision-maker.
3. Make approval before extra work easy.
4. No client account required.
5. Preserve exact sent proposals and decisions.
6. Make request capture fast without requiring third-party integrations.
7. Keep the interface simple, mobile-friendly and accessible.
8. Never imply a timestamped approval is a qualified electronic signature or guaranteed legally enforceable contract.
9. Use a zero-budget-first architecture; no paid APIs for core functionality.
10. Build and test small increments; do not overbuild.

# 2. USERS, JOBS AND VALIDATION

## 2.1 Primary user

A solo freelancer or independent service provider who sells fixed-fee or project-based services and works directly with clients. Initial examples: web/frontend developers, website/graphic designers, copywriters, content writers and digital marketers.

## 2.2 Secondary user

The client's role is to open a private link, understand a proposed change and its price/time impact, then approve, decline or request clarification. The client must not need to register, create a password or learn a project-management tool.

## 2.3 Jobs to be done

When a client asks for something during a project, the freelancer wants to:
- Recall the original agreement.
- Check whether the request fits a deliverable, exclusion or remaining revision allowance.
- Record the request quickly.
- Decide whether it is included, additional or unclear.
- Explain extra cost/time professionally.
- Get a retrievable decision before doing chargeable extra work.
- See requested, quoted, approved and declined additional value.

## 2.4 Hypotheses to validate

These are assumptions, not established market facts:
- Solo freelancers experience scope changes often enough to value a dedicated tool.
- They will record the original scope if setup takes only a few minutes.
- They prefer a private approval link to client registration.
- They may pay approximately $9–$19/month if the product protects income and reduces awkward conversations.
- Manual request entry/paste is acceptable for an initial release.

Validation target before substantial expansion:
- Interview/survey 20–30 freelancers.
- Collect at least 10 concrete recent scope-creep examples.
- Recruit 5 beta users for real projects.
- Seek evidence of at least 3 paying customers before major expansion.
- Ask what users currently do, what fails, whether they would use no-login links, and whether the value justifies $9–$19/month.

# 3. PRODUCT GOALS AND SUCCESS MEASURES

## 3.1 MVP outcomes

A freelancer must be able to:
1. Register, sign in and manage an account.
2. Create a project and record its original agreement.
3. Record deliverables, exclusions, revision allowance, price and deadline.
4. Capture and classify a new request.
5. Create a priced/timed change order when appropriate.
6. Share a secure private link manually through WhatsApp, email or another channel.
7. Let the client approve, decline or ask for clarification without an account.
8. Preserve the exact proposal version and decision history.
9. Review project and financial impact summaries.
10. Export basic PDF records.
11. Use the product on mobile and desktop.

## 3.2 Measures

Track, with data minimisation: registration-to-first-project activation; completion of first scope; time to first project; projects with requests; requests sent for approval; decision rate and time to decision; approved change-order value by currency; weekly/monthly active freelancers; paid conversion, retention and cancellation reasons; support burden and infrastructure cost per active account.

Do not optimise vanity metrics over the core job.

# 4. RELEASE SCOPE

## 4.1 MVP MUST HAVE

### Account and workspace
- Registration, sign-in and sign-out using approved managed authentication.
- Secure account-scoped workspace and basic settings.
- Account deletion workflow and documented data handling.

### Projects
- Create, view, edit and archive projects.
- Project title, client name, optional client contact, description, agreed price, currency, optional start date/deadline and status.

### Original scope
- Scope summary.
- Structured deliverables.
- Explicit exclusions/not-included items.
- Included revision allowance, supporting none, numeric allowance or “not specified”.
- Agreed price and currency.
- Optional deadline, assumptions and notes.
- A dated baseline snapshot when the freelancer confirms the original scope.

### Request capture
- Manually add a request with title, description and received date.
- Optional source channel: WhatsApp, email, call, meeting or other.
- Freelancer classification: included, additional or needs clarification.
- Optional internal notes.
- No automated AI/legal classification in MVP.

### Change orders
- Create a change order from a request classified as additional.
- Describe the extra work and record price impact and/or time impact.
- Support price-only, time-only or both.
- Record assumptions and change-specific exclusions.
- Statuses: draft, pending/sent, approved, declined, clarification requested, cancelled and superseded.
- Drafts may be edited. Once sent, the presented version is frozen. Substantive changes create a new version.

### Client approval link
- High-entropy, unguessable, revocable private link.
- Client can open without an account.
- Show only the relevant proposal context, work description, price/currency and time impact.
- Client can approve, decline or request clarification, optionally with a comment.
- Record decision, server timestamp, proposal version and proportionate metadata.
- Show confirmation after successful submission.
- Prevent duplicate/conflicting decisions.
- Expired, revoked, superseded or already-decided links cannot silently accept a new decision.

### History and summaries
- Project activity history and change-order version/decision history.
- Requested, quoted, approved and declined additional value shown separately.
- Separate totals by currency; do not imply unlike currencies can be summed.
- Distinguish approved value from money invoiced or received. MVP does not process payments.

### Communication and PDF
- Copy approval link and copyable/editable client message templates.
- Templates for sharing a proposal, explaining an out-of-scope request and following up on a pending decision.
- Manual sharing only; no WhatsApp, email or SMS API integration.
- Basic PDF export for original scope, change order and decision record.
- PDFs show version, status, relevant dates, description, impact and decision. They are not certified legal documents.

### Application quality
- Responsive web app and installable PWA where practical.
- Loading, empty, validation, error and success states.
- Accessible labels, keyboard support and visible focus.
- Account-level data isolation.
- Server-side free-plan usage enforcement.

## 4.2 Explicitly OUT OF SCOPE for MVP

Do not build without a recorded human scope change:
- AI interpretation of contracts, automatic legal conclusions or AI request classification.
- WhatsApp Business API, Gmail/Outlook or inbox integrations.
- Automated email/SMS/WhatsApp delivery or reminders.
- E-signature integrations or qualified-signature claims.
- Invoicing, payment collection, escrow or accounting.
- Full project management, task boards, timesheets or resource planning.
- Team collaboration, agency roles, multiple workspaces or white-label/custom domains.
- Native Android/iOS apps.
- Complex reporting, CRM, lead management or marketing automation.
- External paid APIs not essential to core workflows.

## 4.3 Later opportunities, not commitments

Consider only after validation: AI-assisted request summarisation/comparison with human confirmation; email integrations; automated delivery/reminders; agency/team plans; custom branding; advanced analytics; freelancer-category templates; payment/invoicing integrations; native apps if usage evidence justifies them.

# 5. CORE USER JOURNEYS

## 5.1 Onboarding and first project
1. Freelancer registers/signs in.
2. Creates a project and enters client/project details.
3. Records deliverables, exclusions, revision allowance, price and deadline.
4. Reviews and confirms the scope baseline.
5. Dashboard displays the project and scope status.

## 5.2 Capture and classify a request
1. Client request arrives through an external channel.
2. Freelancer opens the project and adds the request.
3. Records request details and source channel.
4. Reviews original scope, deliverables, exclusions and revision allowance.
5. Classifies as included, additional or needs clarification.
6. Included requests are recorded without creating extra revenue; unclear requests remain unresolved; additional requests can become change orders.

## 5.3 Prepare and send change order
1. Freelancer creates a proposal from an additional request.
2. Describes the extra work and enters price/time impact.
3. Reviews client-facing content.
4. Sends it, freezing a version.
5. System creates a private approval link.
6. Freelancer copies and shares the link externally.

## 5.4 Client decision
1. Client opens the link.
2. Server validates token and proposal state.
3. Client sees only relevant information.
4. Client approves, declines or requests clarification, optionally adding a comment.
5. Server atomically validates and records the decision and timestamp.
6. Client sees confirmation; freelancer sees updated status/history.

## 5.5 Revised proposal
- Drafts may be edited.
- A substantive change to a sent proposal creates a new version.
- Preserve the old version and any decision.
- Superseded pending links must no longer accept decisions.
- New pending version receives a new link.

## 5.6 Project completion
- Freelancer completes or archives the project.
- History remains readable under retention rules.
- New change orders are disabled or require an explicit reopen action.

# 6. FUNCTIONAL REQUIREMENTS

Priority: P0 = MVP; P1 = useful follow-up; P2 = later.

## 6.1 Authentication
- **AUTH-001 P0:** Register, sign in and sign out.
- **AUTH-002 P0:** Protect authenticated pages and handle expired sessions clearly.
- **AUTH-003 P0:** Enforce account data isolation.
- **AUTH-004 P0:** Provide account deletion workflow and document data consequences.
- **AUTH-005 P1:** Password recovery or supported equivalent.
- **AUTH-006 P0:** Use managed authentication; never store plaintext passwords in app tables.

## 6.2 Projects
- **PROJ-001 P0:** Create/list/view/edit/archive projects.
- **PROJ-002 P0:** Validate required fields and field lengths.
- **PROJ-003 P0:** Display project status and key scope/change summaries.
- **PROJ-004 P0:** Enforce active-project limits server-side.

## 6.3 Scope baseline
- **SCOPE-001 P0:** Store scope summary, deliverables, exclusions, revision allowance, agreed price/currency and optional deadline/notes.
- **SCOPE-002 P0:** Support an editable unconfirmed draft.
- **SCOPE-003 P0:** Confirm and preserve an original scope snapshot/version.
- **SCOPE-004 P0:** Later scope edits must not rewrite the historical baseline.
- **SCOPE-005 P0:** Clearly distinguish original confirmed scope from current scope.

## 6.4 Requests
- **REQ-001 P0:** Create requests under a project with title, description, source and received date.
- **REQ-002 P0:** Classify as included, additional or needs clarification.
- **REQ-003 P0:** Record classification changes in activity history.
- **REQ-004 P0:** Included requests do not automatically create extra revenue.
- **REQ-005 P0:** Additional requests can create change orders.
- **REQ-006 P1:** Support internal notes that are never client-visible.

## 6.5 Change orders
- **CO-001 P0:** Create change order linked to project and originating request.
- **CO-002 P0:** Store description, price impact, currency, time impact/unit, assumptions and client-visible terms.
- **CO-003 P0:** Support zero monetary impact for time-only changes.
- **CO-004 P0:** Enforce draft/pending/approved/declined/clarification/cancelled/superseded state transitions server-side.
- **CO-005 P0:** Freeze a proposal when sent.
- **CO-006 P0:** Substantive edits after sending create a new version.
- **CO-007 P0:** Preserve all sent versions and decisions.
- **CO-008 P0:** Only an actionable pending version can receive a client decision.
- **CO-009 P0:** Prevent double approval or conflicting final decisions.
- **CO-010 P0:** Declined proposals remain in history; a replacement is a new proposal/version.

## 6.6 Client links and decisions
- **LINK-001 P0:** Generate cryptographically secure, high-entropy tokens server-side.
- **LINK-002 P0:** Store token hashes where practical; never rely on sequential IDs as security.
- **LINK-003 P0:** Scope each token to one specific proposal version and permitted actions.
- **LINK-004 P0:** Support revocation and expiry under an approved policy.
- **LINK-005 P0:** Invalid, expired, revoked, superseded and decided links return safe explanations.
- **LINK-006 P0:** Client does not need an account.
- **LINK-007 P0:** Public page cannot expose other projects, private notes or account data.
- **LINK-008 P0:** Store decision, server timestamp, version and optional comment.
- **LINK-009 P0:** Use atomic/idempotent submission or safely reject duplicates/conflicts.
- **LINK-010 P0:** Show successful decision confirmation.
- **LINK-011 P0:** Do not represent a basic click approval as a qualified electronic signature.

## 6.7 History and summaries
- **HIST-001 P0:** Record important project, scope, request, proposal and decision events.
- **HIST-002 P0:** Normal workflows cannot edit historical event/decision records.
- **HIST-003 P0:** Store actor type, event, timestamp and relevant entity/version.
- **HIST-004 P0:** Display requested, quoted, approved and declined totals separately.
- **HIST-005 P0:** Never describe approved value as collected revenue.
- **HIST-006 P0:** Separate totals by currency.

## 6.8 Communication and PDF
- **MSG-001 P0:** Editable/copyable message for sending a link.
- **MSG-002 P0:** Professional out-of-scope explanation template.
- **MSG-003 P0:** Pending-decision follow-up template.
- **MSG-004 P0:** No automatic message delivery in MVP.
- **PDF-001 P0:** Export original scope, change proposal and decision record.
- **PDF-002 P0:** PDF matches exact stored version/status and includes relevant dates and impact.
- **PDF-003 P0:** Do not claim certification or legal enforceability.

## 6.9 Plans and limits
Initial prices are hypotheses, not final commitments:

| Plan | Hypothesised price | Initial proposition |
|---|---:|---|
| Free | $0 | 1 active project; up to 3 active change requests; basic scope and approval links |
| Solo | $9/month | Up to 10 active projects; expanded/unlimited changes; PDF, revision tracking, financial summary and templates |
| Pro | $19/month | Unlimited projects; enhanced reports/history/export and branding options, subject to final scope |
| Agency | $39/month, later | Teams and multiple workspaces; not MVP |

- **BILL-001 P0:** Enforce free limits on the server.
- **BILL-002 P0:** Show plan and usage clearly.
- **BILL-003 P0:** Prevent direct API limit bypass.
- **BILL-004 P0:** Do not delete data when limits are reached or a plan expires.
- **BILL-005 P0:** Define fair read/export/access behaviour after downgrade/expiry.
- **BILL-006 P0:** Paid status must come from a trusted entitlement source, not client-controlled state.
- **BILL-007 P1:** Add a payment provider only after fees, availability, recurring billing, payout, tax and jurisdiction are reviewed and approved.
- **BILL-008 P0:** Until billing is approved, use a safe development/admin entitlement mechanism; never simulate real payment success in production.

# 7. BUSINESS RULES AND STATE MODEL

## 7.1 Request classification
- **Included:** Freelancer determines it is covered by the recorded agreement or remaining revision allowance.
- **Additional:** Freelancer determines it is outside the agreement and should be separately proposed.
- **Needs clarification:** Insufficient information to decide.

The freelancer makes the classification. GuardScope must not automatically charge a client or declare a request legally out of scope.

## 7.2 Revision allowance
- Store allowance explicitly.
- Track usage only when freelancer records a revision as consumed.
- Do not assume every message consumes a revision.
- Do not infer what counts as one revision.
- If not specified, display “not specified”; do not assume zero or unlimited.

## 7.3 Suggested change-order transitions
- `draft` → `pending` when sent.
- `pending` → `approved`, `declined` or `clarification_requested` by client action.
- `pending` → `cancelled` by freelancer before decision.
- `pending` → `superseded` when replacement is sent.
- Clarification may return to pending after freelancer responds or issues an updated proposal, as defined in the feature spec.
- Approved is terminal for that version. Corrections require a new record/version and explicit history.

Team Lead must document changes to state semantics and seek human approval when user-visible behaviour or audit meaning changes.

## 7.4 Approval is not payment

GuardScope records a client decision; MVP does not process or verify payment. Distinguish proposed, approved, invoiced and received amounts. Invoiced/received are unavailable in MVP. Never label an approved amount “paid”, “collected” or “earned”.

## 7.5 Time and currency

- Store time impact as a structured value with an explicit unit; preserve original deadline if a new proposed deadline is recorded.
- Store ISO currency code per project/change order where supported.
- Display unambiguous currency.
- Do not aggregate unlike currencies without an approved conversion source and timestamp.
- Do not assume all users bill in USD.

# 8. INFORMATION ARCHITECTURE AND UX

Primary navigation: **Dashboard**, **Projects**, **Settings/Account**.

**Dashboard:** active project count, pending client decisions, recent activity, approved additional value separated by currency, and create-project action. No elaborate analytics dashboard in MVP.

**Projects list:** project name, client label, status, deadline if provided, pending change count and agreed price. Useful empty state.

**Project detail:** Overview, Original scope, Requests/changes and History. Original scope should be easy to find.

**Create/edit forms:** concise grouped fields; optional fields are not falsely presented as mandatory; distinguish client-visible from internal-only data.

**Client proposal page:** mobile-first, fast, plain language, no freelancer dashboard, shows only necessary project context and proposed change, explicit cost/currency/time impact and decision actions. Handle invalid, expired and decided links clearly.

Visual direction: professional, calm, trustworthy SaaS; clear hierarchy; plain language; accessible contrast and focus; no aggressive warning treatment for ordinary statuses; no decorative complexity. Provide loading, empty, validation, error, offline/connection and success states as applicable.

# 9. PROPOSED LOGICAL DATA MODEL

This is a logical proposal, not authority to implement an unreviewed schema. Backend Agent must specify and obtain approval for the schema, RLS and migration plan in `ARCHITECTURE.md` and feature documents.

- **profiles:** `id` (auth user ID), display/business name, default currency, created/updated timestamps.
- **projects:** `id`, `owner_id`, title, client name, optional contact, description, agreed price, currency code, optional deadline, status, created/updated/archived timestamps.
- **scope_versions:** `id`, project, version number, scope summary, revision allowance type/value, assumptions, creator, timestamps, confirmed timestamp, original-baseline flag.
- **scope_items:** `id`, scope version, type (deliverable/exclusion/assumption), description, sort order, timestamp.
- **requests:** `id`, project, owner, title, description, source channel, received date, classification, internal notes, timestamps.
- **change_orders:** `id`, project, originating request, owner, current version reference, current status, timestamps.
- **change_order_versions:** `id`, change order, version number, description, price impact, currency, time impact value/unit, optional proposed deadline, assumptions, client-visible terms, created/sent timestamps. Immutable after sending.
- **approval_links:** `id`, proposal version, token hash, expiry, revoked timestamp, created timestamp and only justified access metadata. Raw token is returned only at creation and never logged.
- **client_decisions:** `id`, proposal version, approval link, decision, optional comment, server-generated decision timestamp and minimal justified security metadata. Immutable through normal workflows.
- **activity_events:** `id`, project, actor type/id, event type, entity type/id/version, concise summary, minimised metadata and server timestamp.
- **subscriptions/account_entitlements:** `id`, owner, plan code, status, billing period, provider reference if applicable and timestamps. Trusted source of entitlement must be explicit.

Integrity requirements:
- Use foreign keys/constraints and indexes appropriately.
- Enforce owner access through project relationships, not user-supplied owner IDs.
- Use transactions for decision submission/state changes.
- Use unique constraints/idempotency controls against duplicate decisions.
- Preserve immutable sent snapshots and decision records.
- Version migrations and document rollback/recovery.
- Define archive, deletion and retention behaviour before production.

# 10. TECHNICAL ARCHITECTURE — APPROVED DIRECTION

Recommended initial stack; material changes require rationale, trade-offs, migration/cost impact and human approval.

| Layer | Preferred technology | Constraint |
|---|---|---|
| Frontend | React + Vite | Web-first single codebase |
| Styling | Tailwind CSS | Consistent, rapid UI |
| App | Responsive web app / PWA | Native apps are not MVP |
| Backend platform | Supabase | Managed PostgreSQL, Auth and server-side capabilities |
| Database | Supabase PostgreSQL | Relational constraints and transactions |
| Authentication | Supabase Auth | Do not build password handling |
| Authorisation | PostgreSQL RLS + server-side checks | Least privilege and isolation |
| Server logic | Supabase Edge Functions or secure database functions | Token validation and sensitive state transitions |
| Frontend hosting | Cloudflare Pages or another approved free-tier static host | Confirm current limits and suitability |
| PDF | `pdf-lib` or another lightweight approved library | No paid document API |
| Icons | Lucide | Avoid unnecessary UI dependencies |
| Version control | Git + GitHub | Reviewable and reversible changes |
| Development | VS Code and approved AI coding environment | Existing development workflow |

Confirm current free-tier limits, data region, service terms, availability and operational constraints before finalising `ARCHITECTURE.md`. Free tiers are not unlimited or guaranteed perpetual.

## 10.1 Zero-budget constraints

- Core project, scope, request, approval and history workflows require no paid API.
- No LLM API in MVP.
- No email/SMS/WhatsApp API in MVP.
- Use manual copy-and-share.
- Monitor storage, database egress, functions and bandwidth.
- Domain or future hosting costs may arise; disclose rather than conceal them.
- Do not use an unapproved service solely because it offers a free trial.

## 10.2 Trust boundaries

**Browser:** presentation, usability validation and authorised interactions only. Never authoritative for access control, plan limits, approval state or timestamps.

**Backend:** authentication/ownership, validation, entitlements, token creation/validation, client decisions, server timestamps, atomic state transitions and safe data projection.

**Database:** constraints, RLS, relational integrity, historical versions and transactional decisions.

## 10.3 Public approval-link security

- Generate cryptographically random high-entropy tokens server-side.
- Store token hash where practical; never log raw token.
- Scope token to one proposal version and allowed actions.
- Support expiry and revocation.
- Validate current state server-side on every decision.
- Do not expose unrelated projects, private notes or freelancer account details.
- Protect repeated invalid attempts/rate-limit where supported.
- Avoid token leakage in analytics, logs, error reports and referrer headers.
- Use HTTPS; never expose service-role keys to browser code.
- Reject stale/superseded versions.
- Make decision submission atomic and safe against retries.

## 10.4 RLS and access control

- Authenticated users can access only their own permitted records.
- Verify ownership through the project relationship.
- Public client access must use a narrowly scoped secure server-side function or equivalent; no broad unrestricted table access.
- Test with at least two separate user accounts.
- Test unauthenticated access to protected routes and data.
- Privileged credentials must never be sent to the browser.

## 10.5 Errors and observability

Use user-safe errors; do not expose stack traces, secrets or database internals. Log enough to diagnose faults without logging approval tokens or unnecessary personal data. Handle network failure, retries and duplicate submissions. Use only approved monitoring options proportionate to privacy and cost. Document migration/deployment recovery.

# 11. PRIVACY, SECURITY AND TRUST

Collect only data needed to manage projects and approvals. Client email/phone is optional unless a future approved feature needs it. Do not collect identity documents, card data or unrelated personal information.

Baseline: HTTPS, managed authentication, RLS, server-side validation/authorisation, secure token handling, abuse controls, safe errors, managed secrets, dependency review, backups/restore guidance and no real customer data in development unless authorised and protected.

The product records proposal version, decision and server timestamp. This does not guarantee identity, non-repudiation, enforceability or compliance with any electronic-signature law. Use “recorded approval”, “decision history” and “approval record”. Do not claim “legally binding”, “court-proof” or “certified signature” without qualified legal review and appropriate capability.

Before production, publish an accurate privacy policy; document purpose, retention, deletion and third-party sharing; provide account deletion; define handling of project records, comments, events, exports and backups after deletion; and review laws in jurisdictions actually served. Do not claim compliance from a checklist alone.

# 12. NON-FUNCTIONAL REQUIREMENTS

- **Usability:** first-time freelancer can create a basic project without training; client decision needs no registration; common tasks are short and predictable.
- **Responsive:** modern mobile and desktop browsers; client approval mobile-first; no ordinary-content horizontal overflow.
- **Accessibility:** semantic structure, labels, keyboard operation, visible focus, contrast, field-associated errors and status not communicated by colour alone.
- **Performance:** lightweight frontend, bounded/paginated queries where needed, useful loading states; set measurable targets in test plans rather than claiming untested performance.
- **Reliability:** no duplicate decisions; safe retries; immutable sent versions; expiry handling; interrupted-flow testing; documented backup/recovery.
- **Maintainability:** clear modules, business rules outside presentation components, documented contracts, repeatable migrations, no unnecessary abstractions.

# 13. IMPLEMENTATION ROADMAP AND GATES

The roadmap is an ordered plan, not blanket permission to start all features. Human supervisor approval is required before each feature and before progression to the next.

## Phase 0 — Foundation and governance
Repository, Git strategy, this PRD, `AI_TEAM_OPERATING_PROTOCOL.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`, `HUMAN_APPROVAL_LOG.md`, decision/risk/issue registers, feature template, environment example without secrets, and repeatable setup/lint/type/test/build scripts.

**Gate:** Human approves architecture and first feature specification.

## Phase 1 — Authentication and app shell
App shell/navigation, registration/sign-in/sign-out, protected routes, account-scoped access foundation, dashboard empty state, responsive/accessibility patterns.

**Acceptance:** auth works; protected routes reject unauthenticated access; two test users cannot access each other's data; independent evidence recorded.

## Phase 2 — Projects and original scope
Project CRUD/archive; scope summary, deliverables, exclusions, revision allowance, price/currency/deadline; confirmed original scope snapshot.

**Acceptance:** data saves/reloads; baseline remains unchanged after later edits; validation and ownership tests pass.

## Phase 3 — Request capture and classification
Quick request form, source channel, included/additional/clarification classification, internal notes, history of classification changes.

**Acceptance:** correct project linkage; included requests do not create extra revenue; additional requests can proceed; no automatic legal classification.

## Phase 4 — Change-order proposal and versioning
Create proposal, price/time impact, client-facing description, draft editing, sent snapshot, version/status transitions.

**Acceptance:** drafts editable; sent versions immutable; new versions preserve old; server validates transitions.

## Phase 5 — Secure client approval
Token creation/validation, public proposal page, approve/decline/clarification, atomic decisions, expiry/revocation, confirmation and freelancer status update.

**Acceptance:** only intended proposal visible; invalid/revoked/expired/superseded links cannot decide; decisions attach once to exact version; duplicate/concurrent requests safe; cross-user leakage tests pass; security review complete.

## Phase 6 — History, financial summaries, templates and PDF
Activity timeline, requested/quoted/approved/declined totals, currency-safe summaries, copyable templates, PDF export.

**Acceptance:** history matches events; approved is not labelled paid; PDFs match exact stored version/status; long text and mobile layouts tested.

## Phase 7 — Plans and limits
Plan/entitlement model, free-plan active-project/change-request limits, usage display, safe upgrade/downgrade; payment provider only after explicit approval.

**Acceptance:** limits cannot be bypassed through direct calls; downgrade/expiry does not delete data; entitlement source is trusted; no simulated payment success in production.

## Phase 8 — Release readiness
Regression, security/privacy/accessibility/responsive review, backup/restore, production config, monitoring, privacy policy/support contact, deployment/rollback plan, Master Review Agent audit.

**Acceptance:** no unresolved blocker or critical/high security issue; evidence recorded; human explicitly approves production deployment.

## 13.1 Three-day planning target

| Day | Intended focus |
|---|---|
| 1 | Foundation, authentication, project CRUD and original scope |
| 2 | Request capture, classification, change orders, versioning and client approval |
| 3 | History, summaries, templates, PDF, plan limits, security/regression and deployment preparation |

This is a planning target, not permission to skip tests or gates. Extend the schedule if quality, security or data integrity is incomplete.

# 14. AI MULTI-AGENT DELIVERY GOVERNANCE

This section adopts the supplied **AI Multi-Agent Project Delivery Playbook, Version 1.0** as the mandatory GuardScope operating standard.

## 14.1 Six specialised roles

### Team Lead Agent — coordinator and gatekeeper
Enforces PRD/architecture/specs; breaks approved work into bounded tasks; assigns specialists; maintains status, dependencies, risks, issues, decisions and approvals; coordinates contracts; ensures independent testing/documentation/handoff; requests approval before the next feature. Cannot override requirements or make material decisions without approval.

### Frontend Agent — client application
Builds screens, components, navigation, forms, client state and interactions; follows approved design/accessibility; integrates through documented backend contracts; implements loading/empty/error/offline/success states and frontend tests. Does not independently change schemas, RLS or infrastructure.

### Backend Agent — services and data
Implements approved schemas, migrations, APIs, authentication/authorisation, business rules and integrations; enforces validation, access, integrity, auditability and secrets; documents contracts/migrations/rollback. No production data/policy changes without approval.

### Tester Specialist Agent — independent QA
Tests against feature specifications and acceptance criteria, not implementer assurances; runs applicable unit/integration/E2E/accessibility/responsive/regression tests; reports PASS/FAIL/BLOCKED with reproduction steps, expected/actual, environment and evidence; independently verifies fixes; never weakens tests to unblock delivery.

### Debug Specialist Agent — diagnosis and repair
Reproduces and identifies root cause; makes smallest safe fix; adds/updates regression tests; records changed files, risks and verification; never bypasses validation or removes security controls; returns fix to Tester for independent verification.

### Master Review Agent — independent release auditor
Reviews the completed product against current relevant platform, privacy, security and hosting requirements; audits data handling, account deletion, consent, accessibility, performance and stability; checks product claims against shipped behaviour; reports severity, evidence, remediation and retest. Never guarantees platform/store approval. If the environment cannot create native subagents, map roles to separate sessions or explicit role prompts and document that limitation. Never claim an agent/test ran if it did not.

## 14.2 Human supervisor authority

Explicit human approval is required for:
- Starting the next feature after the current gate passes.
- Product scope, user journey, pricing, privacy, security, retention or platform-support changes.
- Architecture, stack, core data model or external service-provider changes.
- Acceptance exceptions, unresolved defects or release blockers.
- Destructive operations, production migrations/deployment, store submission and material spending.

Silence or ambiguous wording is not approval. Record decision, approver, date/time, scope/version and conditions in `HUMAN_APPROVAL_LOG.md`.

## 14.3 Feature execution protocol

1. Select next roadmap feature and confirm dependencies.
2. Team Lead checks spec, acceptance criteria and open decisions.
3. Human supervisor explicitly approves implementation.
4. Team Lead assigns bounded frontend/backend tasks.
5. Parallel work only where interfaces/dependencies are clear.
6. Agents implement approved scope only.
7. Team Lead freezes feature scope for verification.
8. Tester independently tests and records evidence.
9. Failures are logged and assigned to Debug Specialist.
10. Debug Specialist diagnoses and fixes.
11. Tester independently retests and runs relevant regression.
12. Team Lead checks documentation, code review, migrations, security and handoff.
13. Team Lead submits completion report and requests approval for next feature.

**No next-feature implementation may begin without explicit human approval.**

## 14.4 Defect escalation

One fix attempt is a complete cycle: reproduce/diagnose, implement correction, run developer checks and submit for independent tester verification.
- Maximum five complete fix-and-retest cycles for the same unresolved bug.
- Record each attempt, evidence, changed files and remaining failure.
- After fifth unsuccessful cycle, stop automated attempts and escalate with logs, reproduction, test output, suspected cause and options.
- Immediately escalate critical security vulnerabilities, data loss/corruption, privacy exposure, payment-integrity issues or destructive production risks.
- Do not close an issue until Tester confirms fix and required regression passes.
- Non-critical limitations require documented impact, workaround, owner and explicit human approval. Critical security/data-integrity defects cannot be waived for release.

## 14.5 Definition of Done

A feature is DONE only when required criteria pass (or a permitted non-critical exception is explicitly approved), no critical/high defect remains, independent tests/evidence are recorded, code/security review is complete, migrations/contracts are documented, feature/project docs are current, repository state is verified, and Team Lead prepares a completion report. Human approval is required to progress.

## 14.6 Session/context handoff

Use a fresh AI session per feature by default. Load only the smallest complete set:
1. `AI_TEAM_OPERATING_PROTOCOL.md`.
2. This PRD and relevant approved architecture.
3. `PROJECT_STATUS.md` and relevant decision/risk/issue entries.
4. Target feature spec, implementation plan and test plan.
5. Handoffs/acceptance reports for directly related completed features.

Before editing, inspect repository, Git status, branch and commits; verify code/migrations/tests; identify role, task boundary, dependencies, acceptance criteria and permitted files; report ambiguities; propose a plan and wait for required approval.

At close, record branch/commit, completed work, actual tests/results/evidence, changed files, unresolved issues/risks and next safe action/approvals. Chat history is never the sole project record.

## 14.7 Git and change control

Use Git from the beginning; descriptive milestone commits; feature branches where practical; inspect status/diffs before and after; preserve user work; keep commits reviewable/reversible; review before merge; never commit secrets, credentials, personal data or local environment files; version migrations; no force-push, shared-history rewrite or destructive Git operation without approval.

## 14.8 Efficiency rules

Load smallest complete context; concise structured reports; reference PRD headings; avoid duplicate research/scans/tests; parallelise only independent work; assign file boundaries; reuse conventions/dependencies; avoid speculative abstractions; build smallest complete vertical slice; stop and ask when requirements conflict or are ambiguous.

# 15. REQUIRED PROJECT DOCUMENTATION

Create and maintain this structure without empty files or duplicated PRD content:

```text
guard-scope/
├── MASTER_PRD.md
├── AI_TEAM_OPERATING_PROTOCOL.md
├── ARCHITECTURE.md
├── PROJECT_STATUS.md
├── CHANGELOG.md
├── HUMAN_APPROVAL_LOG.md
├── docs/
│   ├── decisions/DECISION_LOG.md
│   ├── risks/RISK_REGISTER.md
│   ├── issues/ISSUES_REGISTER.md
│   ├── security/
│   ├── testing/
│   └── deployment/
├── features/
│   ├── foundation/
│   ├── authentication/
│   ├── projects-and-scope/
│   ├── request-capture/
│   ├── change-orders/
│   ├── client-approval/
│   ├── history-and-exports/
│   └── plans-and-limits/
├── src/
├── tests/
├── supabase/migrations/
└── public/
```

Each feature folder should contain relevant `FEATURE_SPEC.md`, `IMPLEMENTATION_PLAN.md`, `TEST_PLAN.md`, `ACCEPTANCE_REPORT.md`, `FEATURE_HANDOFF.md` and concise `CHANGELOG.md`. Do not copy the entire PRD into each folder; link to relevant sections.

# 16. REQUIRED TEAM LEAD REPORTS

**Feature start report:** feature/objective, approved spec version, dependencies, task owners, expected files/modules, risks, test approach, open decisions and approval reference.

**Defect report:** issue ID/severity, reproduction, expected/actual, environment, evidence/logs, suspected cause, attempts, owner and next action.

**Feature completion report:** delivered scope, files/migrations, demonstration where useful, acceptance results, test evidence, security/regression checks, limitations, documentation status, commit and request for next-feature approval.

**Escalation report:** reason work stopped, decisions required, options/trade-offs, risks, evidence, recommendation and whether other work can safely continue.

# 17. TESTING STRATEGY

Every feature needs explicit criteria and evidence. Test applicable happy paths, validation/boundaries, empty/error states, authentication/authorisation/cross-user isolation, unit logic, database/server integration, critical E2E, regression, accessibility, responsive behaviour, keyboard/screen-reader use, slow/offline networks, retries, duplicate/interrupted flows, performance, logging and recovery.

Critical end-to-end scenarios:
1. Register/sign in and create project.
2. Record deliverables, exclusions, revision allowance, price and deadline.
3. Confirm original scope; edit current scope without changing original snapshot.
4. Record an included request and verify it creates no extra revenue.
5. Record additional request and create change order.
6. Send proposal and copy link.
7. Unauthenticated client approves; freelancer sees approval against exact version.
8. Client declines another proposal; decline remains preserved.
9. Client requests clarification; it is not counted as approval.
10. Supersede pending proposal; old link cannot decide.
11. Duplicate/concurrent decisions do not conflict.
12. Expired/revoked/invalid links are rejected.
13. User A cannot access User B's records.
14. Free-plan limits enforced through direct backend calls.
15. PDF matches stored version and status.
16. Account deletion follows documented process.

Security-specific checks: token guessing/invalid handling; expiry/revocation; token leakage in logs/referrers/analytics; direct cross-user API access; RLS bypass; client attempts to access internal notes; duplicate/concurrent decisions; stale versions; privileged-key exposure; input validation/injection; abuse controls. UI appearance alone is not proof of correctness.

# 18. RISK REGISTER — INITIAL RISKS

| Risk | Impact | Mitigation |
|---|---|---|
| Emerging direct competitors | Basic approval links are not unique | Differentiate on scope baseline, quick capture and freelancer usability |
| Reluctance to adopt another tool | Users keep using chat/docs | Fast setup; validate with real freelancers |
| Client ignores link | Approval stalls | Clear page, pending status and copyable follow-up; automation later only if justified |
| Poor original scope entry | Comparison is weak | Simple setup, clear exclusions and revision rules |
| Misclassification | Legitimate work may be labelled extra | Freelancer decides; no legal/automatic classification |
| Historical proposal altered | Trust in record undermined | Immutable sent versions and version-specific decisions |
| Public link compromised | Data/decision exposure | High-entropy token, hash, expiry, revocation, scoped server validation and abuse controls |
| Legal overclaim | User relies on false assurance | Careful product language and qualified review before stronger claims |
| Free-tier limits change | Operating cost rises | Check terms, monitor usage and preserve portability |
| Low recurring usage | Churn | Validate retention; do not add unrelated features to manufacture engagement |
| Currency confusion | Misleading global totals | Per-record currency and no mixed-currency aggregation |
| Scope creep in product build | MVP delayed | Out-of-scope list, one feature at a time and human gates |

# 19. NAME AND BRAND CLEARANCE

GuardScope is a working name only (adopted by human-supervisor decision HA-001 on 16 Nov 2026, replacing the earlier working name). It has not been brand-cleared. Before public launch, check relevant trademark databases, domain/social handles, app stores if applicable and potential confusion with existing software. Do not spend on brand/domain until reviewed. If changed, update this PRD through an approved decision. Product functionality must not depend on the working name.

# 20. OPEN DECISIONS — DO NOT GUESS

1. Brand name clearance.
2. Whether to focus first on one digital freelancer category or launch across web developers, designers, writers and marketers.
3. Authentication method after reviewing current Supabase capabilities and user friction.
4. Default approval-link expiry and whether user-customisable; revocation remains mandatory.
5. Whether client name/email is required on decision page; default is minimum data collection.
6. Clarification workflow: reopen same proposal or issue a new version; history must remain intact.
7. Exact meaning of “active project” and “active change request” for plan limits.
8. Payment provider after reviewing fees, recurring billing, payouts, tax and jurisdiction.
9. Supported currency handling and default currency; do not assume USD.
10. Retention for archived projects, decisions, activity and backups.
11. Separate versus combined MVP PDFs.
12. Hosting region/provider limits, data location and free-tier suitability.

Agents may prepare recommendations and trade-offs but must not silently decide material items.

# 21. RELEASE ACCEPTANCE CHECKLIST

## Product
- [ ] Registration/sign-in works.
- [ ] Freelancer can create/manage projects.
- [ ] Original scope, deliverables, exclusions, revisions, price and deadline can be recorded.
- [ ] Original confirmed scope is preserved.
- [ ] Requests can be captured/classified.
- [ ] Additional requests can become change orders.
- [ ] Sent versions are immutable.
- [ ] Client can approve/decline/request clarification without account.
- [ ] Decision is timestamped and tied to exact version.
- [ ] Links can be revoked; expired links are rejected.
- [ ] History and financial summaries are accurate.
- [ ] PDF export is accurate.
- [ ] Free-plan limits are enforced server-side.

## Security and privacy
- [ ] RLS/server authorisation reviewed.
- [ ] Cross-user isolation tests pass.
- [ ] Public-link security tests pass.
- [ ] No secrets exposed in frontend/repository.
- [ ] Data minimisation and retention documented.
- [ ] Account deletion tested.
- [ ] Privacy policy reflects actual implementation.
- [ ] No critical/high security or data-integrity issue remains.

## Quality and governance
- [ ] Critical E2E and regression tests pass.
- [ ] Responsive/accessibility checks completed.
- [ ] Error/empty states reviewed.
- [ ] Backup/recovery and rollback documented.
- [ ] Master Review Agent report completed.
- [ ] Known limitations documented.
- [ ] Deployment plan, release owner and rollback trigger documented.
- [ ] Human supervisor explicitly approves production deployment.

# 22. FIRST INSTRUCTION TO THE AI AGENT BUILDER

You are the AI development team implementing GuardScope under this PRD and the supplied AI Multi-Agent Project Delivery Playbook.

**Do not start coding immediately.**

First:
1. Read this entire `MASTER_PRD.md` and the supplied playbook.
2. Create `AI_TEAM_OPERATING_PROTOCOL.md`, adapting the playbook without weakening its rules.
3. Inspect the development environment and repository. If no repository exists, propose minimal setup.
4. Produce `ARCHITECTURE.md` covering schema, RLS, public approval-link security, API contracts, environment variables, migrations, hosting, backups and rollback.
5. Create `PROJECT_STATUS.md`, `HUMAN_APPROVAL_LOG.md`, `CHANGELOG.md`, decision/risk/issue registers.
6. Convert Phase 1 into complete `FEATURE_SPEC.md`, `IMPLEMENTATION_PLAN.md` and `TEST_PLAN.md`.
7. Identify only decisions that block Phase 1; do not ask questions already answered here.
8. Submit an architecture and Phase 1 start report to the human supervisor.

Wait for explicit human approval before implementing Phase 1.

During implementation, follow approved specs and architecture, use the six roles, work one feature at a time, preserve scope, report actual tests, obtain independent verification, follow the five-cycle escalation rule, update documentation and handoffs, and never start the next feature without explicit human approval.

The product owner is the human supervisor. Agents advise and implement; they do not assume final authority.

# 23. FINAL GOVERNING PRINCIPLE

Build the smallest product that reliably protects the freelancer's scope and records client decisions. Keep the original agreement visible. Make additional work easy to price and approve. Preserve the exact history. Do not overbuild.

**Build deliberately. Test independently. Document what is true. Escalate what cannot be resolved safely. Keep the human supervisor in control of product direction and release decisions.**
