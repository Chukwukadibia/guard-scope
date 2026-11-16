# Request Capture & Classification — Changelog
- 2026-11-16: Spec, implementation plan and test plan (HA-005).
- 2026-11-16: Migration `20261116160000_requests` (requests, activity_events [append-only], revision_usages, event triggers, `classify_request`) applied to guardscope-dev. Developer pgTAP 32/32 on the first run.
- 2026-11-16: UI: quick request capture with optional details and private notes, classification filter, request page (compare with the confirmed scope, freelancer decision, per-request history, edit), revisions panel (allowance, used, remaining/over-use, record/undo). 110 unit tests.
- 2026-11-16: Developer smoke at 375 px: full journey passes. Fix: history reloads before the success notice.
