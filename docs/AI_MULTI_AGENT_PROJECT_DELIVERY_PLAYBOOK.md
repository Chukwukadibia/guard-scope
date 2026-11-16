<!-- Converted verbatim from AI_MULTI_AGENT_PROJECT_DELIVERY_PLAYBOOK_1.docx (supplied by the human supervisor, 16 Nov 2026). Text unchanged; formatting simplified. -->

# AI MULTI-AGENT PROJECT DELIVERY PLAYBOOK

A reusable governance and execution framework for building reliable software with AI agents

Version 1.0  |  Reusable across projects and AI development platforms

# 1. Purpose and governing principles

This playbook defines how an AI-assisted software project is organised, delegated, implemented, tested, documented, reviewed and released. It works with environments that support native subagents and with environments that require separate sessions and explicit handoffs.

The objective is dependable, secure, maintainable software delivered efficiently, without wasted effort, repeated context loading, unnecessary complexity or excessive token consumption.

- The approved product requirements and architecture govern implementation; agents must not invent scope.

- The repository and its version history are the source of truth for what actually exists.

- Documentation preserves intent, decisions, status and handoff context between sessions.

- Deliver work in small, verifiable increments, one feature at a time by default.

- Implementation agents never approve their own work.

- The human supervisor retains final authority over scope changes, exceptions and progression between features.

- Prefer the simplest maintainable solution that satisfies approved requirements. Avoid speculative abstractions and premature optimisation.

> **Core rule:** A feature is not complete because an agent says so. It is complete only when acceptance criteria have been independently tested, evidence recorded, documentation updated and required human approval obtained.

# 2. Authority and source-of-truth hierarchy

Use this hierarchy to resolve conflicting information. If sources conflict, stop and report the conflict to the Team Lead; do not guess.

| Artifact | Purpose | Authority |
|---|---|---|
| Master PRD / product brief | Goals, users, scope, requirements and acceptance outcomes | Product requirements |
| Approved architecture | System boundaries, stack, data flows and technical decisions | Technical design |
| Feature specification | Behaviour, constraints and acceptance criteria for one feature | Feature requirements |
| Git repository | Actual code, migrations, tests and configuration | Implementation reality |
| Project status and decision log | Progress, approvals, risks and decisions | Current project state |
| Session handoff | Relevant context and next safe action | Session continuity |

The Team Lead checks the hierarchy and records resolutions. Escalate conflicts that affect scope, architecture, security, cost, privacy or user experience to the human supervisor.

# 3. The six specialised agent roles

The Team Lead coordinates six roles. They may be native subagents, separate sessions or role-based task prompts. The system must never claim an independent agent or test ran when it did not.

## 3.1 Team Lead Agent — coordinator and gatekeeper

- Reads and enforces the master PRD, approved architecture and relevant feature specification.

- Breaks approved work into bounded tasks and assigns the right specialists.

- Maintains project status, dependencies, risks, issue register, decision log and approvals.

- Coordinates frontend/backend interfaces and resolves routine implementation questions within approved boundaries.

- Ensures independent testing, documentation, handoff and approval gates are complete.

- Reports to the human supervisor and requests approval before the next feature.

- Never overrides approved requirements or makes material product decisions without approval.

## 3.2 Frontend Agent — client application

- Builds screens, components, navigation, forms, client-side state and user interactions.

- Follows the approved design system, accessibility requirements and platform conventions.

- Integrates through documented backend contracts; reports missing contracts rather than inventing them.

- Implements loading, empty, error, offline and success states and appropriate frontend tests.

- Avoids unrelated backend, database, security-policy or infrastructure changes.

## 3.3 Backend Agent — services and data

- Implements database schemas, migrations, APIs, authentication/authorisation, business rules and server integrations.

- Enforces validation, access controls, data integrity, auditability and secure handling of secrets.

- Documents API contracts, schema changes, migration and rollback implications.

- Makes migrations repeatable and safe; never changes production data or policies without an approved plan.

- Avoids undocumented changes to unrelated feature boundaries.

## 3.4 Tester Specialist Agent — independent quality assurance

- Tests against feature specifications and acceptance criteria, not the implementer's assurances.

- Runs applicable unit, integration, end-to-end, accessibility, responsive, platform and regression tests.

