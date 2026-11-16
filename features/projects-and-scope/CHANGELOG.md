# Projects & Original Scope — Changelog
- 2026-11-16: Spec, implementation plan and test plan written from the approved PRD + architecture (HA-004).
- 2026-11-16: Migration `20261116130000_projects_scope` (projects, scope_versions, scope_items, RLS, column grants, immutability guards, `confirm_scope`, `delete_my_account`) applied to guardscope-dev. Forward fix `20261116131000_inline_deletion_flag`: the guard triggers run as the invoking role, so the helper was inlined.
- 2026-11-16: Developer pgTAP 32/32 (the immutability guard fires before RLS, so the test expectation was corrected). Account deletion via `security definer` delete of `auth.users` verified on dev.
- 2026-11-16: UI: projects list/filter, create/edit, detail with status actions, baseline/current/draft scope, draft editor with item reorder, confirm panel, Dashboard count + New project, Settings → Delete account, route error page.
- 2026-11-16: Developer fixes before testing: `formatDateTime` Intl option clash crashed pages showing confirmation times (regression unit test added); "(optional)" label accessible-name spacing; "Add an exclusion/assumption" grammar; count pluralisation.
- 2026-11-16: Tester run 1: not accepted (D-1..D-5). Fix cycle 1 (c380e81). Retest 1: **accepted**.
