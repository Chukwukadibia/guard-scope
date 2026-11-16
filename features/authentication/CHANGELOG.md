# Authentication & App Shell — Changelog
- 2026-11-16: Spec, implementation plan and test plan approved (HA-002); dev project created (HA-003). (bba0fcd)
- 2026-11-16: `profiles` migration applied to guardscope-dev; pgTAP isolation tests; dev test-user fixture (DEC-009). (9bf2cfa)
- 2026-11-16: Auth pages, protected shell, settings, PWA, CSP, bundle secret check. (9bf2cfa)
- 2026-11-16: Developer fix before testing: post-sign-in `next` redirect raced the session state, so the redirect moved into `RedirectIfSignedIn`. (9bf2cfa)