- Reports PASS, FAIL or BLOCKED with reproduction steps, expected/actual results, environment and evidence.

- Independently verifies fixes and reruns affected regression tests.

- Never weakens tests or changes acceptance criteria merely to unblock delivery.

## 3.5 Debug Specialist Agent — diagnosis and repair

- Reproduces the issue and identifies root cause before changing code.

- Makes the smallest safe correction that addresses the cause, not merely the symptom.

- Adds or updates regression tests and records files changed, risks and verification steps.

- Never bypasses validation, removes security controls, suppresses errors or disables required behaviour to make tests pass.

- Returns the fix to the Tester Specialist for independent verification.

## 3.6 Master Review Agent — independent release auditor

- Reviews the completed product against current official Apple and Google store policies and technical requirements.

- Audits privacy, permissions, consent, account deletion, data handling, security, accessibility, performance, crashes and platform behaviour.

- Checks that store descriptions, screenshots, metadata and privacy declarations accurately reflect the shipped app.

- Produces findings with severity, evidence, remediation and retest status.

- Never guarantees store approval; Apple and Google make final decisions.

# 4. Human supervisor: authority and approval

The human supervisor is the final decision-maker. The Team Lead must obtain explicit approval for:

- Starting the next feature after the current feature passes its gate.

- Changes to product scope, user journeys, pricing, privacy, security, data retention or platform support.

- Changes to approved architecture, technology stack, core data model or external service providers.

- Exceptions to acceptance criteria, unresolved defects, release blockers or policy risks.

- Destructive operations, production migrations, production deployment, store submission and material spending.

Silence, ambiguous wording or a recommendation from another agent is not approval. Record approvals in HUMAN_APPROVAL_LOG.md with the decision, approver, date and conditions.

# 5. Feature-based documentation structure

Every feature has its own directory and concise Markdown documents. Keep documentation proportional: do not create empty files or duplicate information.

```text
project-root/
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
│   └── feature-name/
│       ├── FEATURE_SPEC.md
│       ├── IMPLEMENTATION_PLAN.md
│       ├── TEST_PLAN.md
│       ├── ACCEPTANCE_REPORT.md
│       ├── FEATURE_HANDOFF.md
│       └── CHANGELOG.md
├── src/
├── tests/
└── platform/backend configuration
```

- FEATURE_SPEC.md: user problem, goals, scope, user stories, rules, edge cases, dependencies and acceptance criteria. Requirements authority for that feature.

- IMPLEMENTATION_PLAN.md: technical approach, tasks, affected modules, contracts, migration plan and risks.

- TEST_PLAN.md: scenarios, fixtures, environments, expected results and regression scope.

- ACCEPTANCE_REPORT.md: actual outcomes, evidence, defects, exceptions and pass/fail decision.

- FEATURE_HANDOFF.md: what changed, files, APIs, schema, dependencies, limitations and safe next steps.

- CHANGELOG.md: concise dated record of meaningful changes.

Do not copy the entire master PRD into every feature folder. Link to relevant sections and record feature-specific requirements.

# 6. One feature at a time: controlled execution

The default delivery unit is one feature. Multiple tasks may exist inside it, but another feature cannot start until the current feature passes its gate and the human supervisor explicitly approves progression.

- Select the next feature from the approved roadmap and confirm dependencies.

- Team Lead checks that the feature specification, acceptance criteria and required decisions are complete.

- Human supervisor approves the feature for implementation.

- Team Lead creates bounded tasks and assigns frontend/backend responsibilities. Parallel work is allowed only when interfaces and dependencies are clear.

- Agents implement the approved scope and stay within assigned boundaries.

- Team Lead confirms readiness and freezes feature scope for verification.

- Tester performs independent testing and records evidence.

- If tests fail, Team Lead records the issue and assigns it to Debug Specialist.

- Debug Specialist diagnoses and fixes; Tester independently retests and runs relevant regression tests.

- When acceptance criteria pass, Team Lead checks documentation, code review, migrations, security and handoff.

- Team Lead presents the completion report and asks the human supervisor to approve the next feature.

> **Progression gate:** No next-feature implementation may begin without explicit human approval. If the current feature is blocked, remain on it and report the blocker.

# 7. Defect handling and escalation

