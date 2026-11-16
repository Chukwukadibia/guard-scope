# Supabase project settings

Settings that live in the Supabase dashboard rather than in migrations. Record every change here.

## guardscope-dev (ref `eqozjuaaajstrewygqxr`, eu-west-2, Free) — HA-003

| Setting | Required value | Where | Status |
|---|---|---|---|
| Email provider enabled | On | Authentication → Sign In / Providers → Email | ✅ verified via `/auth/v1/settings` (`email: true`) |
| Confirm email | **On** (OD-3) | same | ✅ verified (`mailer_autoconfirm: false`) |
| Minimum password length | **8** (BR-1) | Authentication → Sign In / Providers → Email → Minimum password length | ✅ set by product owner; verified by Tester retest 1 (7 chars → 422) |
| Site URL | `http://localhost:4173` (dev) | Authentication → URL Configuration | ✅ set by product owner (reported 16 Nov, HA-005; not visible via public API) |
| Redirect URLs | `http://localhost:4173/**`, `http://localhost:5173/**` | Authentication → URL Configuration | ✅ set by product owner (reported 16 Nov, HA-005) |
| Custom SMTP | Not configured. The default sender only mails org team members (OD-13) | Authentication → Emails → SMTP | Open decision |

Production gets its own section when that project is approved.
