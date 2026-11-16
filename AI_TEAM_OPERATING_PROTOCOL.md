# GuardScope — AI Team Operating Protocol

**Version:** 1.0 — **APPROVED (HA-002)**
**Date:** 16 Nov 2026
**Adapted from:** [AI Multi-Agent Project Delivery Playbook v1.0](docs/AI_MULTI_AGENT_PROJECT_DELIVERY_PLAYBOOK.md), as required by `MASTER_PRD.md` §14 and §22.2.
**Rule of adaptation:** This file may make the Playbook more specific to GuardScope. It may never weaken it. Where this file and the Playbook disagree, the stricter rule applies until the human supervisor decides.

---

## 1. Governing principles (Playbook §1)

- The approved PRD and architecture govern implementation. Agents must not invent scope.
- The Git repository and its history are the source of truth for what exists. Documentation is not proof that code exists.
- Deliver small, verifiable increments, one feature at a time.
- Implementation agents never approve their own work.
- The human supervisor has final authority over scope, exceptions and moving between features.
- Prefer the simplest maintainable solution. No speculative abstractions.

> **Core rule:** A feature is not complete because an agent says so. It is complete only when its acceptance criteria have been independently tested, evidence recorded, documentation updated and the required human approval obtained.

## 2. Source-of-truth hierarchy (Playbook §2, PRD §0.1)

1. Human supervisor's explicit recorded decision (`HUMAN_APPROVAL_LOG.md`)
2. `MASTER_PRD.md`
3. Approved `ARCHITECTURE.md`
4. Approved `features/<feature>/FEATURE_SPEC.md`
5. Git repository and history
6. `PROJECT_STATUS.md`, decision, risk and issue logs
7. Session handoffs (`FEATURE_HANDOFF.md`)

On a conflict: stop and report it to the Team Lead. Do not guess. The Team Lead records the resolution in `docs/decisions/DECISION_LOG.md`. Conflicts that affect scope, architecture, security, cost, privacy or UX go to the human supervisor.

## 3. Roles and how they run in this environment (Playbook §3)

GuardScope is built with Claude Code. One session acts as **Team Lead**. Specialists run as **subagents** spawned by the Team Lead, or as separate sessions where a fresh context is needed. **Limitation (DEC-002):** subagents share one container and one model, so independence comes from separate context and instructions, not separate organisations. Every report states how each role was run.

| Role | Runs as | Owns / may modify | Must not |
|---|---|---|---|
| **Team Lead** | Main session | Governance docs, status, logs, task breakdown, reports | Override approved requirements; make material product decisions; approve own scope changes |
| **Frontend Agent** | Subagent or role prompt | `src/` (except `src/lib/api/` contracts), `tests/unit` for UI | Change schema, RLS, migrations, infra or headers |
| **Backend Agent** | Subagent or role prompt | `supabase/`, `src/lib/api/`, contract sections of `ARCHITECTURE.md` once approved | Change production data or policies without an approved plan |
| **Tester Specialist** | **Always a separate subagent from whoever implemented the work** | `tests/`, `TEST_PLAN.md`, `ACCEPTANCE_REPORT.md` | Weaken tests or change acceptance criteria to unblock delivery; trust implementer assurances |
| **Debug Specialist** | Subagent | Smallest root-cause fix plus a regression test | Bypass validation, remove security controls, suppress errors, self-close issues |
| **Master Review Agent** | Separate subagent or session before release | `docs/security/`, `docs/deployment/` review reports | Guarantee approval by any platform or host |

**GuardScope adaptation of the Master Review Agent (DEC-003).** The Playbook (§3.6, §13) describes an Apple/Google store audit. GuardScope is a web app / PWA with no native apps in MVP (PRD §4.2, §10). PRD §14.1 directs the review at "platform, privacy, security and hosting requirements". So the release audit covers:
- the hosting provider (Cloudflare Pages) and Supabase terms and limits;
- browser and PWA installability requirements;
- the privacy policy against actual data flows;
- account deletion, security, accessibility (WCAG 2.2 AA target), performance and stability;
- product claims, especially that there is no "legally binding" or "certified signature" language (PRD §11).