A fix attempt is one complete cycle: reproduce and diagnose, implement a proposed correction, run developer checks, then submit the result for independent tester verification.

- Maximum five complete fix-and-retest cycles for the same unresolved bug.

- After each failed cycle, record what was tried, evidence, changed files and remaining failure.

- After the fifth unsuccessful cycle, stop automated attempts and escalate with logs, reproduction steps, test output, suspected cause and options.

- Immediately escalate critical security vulnerabilities, data loss/corruption, privacy exposure, payment integrity issues or destructive production risks. Do not wait for five attempts.

- Do not close an issue until the Tester confirms the fix and required regression tests pass.

- Any accepted non-critical limitation must have documented impact, workaround, owner and explicit human approval. Critical security or data-integrity defects cannot be waived for release.

# 8. Independent testing and definition of done

Testing depth depends on risk, but every feature needs explicit acceptance criteria and evidence. Test applicable areas:

- Happy paths, validation, boundaries, empty states and error states.

- Authentication, authorisation and cross-user data isolation where relevant.

- Unit tests for business logic; integration tests for services/database; end-to-end tests for critical journeys.

- Regression tests for affected existing features.

- Accessibility, responsive layouts, keyboard and screen-reader behaviour where relevant.

- Offline, slow network, retries, duplicate requests and interrupted flows where applicable.

- Performance, logging, observability and recovery behaviour proportionate to risk.

A feature is DONE only when all required acceptance criteria pass (or a non-critical exception is explicitly approved), no critical/high-severity defect remains, independent tests and evidence are recorded, code/security review is complete, migrations and contracts are documented, and feature/project documentation is current. The Team Lead must verify repository state and prepare a completion report.

# 9. New-session and context handoff protocol

Use a fresh AI session for each feature by default to reduce irrelevant context and token use. Load the smallest complete set of authoritative files needed:

- AI_TEAM_OPERATING_PROTOCOL.md.

- Master PRD and relevant approved architecture sections.

- PROJECT_STATUS.md and relevant decision, risk and issue entries.

- Target feature FEATURE_SPEC.md, IMPLEMENTATION_PLAN.md and TEST_PLAN.md.

- Handoffs and acceptance reports for directly related completed features.

Before editing, inspect the repository, Git status, branch and relevant commits. Documentation is not proof that code exists. Verify implementation, migrations and test results.

At session close, update handoff and project status with branch/commit, completed work, tests run, unresolved issues, changed files, next safe action and approvals needed. Never rely on chat memory as the only record.

# 10. Token, time and complexity efficiency

- Use context-first, task-bounded work: load the smallest complete set of files needed.

- Request concise structured reports: objective, changes, tests, evidence, risks, blockers and next action.

- Reference PRD headings and repository files instead of repeatedly pasting the full PRD.

- Avoid duplicate research, repeated codebase scans and redundant tests. Reuse documented findings when still valid.

- Parallelise only genuinely independent tasks. Assign file ownership or boundaries to prevent conflicting edits.

- Prefer existing conventions and dependencies over adding frameworks or libraries.

- Do not build speculative features, generic frameworks, abstraction layers or configuration systems without a demonstrated need.

- Implement the smallest complete vertical slice, then validate before expanding.

- Use repeatable scripts for setup, linting, formatting, type checks, tests and builds.

- Keep summaries focused; retain detailed failure output as artefacts and summarise it in handoffs.

- Stop and ask when requirements are ambiguous or contradictory rather than generating speculative code.

# 11. Git, branches and change control

- Use Git from the beginning and commit working milestones with descriptive messages.

- Use a dedicated feature branch where practical; prevent agents from overwriting uncommitted work.

- Inspect status and diffs before and after changes. Never discard or overwrite user work.

- Keep commits reviewable and reversible; do not combine unrelated changes.

- Require review before merging feature work into the integration branch.

- Never commit secrets, credentials, personal data or local environment files.

- Version-control database migrations and test them with rollback/recovery guidance.

- Do not force-push, rewrite shared history or perform destructive Git operations without approval.

# 12. Architecture, security and privacy guardrails

- Follow approved architecture and stack. Propose material changes with rationale, trade-offs, migration impact and cost before implementation.

- Apply least privilege, secure defaults, server-side validation and explicit authorisation checks.

