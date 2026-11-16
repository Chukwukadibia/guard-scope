# Phase 1 — Authentication & App Shell — Feature Specification

**Version:** 0.1 · **Status:** DRAFT — awaiting approval (HA-002) · **PRD refs:** §4.1 Account and workspace, §6.1, §8, §10.2, §10.4, §12, §13 Phase 1

## 1. User problem
A freelancer needs a private, secure workspace before they can record any client agreement. Without trustworthy sign-in and account isolation, nothing later in GuardScope can be trusted.

## 2. Goals / non-goals
**Goals:** register, sign in and sign out with managed auth; protect authenticated pages; build the account-scoped data foundation (`profiles` + RLS); provide the app shell with Dashboard / Projects / Settings navigation; show the dashboard empty state; establish responsive and accessible UI patterns for later features.

**Non-goals (this phase):** projects, scope or anything else in Phases 2–8; social/OAuth login; plan limits; payments. AUTH-004 (account deletion) and AUTH-005 (password recovery) are covered in §7.

## 3. Scope

| Req | In Phase 1 | Notes |
|---|---|---|
| AUTH-001 | ✅ | Email + password (⚠ OD-3 must confirm) |
| AUTH-002 | ✅ | Route guard; expired/invalid session → sign-in with a clear message |
| AUTH-003 | ✅ (foundation) | `profiles` RLS; pattern reused by all later tables |
| AUTH-006 | ✅ | Supabase Auth only; no password columns in app tables |
| AUTH-004 | ⚠ Decision D-P1-4 | See §7 |
| AUTH-005 (P1) | ⚠ Decision D-P1-5 | See §7 |
| Basic settings (§4.1) | ✅ | Display/business name; default currency (⚠ OD-9) |
| App shell / nav (§8) | ✅ | Dashboard, Projects, Settings/Account |
| Dashboard empty state (§8) | ✅ | "No projects yet". The create-project action is left out until Phase 2, so the UI shows no non-working actions |
| Projects page | ✅ empty state only | Placeholder text "Projects will appear here", with no create action until Phase 2 |

## 4. User stories
- **US-1:** As a new freelancer, I can register with my email and a password, so I get a private workspace.
- **US-2:** As a registered freelancer, I can sign in and sign out.
- **US-3:** If my session expires or I open a protected page while signed out, I'm sent to sign in, told why, and returned to the page I wanted afterwards.
- **US-4:** As a signed-in freelancer, I see navigation to Dashboard, Projects and Settings on mobile and desktop.
- **US-5:** In Settings I can set my display/business name and default currency, and see the email I'm signed in with.
- **US-6:** Another account can never read or change my profile.

## 5. Business rules
- BR-1: Passwords are handled only by Supabase Auth. Minimum length is 8 characters (Supabase setting). No complexity rules beyond what Supabase enforces (VERIFY current options).
- BR-2: If email confirmation is on (⚠ OD-3), an unconfirmed user cannot sign in. The UI says "Check your email to confirm your account" and does not reveal whether an email is already registered.
- BR-3: A `profiles` row is created server-side by a trigger on `auth.users` insert. The client never inserts it.
- BR-4: `default_currency` starts empty. The UI must not pre-fill USD. If it is empty, Settings shows "Not set".
- BR-5: Auth error messages are generic ("Email or password is incorrect"), with no account enumeration.
- BR-6: Public routes are `/sign-in`, `/register`, `/p` (reserved for Phase 5; it renders "Link not available" until then) and static legal placeholders. Every other route requires a session.

## 6. States & edge cases
- Loading: the session check on app start shows a full-page spinner with an `aria-live` label, with no flash of protected content.
- Validation: invalid email, password shorter than 8, display name over 120 characters. Errors are field-associated (`aria-describedby`) and summarised on submit.
- Errors: network failure shows "Can't reach GuardScope. Check your connection and try again." Supabase rate-limit gets a friendly message.
- Offline: the app shell loads from the PWA cache, and an offline banner appears. Auth actions are disabled while offline.
- Success: a toast or inline status after saving settings or signing out.
- Double-submit: buttons are disabled while a request is in flight.
- Multiple tabs: signing out in one tab signs out the others (`onAuthStateChange`).

## 7. Dependencies & decisions that block this phase
- **D-P1-3 = OD-3 auth method.** Recommendation: email + password with email confirmation.
- **D-P1-12 = OD-12 Supabase region / project creation.** Phase 1 needs a Supabase project, or Docker for a local stack (R-14). Creating a project needs approval.
- **D-P1-9 = OD-9 default currency field.** Recommendation: optional ISO 4217 picker, no default.
- **D-P1-4 = Is account deletion (AUTH-004) in Phase 1?** PRD §13 Phase 1 doesn't list it, but §4.1/§6.1 make it P0 and it depends on OD-10 retention. Recommendation: build it in **Phase 2**, when user data first exists, so deletion is tested against real records. It must still ship before release.
- **D-P1-5 = Password recovery (AUTH-005, P1).** Recommendation: include it in Phase 1. It is small with Supabase, and leaving users locked out is costly.

## 8. Acceptance criteria
| ID | Criterion |
|---|---|
| AC-1 | A new user can register; after confirmation (if enabled) they can sign in and land on the Dashboard |
| AC-2 | A signed-in user can sign out; protected pages then redirect to `/sign-in` |
| AC-3 | Unauthenticated visits to `/`, `/projects` and `/settings` redirect to `/sign-in?next=…` with no protected content rendered. After sign-in the user reaches `next`. Only same-origin relative `next` values are accepted (no open redirect) |
| AC-4 | An expired or invalid session (token removed or tampered) results in a redirect to sign-in with the message "Your session has ended. Please sign in again." |
| AC-5 | A `profiles` row exists for every new user, created by the trigger |
| AC-6 | User A cannot select, update or delete User B's profile through the REST API with A's JWT (0 rows / error). Anon cannot read `profiles` at all |
| AC-7 | No password or password hash exists in any `public` table. The service-role key is not in the built bundle (`grep` of `dist/`) |
| AC-8 | Settings saves the display name and default currency, and they persist after reload. Validation errors appear for invalid input |
| AC-9 | Navigation works at 375 px and 1280 px with no horizontal overflow. On mobile the nav is reachable and keyboard-operable |
| AC-10 | All pages in this phase have zero axe *serious/critical* violations, a visible focus indicator, labelled inputs and a logical heading order |
| AC-11 | Auth error messages do not reveal whether an email is registered |
| AC-12 | Dashboard and Projects show helpful empty states and contain no non-functional actions |
| AC-13 (if D-P1-5 = yes) | A user can request a password-reset email and set a new password from the link |