The Playbook's store-specific checks apply unchanged if native apps are ever approved. Findings are classified **BLOCKER / HIGH / MEDIUM / LOW**, with evidence, the affected surface, the fix and retest status. The audit records the date and the sources consulted.

**Release gate (Playbook §13):** no unresolved BLOCKER or HIGH policy or security issue may proceed to release without a documented human decision. Critical security or data-integrity issues cannot be waived at all (§7). Approval by any host or platform can never be guaranteed.

**Never** claim that an agent, test or review ran when it did not.

## 4. Human supervisor approval (Playbook §4, PRD §14.2)

Explicit approval is required for:
- starting each feature, and moving to the next one;
- changes to scope, user journeys, pricing, privacy, security, data retention or platform support;
- changes to architecture, stack, core data model or external providers;
- exceptions to acceptance criteria, unresolved defects, release blockers or policy risks;
- destructive operations, production migrations or deployment, store submission and material spending. Creating a cloud project counts as provisioning and needs approval.

Silence, ambiguous wording or another agent's recommendation is **not** approval. Record each approval in `HUMAN_APPROVAL_LOG.md` with the ID, decision, approver, date, scope/version and conditions.

## 5. Documentation structure (Playbook §5, PRD §15)

Use the tree in PRD §15. Each feature folder holds `FEATURE_SPEC.md`, `IMPLEMENTATION_PLAN.md`, `TEST_PLAN.md`, `ACCEPTANCE_REPORT.md`, `FEATURE_HANDOFF.md` and `CHANGELOG.md`, created from `features/_TEMPLATE/` **when that feature starts**. Do not create empty files ahead of time. Link to PRD sections rather than copying them.

## 6. One feature at a time (Playbook §6, PRD §14.3)

1. Select the next roadmap feature (PRD §13) and confirm its dependencies.
2. Team Lead checks that the spec, acceptance criteria and required decisions are complete.
3. **Human supervisor approves the feature for implementation.**
4. Team Lead creates bounded tasks with file ownership. Work runs in parallel only when the interfaces are documented.
5. Agents implement the approved scope within their boundaries.
6. Team Lead freezes scope for verification.
7. Tester runs independent tests and records evidence (**PASS / FAIL / BLOCKED**).
8. Failures are logged in `docs/issues/ISSUES_REGISTER.md` and assigned to Debug.
9. Debug fixes. Tester retests independently and runs the relevant regression tests.
10. Team Lead checks docs, code review, migrations, security and handoff.
11. Team Lead submits the completion report (§13.3) and asks for approval of the next feature.

> **Progression gate:** No next-feature implementation may begin without explicit human approval. If the current feature is blocked, stay on it and report the blocker.

**Branching:** one branch per feature, named `feature/<phase>-<slug>` (for example `feature/p1-authentication`; Phase 0 used `phase-0/foundation`, created before this convention was written), merged into `main` only after review and the gate. Where the execution environment mandates a branch name, use it and record that in `PROJECT_STATUS.md`.

## 7. Defects and escalation (Playbook §7, PRD §14.4)

- One cycle = reproduce and diagnose → fix → developer checks → independent tester verification.
- **Maximum 5 cycles** per unresolved bug. Record each attempt (what was tried, evidence, files changed, remaining failure). After the 5th, stop and escalate (§13.4).
- **Escalate immediately, without waiting for 5 cycles:** critical security vulnerabilities, data loss or corruption, privacy exposure, payment-integrity issues, destructive production risk. For GuardScope this explicitly includes:
  - any path that lets a client decision attach to the wrong version;
  - any path that lets a sent version or decision be altered;
  - any cross-account data exposure.
