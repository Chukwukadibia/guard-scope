-- pgTAP: Phase 2 projects & scope (TEST_PLAN T-05..T-08, T-10). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'p2-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'p2-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- ---------- as A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($$insert into public.projects (title, client_name, currency, agreed_price, deadline) values ('Site', 'Acme', 'EUR', 2000, '2026-12-31')$$, 'A creates a project');
select is((select owner_id from public.projects where title = 'Site'), 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'owner_id comes from the session');
select throws_ok($$insert into public.projects (owner_id, title, client_name, currency) values ('bbbbbbbb-0000-0000-0000-000000000002', 'X', 'Y', 'EUR')$$, '42501', null, 'A cannot set owner_id');
select is((select count(*)::int from public.scope_versions v join public.projects p on p.id = v.project_id where p.title = 'Site' and v.confirmed_at is null), 1, 'initial draft created by server');
select throws_ok($$insert into public.projects (title, client_name, currency) values ('T', 'C', 'eur')$$, '23514', null, 'lowercase currency rejected');
select throws_ok($$insert into public.projects (title, client_name, currency, start_date, deadline) values ('T', 'C', 'EUR', '2026-12-01', '2026-11-01')$$, '23514', null, 'deadline before start rejected');
select throws_ok($$insert into public.projects (title, client_name, currency, agreed_price) values ('T', 'C', 'EUR', -1)$$, '23514', null, 'negative price rejected');
select throws_ok($$insert into public.projects (title, client_name, currency) values ('   ', 'C', 'EUR')$$, '23514', null, 'blank title rejected');

-- draft editing
select lives_ok($$update public.scope_versions set summary = 'Landing page', revision_allowance_type = 'number', revision_allowance_count = 2
  where project_id = (select id from public.projects where title = 'Site')$$, 'A edits draft');
select throws_ok($$update public.scope_versions set revision_allowance_type = 'number', revision_allowance_count = null
  where project_id = (select id from public.projects where title = 'Site')$$, '23514', null, 'number allowance needs a count');
select throws_ok($$select public.confirm_scope((select id from public.scope_versions where project_id = (select id from public.projects where title = 'Site')))$$,
  'P0001', 'empty_scope', 'confirm without deliverable rejected');
select lives_ok($$insert into public.scope_items (scope_version_id, kind, description, sort_order)
  select id, 'deliverable', 'Home page', 1 from public.scope_versions where project_id = (select id from public.projects where title = 'Site');
  insert into public.scope_items (scope_version_id, kind, description, sort_order)
  select id, 'exclusion', 'Copywriting', 1 from public.scope_versions where project_id = (select id from public.projects where title = 'Site')$$, 'A adds items');

-- confirm v1
select lives_ok($$select public.confirm_scope((select id from public.scope_versions where project_id = (select id from public.projects where title = 'Site') and version_no = 1))$$, 'A confirms v1');
select ok((select is_original_baseline and confirmed_at is not null and agreed_price = 2000 and currency = 'EUR' and deadline = '2026-12-31'
  from public.scope_versions where version_no = 1 and project_id = (select id from public.projects where title = 'Site')), 'v1 is baseline with snapshotted terms');
select is((select count(*)::int from public.scope_items i join public.scope_versions v on v.id = i.scope_version_id
  where v.version_no = 2 and v.project_id = (select id from public.projects where title = 'Site')), 2, 'v2 draft copies items');
select throws_ok($$select public.confirm_scope((select id from public.scope_versions where project_id = (select id from public.projects where title = 'Site') and version_no = 1))$$,
  'P0001', 'already_confirmed', 'double confirm rejected');

-- immutability of v1 (RLS hides it from update -> 0 rows; triggers also guard)
update public.scope_versions set summary = 'changed' where version_no = 1 and project_id = (select id from public.projects where title = 'Site');
delete from public.scope_items where scope_version_id = (select id from public.scope_versions where version_no = 1 and project_id = (select id from public.projects where title = 'Site'));
select throws_ok($$insert into public.scope_items (scope_version_id, kind, description) select id, 'deliverable', 'sneak' from public.scope_versions where version_no = 1 and project_id = (select id from public.projects where title = 'Site')$$,
  'P0001', 'scope_version_immutable', 'cannot add items to confirmed version (guard trigger fires before RLS check)');

-- later edits + v2
update public.projects set agreed_price = 3000, deadline = '2027-01-31' where title = 'Site';
update public.scope_items set description = 'Home page + blog' where kind = 'deliverable' and scope_version_id = (select id from public.scope_versions where version_no = 2 and project_id = (select id from public.projects where title = 'Site'));
select lives_ok($$select public.confirm_scope((select id from public.scope_versions where project_id = (select id from public.projects where title = 'Site') and version_no = 2))$$, 'A confirms v2');

reset role;
-- verified as superuser (sees everything)
select ok((select summary = 'Landing page' and agreed_price = 2000 and deadline = '2026-12-31' from public.scope_versions where version_no = 1 and project_id = (select id from public.projects where title = 'Site')), 'baseline unchanged after later edits');
select is((select string_agg(description, ',' order by kind) from public.scope_items i join public.scope_versions v on v.id = i.scope_version_id where v.version_no = 1 and v.project_id = (select id from public.projects where title = 'Site')), 'Home page,Copywriting', 'baseline items unchanged');
select ok((select not is_original_baseline and agreed_price = 3000 from public.scope_versions where version_no = 2 and project_id = (select id from public.projects where title = 'Site')), 'v2 confirmed, not baseline, new terms');
select throws_ok($$update public.scope_versions set summary = 'x' where version_no = 1 and project_id = (select id from public.projects where title = 'Site')$$, 'P0001', 'scope_version_immutable', 'trigger blocks even privileged update of confirmed version');
select throws_ok($$delete from public.scope_items where scope_version_id = (select id from public.scope_versions where version_no = 1 and project_id = (select id from public.projects where title = 'Site'))$$, 'P0001', 'scope_version_immutable', 'trigger blocks privileged delete of baseline items');

-- ---------- as B ----------
select set_config('test.a_draft', (select id::text from public.scope_versions where version_no = 3 and project_id = (select id from public.projects where title = 'Site')), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.projects), 0, 'B sees no projects of A');
select is((select count(*)::int from public.scope_versions), 0, 'B sees no scope versions of A');
select throws_ok($$select public.confirm_scope((select id from public.scope_versions limit 1))$$, 'P0001', null, 'B cannot confirm (no visible id)');
select throws_ok($$select public.confirm_scope(current_setting('test.a_draft')::uuid)$$, 'P0001', 'not_found', 'B confirming A''s draft by id -> not_found');
update public.projects set title = 'pwned';
reset role;
select is((select count(*)::int from public.projects where title = 'pwned'), 0, 'B could not update A''s project');

-- ---------- anon ----------
set local role anon;
select throws_ok($$select * from public.projects$$, '42501', null, 'anon cannot read projects');
reset role;
select ok(not has_function_privilege('anon', 'public.confirm_scope(uuid)', 'execute') and not has_function_privilege('anon', 'public.delete_my_account()', 'execute'), 'anon cannot execute RPCs');

-- ---------- account deletion (A) ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'A deletes own account');
reset role;
select is((select count(*)::int from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001')
        + (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001')
        + (select count(*)::int from public.projects where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'no rows of A remain');

select * from finish();
rollback;
