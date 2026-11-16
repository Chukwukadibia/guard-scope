# Data Inventory (personal data)

Required by the operating protocol §12 (Playbook §12): purpose, retention, deletion and third-party sharing for every personal-data field. Update it in every phase that adds data.

| Data | Where stored | Purpose | Visible to | Retention | Deletion | Third parties |
|---|---|---|---|---|---|---|
| Email address | `auth.users.email` (Supabase Auth) | Sign-in, account emails | The account owner | While the account exists | Account deletion (AUTH-004, Phase 2) removes the auth user; `profiles` cascades | Supabase (processor, eu-west-2); the email provider once OD-13 is decided |
| Password | `auth.users.encrypted_password` (bcrypt, managed by Supabase Auth) | Authentication | Nobody (hashed) | While the account exists | As above | Supabase |
| Display / business name | `public.profiles.display_name` | Shown on client proposals (Phase 5) | Owner; later the owner's clients via proposal links | While the account exists | As above | Supabase |
| Default currency | `public.profiles.default_currency` | Pre-fill project currency | Owner | While the account exists | As above | Supabase |
| Session tokens | Browser `localStorage` (`sb-<ref>-auth-token`) and Supabase Auth sessions | Keep the user signed in | The user's browser | Until sign-out or expiry | Sign-out (local) revokes the session | Supabase |
| Auth logs (IP, user agent) | Supabase platform logs | Security and abuse prevention (provider-managed) | Project admins | Provider log retention (VERIFY before production privacy policy) | Provider-managed | Supabase |

No analytics, tracking or error-reporting SDKs are used.