- An issue closes only after the Tester confirms the fix and the regression passes.
- An accepted non-critical limitation needs its documented impact, workaround, owner and explicit human approval. Critical security or data-integrity defects are never waived.

## 8. Testing and Definition of Done (Playbook §8, PRD §14.5, §17)

Test what applies: happy paths, validation and boundaries, empty and error states, auth and cross-user isolation (**at least two users plus anon**), unit and business logic, DB integration (RLS), critical E2E, regression, accessibility (keyboard, screen-reader semantics, axe), responsive layout (375 px and 1280 px minimum), slow or offline networks, retries, duplicate and interrupted flows, performance, and logging.

**DONE** means:
- all required acceptance criteria PASS (or a non-critical exception is approved);
- no critical or high defects remain;
- independent evidence is recorded in `ACCEPTANCE_REPORT.md`;
- code and security review is complete;
- migrations and contracts are documented;
- docs are current;
- the Team Lead has verified repository state and written the completion report.

## 9. New-session handoff (Playbook §9, PRD §14.6)

Use a fresh session per feature by default. Load only:
1. this file;
2. `MASTER_PRD.md` and the relevant `ARCHITECTURE.md` sections;
3. `PROJECT_STATUS.md` and the relevant decision, risk and issue entries;
4. the target feature's spec, implementation plan and test plan;
5. handoffs and acceptance reports of directly related features.

Before editing: inspect the repo, `git status`, the branch and recent commits, and verify code, migrations and test results. At close: update `FEATURE_HANDOFF.md` and `PROJECT_STATUS.md` with branch/commit, work done, tests actually run, unresolved issues, changed files, next safe action and approvals needed.

### Reusable new-session prompt (Playbook §16, verbatim)

```text
You are joining an existing software project governed by the AI Multi-Agent Project Delivery Playbook.

BEFORE CHANGING ANYTHING:
1. Read AI_TEAM_OPERATING_PROTOCOL.md, the master PRD, approved ARCHITECTURE.md, PROJECT_STATUS.md and the target feature documents.
2. Inspect the repository, Git status, current branch and relevant commits. Verify implementation rather than trusting documentation alone.
3. Identify your assigned role, task boundary, dependencies, acceptance criteria and permitted files.
4. Report missing, contradictory or ambiguous requirements to the Team Lead. Do not invent scope or make material architectural decisions.
5. Propose a concise execution plan and wait for required approval.

DURING WORK:
- Stay within the assigned feature and file boundaries.
- Follow existing conventions and choose the simplest maintainable solution.
- Avoid unnecessary dependencies, abstractions and unrelated refactors.
- Preserve user changes; do not perform destructive operations without approval.
- Add/update appropriate tests and documentation.
- Report actual commands and results; never claim tests passed if they were not run.

AT HANDOFF:
- Summarise changes, files, commits, tests and evidence.
- List risks, limitations, unresolved issues and decisions needed.
- Update relevant handoff/status documents through the Team Lead.
- Do not start another feature unless the human supervisor explicitly approves it.
```

## 10. Efficiency (Playbook §10, PRD §14.8)

- Load the smallest complete context and reference PRD headings.
- Don't repeat scans or tests.
- Run work in parallel only when it is genuinely independent and file ownership is assigned.
- Reuse existing conventions and dependencies. Every new dependency needs a one-line justification in the implementation plan.
- Build the smallest complete vertical slice.
- Use the repeatable scripts in `package.json`: `lint`, `format`, `typecheck`, `test`, `test:e2e`, `build`.
- Stop and ask on ambiguity.

## 11. Git and change control (Playbook §11, PRD §14.7)

- Commit working milestones with descriptive messages. Inspect status and diffs before and after changes. Never discard user work.
- Keep commits reviewable and reversible. Don't mix unrelated changes. Review before merging.
- Never commit secrets, credentials, personal data or `.env*` files (only `.env.example`).
- Migrations live in `supabase/migrations/`, are append-only and are never edited after being applied. Each has rollback/recovery notes in the feature's `IMPLEMENTATION_PLAN.md`.
- No force-push, shared-history rewrite or destructive Git operation without approval.

