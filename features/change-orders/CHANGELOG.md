# Change-Order Proposal & Versioning — Changelog
- 2026-11-16: Spec, implementation plan and test plan (HA-007; OD-6 = HA-006).
- 2026-11-16: Migration `20261116190000_change_orders` (change_orders, change_order_versions, guard trigger with immutability + transition matrix, five RPCs, history events) applied to guardscope-dev. Developer pgTAP 39/39.
- 2026-11-16: UI: "Create change proposal" on Additional requests; proposal page (draft editor, client preview, send confirmation, sent versions, cancel, new version, discard, history); project page proposals section. 136 unit tests.
- 2026-11-16: Developer smoke found ISS-017: PostgREST returns numerics as JSON numbers, which crashed the proposal editor after save and latently the Phase 2 project edit form. Fixed with the `numericToInput` helper and regression tests.
- 2026-11-17: Tester run 1 (restart-interrupted, resumed): not accepted (D-1, D-2, flakes). Fix cycle 1 (dde2091). Retest 1 in chunks A/B/C: D-3 found and fixed (c43b082); regression 236/0 twice. **Accepted.**
