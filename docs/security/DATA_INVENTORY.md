# Data Inventory (personal data)

Required by the operating protocol §12 (Playbook §12): purpose, retention, deletion and third-party sharing for every personal-data field. Update it in every phase that adds data.

| Data | Where stored | Purpose | Visible to | Retention | Deletion | Third parties |
|---|---|---|---|---|---|---|
| Email address | `auth.users.email` (Supabase Auth) | Sign-in, account emails | The account owner | While the account exists | Settings → Delete account (AUTH-004): removes the auth user; profile, projects and scope cascade immediately (OD-10, HA-004) | Supabase (processor, eu-west-2); the email provider once OD-13 is decided |
| Password | `auth.users.encrypted_password` (bcrypt, managed by Supabase Auth) | Authentication | Nobody (hashed) | While the account exists | As above | Supabase |
| Display / business name | `public.profiles.display_name` | Shown on client proposals (Phase 5) | Owner; later the owner's clients via proposal links | While the account exists | As above | Supabase |
| Default currency | `public.profiles.default_currency` | Pre-fill project currency | Owner | While the account exists | As above | Supabase |
| Client name and optional client contact | `public.projects.client_name`, `client_contact` | Identify the freelancer's client on the project | Owner only (Phase 5 will show the client name on the client's own proposal page) | While the project/account exists; archiving keeps it | Account deletion (cascade). No per-project delete in MVP | Supabase |
| Project details, price, dates, scope (summary, deliverables, exclusions, assumptions, notes) | `public.projects`, `public.scope_versions`, `public.scope_items` | Record the original agreement and later versions | Owner only | While the account exists. Confirmed versions are immutable by design | Account deletion (cascade; the immutability guard is bypassed only inside `delete_my_account`) | Supabase |
| Client requests (title, details, channel, received date, classification) and **private notes** | `public.requests` | Record what the client asked and the freelancer's decision | Owner only. Private notes are never selected outside the owner's request page and must never reach Phase 5's public page | While the account exists | Account deletion (cascade) | Supabase |
| Activity history and revision usage | `public.activity_events` (append-only), `public.revision_usages` | Decision history (REQ-003) and revision tracking (PRD §7.2) | Owner only | While the account exists; events are immutable by design | Account deletion (cascade, guard bypassed only inside `delete_my_account`) | Supabase |
| Change proposals (title, description, proposed price/time impact, currency, deadline, assumptions, exclusions, terms) | `public.change_orders`, `public.change_order_versions` | Propose additional work to the client (CO-001..CO-010) | Owner only in Phase 4. From Phase 5, the client sees **only the client-facing fields of the one version their link points to**, never private request notes | While the account exists; sent versions are immutable by design | Account deletion (cascade) | Supabase |
| Session tokens | Browser `localStorage` (`sb-<ref>-auth-token`) and Supabase Auth sessions | Keep the user signed in | The user's browser | Until sign-out or expiry | Sign-out (local) revokes the session | Supabase |
| Auth logs (IP, user agent) | Supabase platform logs | Security and abuse prevention (provider-managed) | Project admins | Provider log retention (VERIFY before production privacy policy) | Provider-managed | Supabase |

No analytics, tracking or error-reporting SDKs are used.
