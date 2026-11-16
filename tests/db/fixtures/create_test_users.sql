-- DEV/TEST ONLY (DEC-009). Never run against production.
-- Creates two synthetic, already-confirmed users, because the default Supabase SMTP
-- cannot deliver confirmation emails to non-team addresses (OD-13).
-- Replace :PASSWORD_A / :PASSWORD_B before running (values live in .env.test.local, git-ignored).
-- Idempotent: removes the previous fixture users first (cascades to profiles).
delete from auth.users where email in ('a@guardscope.test', 'b@guardscope.test');

with u as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         v.email, extensions.crypt(v.pw, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from (values ('a@guardscope.test', ':PASSWORD_A'), ('b@guardscope.test', ':PASSWORD_B')) as v(email, pw)
  returning id, email
)
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from u;
