# Supabase security advisor: dispositions

| Lint | Object | Disposition |
|---|---|---|
| `authenticated_security_definer_function_executable` (WARN) | `public.confirm_scope(uuid)`, `public.delete_my_account()`, `public.classify_request(uuid, text)` (Phase 3), `create_change_order`, `send_change_order_version`, `cancel_change_order_version`, `new_change_order_version`, `discard_change_order_draft` (Phase 4). The internal helper `_lock_change_order` is not executable by API roles | **Intentional** (ARCHITECTURE §4.1, DEC-004). These are the only paths for state changes the client can't make directly. Both use `search_path=''`, check `auth.uid()` ownership explicitly, and are not executable by `anon` (pgTAP-asserted) |
| `auth_leaked_password_protection` (WARN) | Auth | ISS-008: dashboard setting for the product owner (may need a paid plan) |
| `anon_security_definer_function_executable` (WARN) | `public.get_public_proposal(text)`, `public.submit_public_decision(text,text,text,uuid)` (Phase 5) | **Intentional and the core of Phase 5.** These two are the only anon-executable functions. They return an explicit projection / constant-shape JSON, validate and hash the token, throttle failures, and never expose tables. pgTAP asserts that no other function is anon-executable |
| `authenticated_security_definer_function_executable` (WARN) | `issue_approval_link`, `revoke_approval_link` (Phase 5), plus the two public RPCs | Intentional: owner actions check ownership via `_lock_change_order`; the public RPCs are meant for anyone |
| `rls_enabled_no_policy` (INFO) | `public.public_link_attempts`, `public.public_link_config` | **Intentional**: RLS on with no policies and no grants means no API role can read or write these tables; only the `security definer` RPCs touch them |

