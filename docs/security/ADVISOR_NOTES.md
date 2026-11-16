# Supabase security advisor: dispositions

| Lint | Object | Disposition |
|---|---|---|
| `authenticated_security_definer_function_executable` (WARN) | `public.confirm_scope(uuid)`, `public.delete_my_account()`, `public.classify_request(uuid, text)` (Phase 3), `create_change_order`, `send_change_order_version`, `cancel_change_order_version`, `new_change_order_version`, `discard_change_order_draft` (Phase 4). The internal helper `_lock_change_order` is not executable by API roles | **Intentional** (ARCHITECTURE §4.1, DEC-004). These are the only paths for state changes the client can't make directly. Both use `search_path=''`, check `auth.uid()` ownership explicitly, and are not executable by `anon` (pgTAP-asserted) |
| `auth_leaked_password_protection` (WARN) | Auth | ISS-008: dashboard setting for the product owner (may need a paid plan) |
