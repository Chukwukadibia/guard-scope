-- pgTAP: Tester-owned supplementary checks for Phase 1 (T-07, T-08, T-10, ARCHITECTURE §5.1).
-- Complements profiles_rls.test.sql, which does not assert row counts for cross-user writes,
-- does not cover anon writes, and does not check that A's own update actually persisted.
-- Run: npx supabase test db   (or: python3 -I scripts/pgtap-wrap.py <this file> and execute the output)
begin;
create extension if not exists pgtap with schema extensions;
create temp table _cnt (label text, n int);
grant insert, select on _cnt to anon, authenticated;
select plan(22);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'pgtap-ta@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'pgtap-tb@guardscope.test', '', now(), '{}', '{}', now(), now());

-- Schema / static checks
select is((select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a' and display_name is null and default_currency is null), 1, 'T-07/BR-4: new profile created by trigger with empty name and currency');
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, '§5.1: RLS enabled on every public table');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and (column_name ilike '%password%' or column_name ilike '%passwd%' or column_name ilike '%pwd%' or column_name ilike '%hash%' or column_name ilike '%secret%')
           and not (table_name = 'approval_links' and column_name = 'token_hash')), 0, 'T-10/AC-7: no password-like columns in public (only the Phase 5 approval_links.token_hash, a SHA-256 of a random link token, is allow-listed)');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.handle_new_user()'::regprocedure), 'security definer handle_new_user pins search_path to empty');
select ok(not has_function_privilege('anon', 'public.set_updated_at()', 'execute'), 'anon cannot execute set_updated_at');
select ok(not has_table_privilege('anon', 'public.profiles', 'select,insert,update,delete'), 'anon has no table privileges on profiles');

-- Act as user A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles where id = 'bbbbbbbb-0000-0000-0000-00000000000b'), 0, 'A selecting B by id returns 0 rows');
with u as (update public.profiles set display_name = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-00000000000b' returning 1) insert into _cnt select 'a_upd_b', count(*) from u;
select is((select n from _cnt where label = 'a_upd_b'), 0, 'A updating B affects 0 rows');
with u as (update public.profiles set display_name = 'Alice T', default_currency = 'EUR' where id = 'aaaaaaaa-0000-0000-0000-00000000000a' returning 1) insert into _cnt select 'a_upd_a', count(*) from u;
select is((select n from _cnt where label = 'a_upd_a'), 1, 'A updating own profile affects 1 row');
select is((select display_name || '/' || default_currency from public.profiles), 'Alice T/EUR', 'A own update persisted');
select throws_ok($$delete from public.profiles where id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$, '42501', null, 'A cannot delete B profile');
select throws_ok($$update public.profiles set created_at = now() where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, '42501', null, 'A cannot write created_at (column grant)');
select throws_ok($$update public.profiles set default_currency = 'eur' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, '23514', null, 'DB rejects lowercase currency');
select throws_ok($$update public.profiles set display_name = repeat('x', 121) where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, '23514', null, 'DB rejects 121-char display name');
select throws_ok($$update public.profiles set display_name = '' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, '23514', null, 'DB rejects empty display name');

-- Act as user B
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0, 'B cannot see A profile');
select is((select display_name from public.profiles where id = 'bbbbbbbb-0000-0000-0000-00000000000b'), null, 'B profile was not changed by A');

-- Anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$update public.profiles set display_name = 'x'$$, '42501', null, 'anon cannot update profiles');
select throws_ok($$insert into public.profiles (id) values ('cccccccc-0000-0000-0000-00000000000c')$$, '42501', null, 'anon cannot insert profiles');
select throws_ok($$delete from public.profiles$$, '42501', null, 'anon cannot delete profiles');

reset role;
select is((select count(*)::int from public.profiles where id in ('aaaaaaaa-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-00000000000b')), 2, 'both profiles still exist after attacks');
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0, 'profile cascades on auth user delete');
select * from finish();
rollback;