- Keep secrets in approved secret-management systems; never place them in source, prompts, logs or client bundles.

- Minimise personal data. Document purpose, retention, deletion and third-party sharing.

- Use encryption in transit and appropriate encryption at rest; protect backups and exports.

- Design safe retries, idempotency, audit trails and data integrity for repeatable or interrupted operations.

- Review dependencies, vulnerabilities and supported versions; avoid unnecessary packages.

- Do not use real customer data in development/testing unless authorised and protected.

- Do not claim regulatory compliance based only on a checklist; identify applicable jurisdictions and seek qualified review when needed.

# 13. Release review and store-readiness audit

Before public release, the Master Review Agent conducts an adversarial review using current official Apple and Google sources and records the date and policies consulted.

- Functionality, stability, crashes, performance and supported OS/device coverage.

- Privacy policy, data-safety disclosures, app privacy details, consent and actual SDK behaviour.

- Permissions: request only when needed, explain purpose and handle denial gracefully.

- Account creation, sign-in, account deletion and data deletion requirements for each platform.

- Subscriptions, in-app purchases, billing disclosures, restore purchases and platform payment rules.

- Accessibility, moderation and user-generated content requirements where applicable.

- Store listing, screenshots, icons, age ratings and claims matching the shipped product.

- Production configuration, monitoring, backups, incident response and support contact.

- Signing, provisioning, build configuration, release notes and submission artefacts.

Findings are classified BLOCKER, HIGH, MEDIUM or LOW and include evidence, affected platform, recommended fix and retest status. No unresolved blocker or high-risk policy/security issue may proceed to submission without a documented human decision. Store approval cannot be guaranteed.

# 14. Deployment and operational readiness

- Maintain development, staging and production environments where feasible.

- Use repeatable CI checks for formatting, linting, type checking, tests, builds and security scans.

- Use environment-specific configuration and managed secrets.

- Test migrations and deployment procedures in staging before production.

- Define backups, restore tests, monitoring, error reporting and rollback procedures.

- Document release owner, version, build number, deployment steps, smoke tests and rollback trigger.

- After release, monitor crashes, errors, latency, failed jobs, notification delivery and user reports.

- Production deployment and store submission are human approval gates.

# 15. Required Team Lead reports

## 15.1 Feature start report

Feature and objective; approved specification version; dependencies; task owners; expected files/modules; risks; test approach; open decisions; approval reference.

## 15.2 Defect report

Issue ID and severity; reproduction steps; expected versus actual result; environment; evidence/logs; suspected cause; attempts completed; owner; next action.

## 15.3 Feature completion report

Delivered scope; files and migrations changed; demonstration/screenshots; acceptance results; test evidence; security/regression checks; known limitations; documentation status; commit reference; request for approval to start the next feature.

## 15.4 Escalation report

Why work stopped; decisions required; options and trade-offs; risks; evidence; recommendation; whether other work can safely continue.

# 16. Reusable prompt for a new AI development session

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

# 17. Rules that must never be bypassed

- No next feature without explicit human approval.

- No implementation agent approves its own work.

- No silent changes to approved requirements, architecture, security or privacy.

- No unverified claim that a feature, test, agent or review is complete.

- No more than five fix-and-retest cycles for the same unresolved bug before escalation; critical issues escalate immediately.

- No production deployment, destructive data operation or store submission without human authorisation.

- No reliance on conversation history as the only project context.

- No unnecessary complexity, dependencies or parallel work that increases integration risk without measurable benefit.

# 18. Project adoption checklist

- ☐ Master PRD and approved architecture exist.

- ☐ AI_TEAM_OPERATING_PROTOCOL.md is added to the repository.

- ☐ Six agent roles and instructions are configured or mapped to sessions.

- ☐ Project status, decision, risk, issue and approval logs are created.

- ☐ Feature directory template is available.

- ☐ Git repository, branch strategy and review process are established.

- ☐ CI checks and repeatable local development commands are documented.

- ☐ First feature has a complete specification, implementation plan and test plan.

- ☐ Human approval is recorded before implementation begins.

> **Final operating principle:** Build deliberately. Test independently. Document what is true. Escalate what cannot be resolved safely. Keep the human supervisor in control of product direction and release decisions.
