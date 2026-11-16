-- pgTAP: Phase 1 profiles isolation (TEST_PLAN T-07, T-08). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Two synthetic users (rolled back at the end)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'pgtap-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'pgtap-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- T-07: trigger creates profiles
select is((select count(*)::int from public.profiles where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')), 2, 'profiles created by trigger');

-- Function EXECUTE matrix: API roles cannot call internal functions
select ok(not has_function_privilege('anon', 'public.handle_new_user()', 'execute'), 'anon cannot execute handle_new_user');
select ok(not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'), 'authenticated cannot execute handle_new_user');
select ok(not has_function_privilege('authenticated', 'public.set_updated_at()', 'execute'), 'authenticated cannot execute set_updated_at');

-- Act as user A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'A sees exactly one profile');
select is((select id from public.profiles), '11111111-1111-1111-1111-111111111111'::uuid, 'A sees only own profile');

update public.profiles set display_name = 'hacked' where id = '22222222-2222-2222-2222-222222222222';

select lives_ok($$update public.profiles set display_name = 'Alice', default_currency = 'EUR' where id = '11111111-1111-1111-1111-111111111111'$$, 'A can update own profile');
select throws_ok($$update public.profiles set id = '33333333-3333-3333-3333-333333333333'$$, '42501', null, 'A cannot change id (column grant)');
select throws_ok($$insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333')$$, '42501', null, 'A cannot insert profiles');
select throws_ok($$delete from public.profiles$$, '42501', null, 'A cannot delete profiles');

-- Anon
reset role;
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');

reset role;
-- Verified as superuser, so B's row is visible to the check itself
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), null, 'A could not update B''s profile');
select * from finish();
rollback;