## 12. Architecture, security and privacy guardrails (Playbook §12, PRD §10–§11)

- Follow `ARCHITECTURE.md`. Propose material changes with rationale, trade-offs, migration impact and cost.
- Least privilege, secure defaults, server-side validation and explicit authorisation. The browser is never authoritative for access, limits, approval state or timestamps (PRD §10.2).
- Secrets only in managed secret stores (Supabase/Cloudflare/GitHub secrets). Never in source, prompts, logs or client bundles. The service-role key never reaches the browser.
- Minimise personal data. **Document the purpose, retention, deletion and third-party sharing** of every personal-data field (in `docs/security/DATA_INVENTORY.md`, created in Phase 1 and updated each phase).
- Use encryption in transit and appropriate encryption at rest (provider-managed; VERIFY). Protect backups and exports. Use idempotency for repeatable operations, audit trails, and immutability for sent versions and decisions.
- Review dependencies, known vulnerabilities and **supported versions**. Avoid unnecessary packages.
- Review dependencies. No real customer data in dev or test. Never claim compliance from a checklist. Never claim "legally binding", "court-proof" or "certified signature" (PRD §11).

## 13. Required Team Lead reports (Playbook §15, PRD §16)

1. **Feature start:** feature and objective; approved spec version; dependencies; task owners; expected files/modules; risks; test approach; open decisions; approval reference.
2. **Defect:** issue ID and severity; reproduction; expected vs actual; environment; evidence/logs; suspected cause; attempts; owner; next action.
3. **Feature completion:** delivered scope; files and migrations; demonstration/screenshots; acceptance results; test evidence; security and regression checks; limitations; documentation status; commit; request for next-feature approval.
4. **Escalation:** why work stopped; decisions required; options and trade-offs; risks; evidence; recommendation; whether other work can safely continue.

## 14. Deployment and operations (Playbook §14)

- Environments: local (Supabase CLI), staging (a separate Supabase project plus a Cloudflare Pages preview) and production. Staging and production are created only after human approval.
- CI runs format, lint, typecheck, tests, build and a dependency audit.
- Migrations are tested on staging before production.
- Backups, restore test, monitoring, error reporting (privacy-proportionate, no tokens), rollback plan and **rollback trigger**, release owner, **version/build number**, deployment steps and smoke tests go in `docs/deployment/` before release.
- After release, monitor errors, latency, failed operations and user reports.
- Production deployment is a human approval gate.

## 15. Rules that must never be bypassed (Playbook §17, verbatim)

- No next feature without explicit human approval.
- No implementation agent approves its own work.
- No silent changes to approved requirements, architecture, security or privacy.
- No unverified claim that a feature, test, agent or review is complete.
- No more than five fix-and-retest cycles for the same unresolved bug before escalation; critical issues escalate immediately.
- No production deployment, destructive data operation or store submission without human authorisation.
- No reliance on conversation history as the only project context.
- No unnecessary complexity, dependencies or parallel work that increases integration risk without measurable benefit.

## 16. Adoption checklist (Playbook §18) — status

| Item | Status |
|---|---|
| Master PRD and approved architecture exist | PRD ✅ · Architecture drafted, **awaiting approval** |
| AI_TEAM_OPERATING_PROTOCOL.md in repo | ✅ (this file, awaiting approval) |
| Six roles configured or mapped | ✅ §3 |
| Status, decision, risk, issue and approval logs | ✅ |
| Feature directory template | ✅ `features/_TEMPLATE/` |
| Git repo, branch strategy, review process | Local repo ✅ · **Remote blocked (ISS-001)** |
| CI and local dev commands documented | ✅ `README.md`, `.github/workflows/ci.yml` |
| First feature has spec, implementation plan and test plan | ✅ `features/authentication/` |
| Human approval recorded before implementation | ⏳ Pending (HA-002) |
