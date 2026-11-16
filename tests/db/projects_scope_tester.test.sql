-- pgTAP: Phase 2 — Tester's independent suite (gaps not covered by projects_scope.test.sql).
-- TEST_PLAN T-02, T-05..T-08, T-10. Run: npx supabase test db, or (no Docker)
--   python3 -I scripts/pgtap-wrap.py tests/db/projects_scope_tester.test.sql  -> execute; ends in ROLLBACK.
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'p2t-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'p2t-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- ========== Grant matrix (ARCHITECTURE §5.1: "pgTAP asserts the expected grant matrix") ==========
select ok(not has_table_privilege('anon', 'public.projects', 'select,insert,update,delete')
      and not has_table_privilege('anon', 'public.scope_versions', 'select,insert,update,delete')
      and not has_table_privilege('anon', 'public.scope_items', 'select,insert,update,delete'), 'G1 anon has no table privileges on Phase 2 tables');
select ok(not has_table_privilege('authenticated', 'public.projects', 'delete'), 'G2 authenticated cannot DELETE projects (archive only, C-4)');
select ok(not has_table_privilege('authenticated', 'public.scope_versions', 'insert')
      and not has_table_privilege('authenticated', 'public.scope_versions', 'delete'), 'G3 authenticated cannot INSERT/DELETE scope_versions');
select ok(not has_column_privilege('authenticated', 'public.projects', 'owner_id', 'insert')
      and not has_column_privilege('authenticated', 'public.projects', 'owner_id', 'update'), 'G4 owner_id not insertable/updatable by clients');
select ok(not has_column_privilege('authenticated', 'public.projects', 'status', 'insert')
      and not has_column_privilege('authenticated', 'public.projects', 'archived_at', 'update')
      and not has_column_privilege('authenticated', 'public.projects', 'id', 'update'), 'G5 status not insertable; archived_at/id not updatable');
select ok(not has_column_privilege('authenticated', 'public.scope_versions', 'confirmed_at', 'update')
      and not has_column_privilege('authenticated', 'public.scope_versions', 'is_original_baseline', 'update')
      and not has_column_privilege('authenticated', 'public.scope_versions', 'project_id', 'update')
      and not has_column_privilege('authenticated', 'public.scope_versions', 'version_no', 'update')
      and not has_column_privilege('authenticated', 'public.scope_versions', 'agreed_price', 'update')
      and not has_column_privilege('authenticated', 'public.scope_versions', 'currency', 'update')
      and not has_column_privilege('authenticated', 'public.scope_versions', 'deadline', 'update'), 'G6 confirmation/snapshot columns not client-updatable');
select ok(not has_column_privilege('authenticated', 'public.scope_items', 'scope_version_id', 'update')
      and not has_column_privilege('authenticated', 'public.scope_items', 'kind', 'update'), 'G7 scope_items.scope_version_id/kind not updatable');
select ok(has_function_privilege('authenticated', 'public.confirm_scope(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'), 'G8 authenticated can execute the two intended RPCs');
select ok(not has_function_privilege('authenticated', 'public.create_initial_scope_draft()', 'execute')
      and not has_function_privilege('authenticated', 'public.scope_versions_guard()', 'execute')
      and not has_function_privilege('authenticated', 'public.scope_items_guard()', 'execute')
      and not has_function_privilege('authenticated', 'public.projects_before_write()', 'execute')
      and not has_function_privilege('anon', 'public.create_initial_scope_draft()', 'execute'), 'G9 internal trigger functions not executable by API roles');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)), 0,
          'G10 every public security definer function pins search_path');
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname in ('projects', 'scope_versions', 'scope_items')), 'G11 RLS enabled on all Phase 2 tables');

-- ========== A creates a project with every field ==========
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$insert into public.projects (title, client_name, client_contact, description, agreed_price, currency, start_date, deadline)
  values ('TP-A', 'Client A', 'x@example.test', 'Desc', 1500.50, 'EUR', '2026-11-01', '2026-12-31')$$, 'A1 A creates a project with all fields');
select is((select status from public.projects where title = 'TP-A'), 'active', 'A2 new project starts active (BR-2)');
select is((select version_no from public.scope_versions v join public.projects p on p.id = v.project_id where p.title = 'TP-A'), 1, 'A3 server-created draft is version 1');
select throws_ok($$insert into public.projects (title, client_name, currency, status) values ('S', 'C', 'EUR', 'archived')$$, '42501', null, 'A4 client cannot choose status on insert');
select throws_ok($$insert into public.scope_versions (project_id, version_no) select id, 9 from public.projects where title = 'TP-A'$$, '42501', null, 'A5 client cannot insert scope_versions');

-- ========== Server-side validation (AC-2 / T-02) ==========
select throws_ok($$insert into public.projects (title, client_name, currency) values (repeat('t', 201), 'C', 'EUR')$$, '23514', null, 'V1 title 201 chars rejected');
select lives_ok($$insert into public.projects (title, client_name, currency) values (repeat('t', 200), 'TP-LEN', 'EUR')$$, 'V2 title 200 chars accepted');
select throws_ok($$insert into public.projects (title, client_name, currency) values ('T', repeat('c', 201), 'EUR')$$, '23514', null, 'V3 client 201 chars rejected');
select throws_ok($$insert into public.projects (title, client_name, currency) values ('T', '  ', 'EUR')$$, '23514', null, 'V4 blank client rejected');
select throws_ok($$insert into public.projects (title, client_name) values ('T', 'C')$$, '23502', null, 'V5 missing currency rejected');
select throws_ok($$insert into public.projects (title, client_name, currency, client_contact) values ('T', 'C', 'EUR', repeat('x', 321))$$, '23514', null, 'V6 client contact 321 chars rejected');
select throws_ok($$insert into public.projects (title, client_name, currency, description) values ('T', 'C', 'EUR', repeat('x', 5001))$$, '23514', null, 'V7 description 5001 chars rejected');
select throws_ok($$insert into public.projects (title, client_name, currency) values ('T', 'C', 'EURO')$$, '22001', null, 'V8 4-letter currency rejected');
select throws_ok($$insert into public.projects (title, client_name, currency) values ('T', 'C', 'E1R')$$, '23514', null, 'V9 non-letter currency rejected');
select throws_ok($$insert into public.projects (title, client_name, currency, agreed_price) values ('T', 'C', 'EUR', 1e12)$$, '22003', null, 'V10 price above numeric(14,2) rejected');
select throws_ok($$update public.projects set deadline = '2026-10-01' where title = 'TP-A'$$, '23514', null, 'V11 update deadline before start rejected');
select throws_ok($$update public.projects set status = 'deleted' where title = 'TP-A'$$, '23514', null, 'V12 unknown status rejected');
select throws_ok($$update public.scope_versions set summary = repeat('s', 5001) where project_id = (select id from public.projects where title = 'TP-A')$$, '23514', null, 'V13 summary 5001 rejected');
select throws_ok($$update public.scope_versions set notes = repeat('s', 5001) where project_id = (select id from public.projects where title = 'TP-A')$$, '23514', null, 'V14 notes 5001 rejected');
select throws_ok($$update public.scope_versions set revision_allowance_type = 'number', revision_allowance_count = -1 where project_id = (select id from public.projects where title = 'TP-A')$$, '23514', null, 'V15 negative revision count rejected');
select throws_ok($$update public.scope_versions set revision_allowance_type = 'none', revision_allowance_count = 3 where project_id = (select id from public.projects where title = 'TP-A')$$, '23514', null, 'V16 count with type none rejected');
select throws_ok($$insert into public.scope_items (scope_version_id, kind, description) select v.id, 'deliverable', repeat('d', 1001) from public.scope_versions v join public.projects p on p.id = v.project_id where p.title = 'TP-A'$$, '23514', null, 'V17 item 1001 chars rejected');
select throws_ok($$insert into public.scope_items (scope_version_id, kind, description) select v.id, 'bonus', 'x' from public.scope_versions v join public.projects p on p.id = v.project_id where p.title = 'TP-A'$$, '23514', null, 'V18 unknown item kind rejected');
select throws_ok($$insert into public.scope_items (scope_version_id, kind, description) select v.id, 'deliverable', '   ' from public.scope_versions v join public.projects p on p.id = v.project_id where p.title = 'TP-A'$$, '23514', null, 'V19 blank item rejected');

-- draft content for A
select lives_ok($$
  update public.scope_versions set summary = 'S1', revision_allowance_type = 'not_specified', notes = 'N1'
    where project_id = (select id from public.projects where title = 'TP-A');
  insert into public.scope_items (scope_version_id, kind, description, sort_order)
    select v.id, k.kind, k.d, k.o from public.scope_versions v join public.projects p on p.id = v.project_id,
      (values ('deliverable', 'D1', 1), ('deliverable', 'D2', 2), ('exclusion', 'E1', 1), ('assumption', 'A1', 1)) k(kind, d, o)
    where p.title = 'TP-A'$$, 'A6 A fills the draft');
reset role;
select set_config('test.a_project', (select id::text from public.projects where title = 'TP-A'), true);
select set_config('test.a_v1', (select id::text from public.scope_versions where project_id = current_setting('test.a_project')::uuid and version_no = 1), true);
select set_config('test.a_d1', (select id::text from public.scope_items where scope_version_id = current_setting('test.a_v1')::uuid and description = 'D1'), true);

-- ========== B attacks A's draft (AC-8 / T-08) ==========
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$insert into public.scope_items (scope_version_id, kind, description) values (current_setting('test.a_v1')::uuid, 'deliverable', 'B was here')$$, '42501', null, 'B1 B cannot insert items into A''s draft');
select is((select count(*)::int from public.scope_items), 0, 'B2 B sees none of A''s items');
select is((select count(*)::int from public.projects where id = current_setting('test.a_project')::uuid), 0, 'B3 B cannot select A''s project by id');
update public.scope_items set description = 'B edit' where id = current_setting('test.a_d1')::uuid;
delete from public.scope_items where id = current_setting('test.a_d1')::uuid;
update public.scope_versions set summary = 'B summary' where id = current_setting('test.a_v1')::uuid;
update public.projects set status = 'archived' where id = current_setting('test.a_project')::uuid;
update public.projects set title = 'B title' where id = current_setting('test.a_project')::uuid;
select lives_ok($$insert into public.projects (title, client_name, currency) values ('TP-B', 'Client B', 'USD')$$, 'B4 B creates own project');
select throws_ok($$insert into public.scope_items (scope_version_id, kind, description)
  select current_setting('test.a_v1')::uuid, 'deliverable', 'x'$$, '42501', null, 'B5 B cannot insert into A''s draft via INSERT..SELECT');
reset role;
select is((select description from public.scope_items where id = current_setting('test.a_d1')::uuid), 'D1', 'B6 A''s item unchanged/not deleted by B');
select ok((select summary = 'S1' from public.scope_versions where id = current_setting('test.a_v1')::uuid), 'B7 A''s draft summary unchanged by B');
select ok((select status = 'active' and title = 'TP-A' from public.projects where id = current_setting('test.a_project')::uuid), 'B8 B could not change A''s project status/title');
select is((select owner_id from public.projects where title = 'TP-B'), 'b0000000-0000-4000-8000-0000000000b2'::uuid, 'B9 B''s project owned by B');

-- ========== A: confirm v1, snapshot, then attack immutability (AC-5..7 / T-05..T-07) ==========
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.confirm_scope(current_setting('test.a_v1')::uuid)$$, 'C1 A confirms v1');
reset role;
select set_config('test.v1_hash', (select md5(row(v.*)::text) from public.scope_versions v where id = current_setting('test.a_v1')::uuid), true);
select set_config('test.v1_items_hash', (select md5(string_agg(row(i.*)::text, '|' order by i.id)) from public.scope_items i where scope_version_id = current_setting('test.a_v1')::uuid), true);
select set_config('test.a_v2', (select id::text from public.scope_versions where project_id = current_setting('test.a_project')::uuid and version_no = 2), true);
select ok((select is_original_baseline and confirmed_at is not null and agreed_price = 1500.50 and currency = 'EUR' and deadline = '2026-12-31'
           from public.scope_versions where id = current_setting('test.a_v1')::uuid), 'C2 v1 baseline with snapshot');
select ok((select summary = 'S1' and notes = 'N1' and revision_allowance_type = 'not_specified' and confirmed_at is null
           from public.scope_versions where id = current_setting('test.a_v2')::uuid), 'C3 v2 draft copies summary/notes/allowance');
select is((select string_agg(kind || ':' || description || ':' || sort_order, ',' order by kind, sort_order) from public.scope_items where scope_version_id = current_setting('test.a_v2')::uuid),
          'assumption:A1:1,deliverable:D1:1,deliverable:D2:2,exclusion:E1:1', 'C4 v2 draft copies items with kind and order');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$update public.scope_versions set confirmed_at = null where id = current_setting('test.a_v1')::uuid$$, '42501', null, 'I1 owner cannot clear confirmed_at');
select throws_ok($$update public.scope_versions set is_original_baseline = false where id = current_setting('test.a_v1')::uuid$$, '42501', null, 'I2 owner cannot change is_original_baseline');
select throws_ok($$update public.scope_versions set confirmed_at = now() where id = current_setting('test.a_v2')::uuid$$, '42501', null, 'I3 owner cannot self-confirm draft by setting confirmed_at');
select throws_ok($$update public.scope_versions set agreed_price = 1 where id = current_setting('test.a_v1')::uuid$$, '42501', null, 'I4 owner cannot change snapshotted price');
select throws_ok($$update public.scope_items set scope_version_id = current_setting('test.a_v1')::uuid where scope_version_id = current_setting('test.a_v2')::uuid$$, '42501', null, 'I5 owner cannot move draft items into the baseline');
select throws_ok($$delete from public.scope_versions where id = current_setting('test.a_v1')::uuid$$, '42501', null, 'I6 owner cannot delete the baseline version');
update public.scope_versions set summary = 'tampered' where id = current_setting('test.a_v1')::uuid;
update public.scope_items set description = 'tampered', sort_order = 99 where scope_version_id = current_setting('test.a_v1')::uuid;
delete from public.scope_items where scope_version_id = current_setting('test.a_v1')::uuid;
-- the documented bypass flag must not help a client: RLS still hides confirmed rows from writes
select set_config('guardscope.account_deletion', 'on', true);
update public.scope_versions set summary = 'tampered-flag' where id = current_setting('test.a_v1')::uuid;
delete from public.scope_items where scope_version_id = current_setting('test.a_v1')::uuid;
update public.scope_items set description = 'tampered-flag' where scope_version_id = current_setting('test.a_v1')::uuid;
select set_config('guardscope.account_deletion', 'off', true);
-- edit project terms and draft, then confirm v2
update public.projects set agreed_price = 9999, currency = 'USD', deadline = '2027-03-31' where id = current_setting('test.a_project')::uuid;
update public.scope_items set description = 'D1 changed' where scope_version_id = current_setting('test.a_v2')::uuid and description = 'D1';
delete from public.scope_items where scope_version_id = current_setting('test.a_v2')::uuid and description = 'E1';
update public.scope_versions set summary = 'S2', revision_allowance_type = 'number', revision_allowance_count = 3 where id = current_setting('test.a_v2')::uuid;
select lives_ok($$select public.confirm_scope(current_setting('test.a_v2')::uuid)$$, 'C5 A confirms v2 after edits');
select throws_ok($$select public.confirm_scope(current_setting('test.a_v2')::uuid)$$, 'P0001', 'already_confirmed', 'C6 confirming v2 again -> already_confirmed');
reset role;
select is((select md5(row(v.*)::text) from public.scope_versions v where id = current_setting('test.a_v1')::uuid), current_setting('test.v1_hash'), 'C7 baseline row byte-for-byte unchanged (AC-6)');
select is((select md5(string_agg(row(i.*)::text, '|' order by i.id)) from public.scope_items i where scope_version_id = current_setting('test.a_v1')::uuid), current_setting('test.v1_items_hash'), 'C8 baseline items byte-for-byte unchanged (AC-6)');
select ok((select not is_original_baseline and agreed_price = 9999 and currency = 'USD' and deadline = '2027-03-31' and revision_allowance_count = 3
           from public.scope_versions where id = current_setting('test.a_v2')::uuid), 'C9 v2 snapshots the new terms and is not baseline');
select is((select count(*)::int from public.scope_versions where project_id = current_setting('test.a_project')::uuid and is_original_baseline), 1, 'C10 exactly one baseline');
select is((select count(*)::int from public.scope_versions where project_id = current_setting('test.a_project')::uuid and confirmed_at is null), 1, 'C11 exactly one draft (v3)');

-- ========== Archived project (BR-3, BR-6 / T-03) ==========
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
update public.projects set status = 'archived' where id = current_setting('test.a_project')::uuid;
reset role;
select set_config('test.a_v3', (select id::text from public.scope_versions where project_id = current_setting('test.a_project')::uuid and version_no = 3), true);
select ok((select archived_at is not null from public.projects where id = current_setting('test.a_project')::uuid), 'R1 archived_at set by server');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.confirm_scope(current_setting('test.a_v3')::uuid)$$, 'P0001', 'project_archived', 'R2 confirm blocked on archived project');
select throws_ok($$insert into public.scope_items (scope_version_id, kind, description) values (current_setting('test.a_v3')::uuid, 'deliverable', 'while archived')$$, '42501', null, 'R3 cannot add items to an archived project''s draft');
update public.scope_versions set summary = 'while archived' where id = current_setting('test.a_v3')::uuid;
delete from public.scope_items where scope_version_id = current_setting('test.a_v3')::uuid;
reset role;
select ok((select summary = 'S2' from public.scope_versions where id = current_setting('test.a_v3')::uuid)
      and (select count(*) = 3 from public.scope_items where scope_version_id = current_setting('test.a_v3')::uuid), 'R4 archived project''s draft not editable via API');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
update public.projects set status = 'active' where id = current_setting('test.a_project')::uuid;
reset role;
select ok((select status = 'active' and archived_at is null from public.projects where id = current_setting('test.a_project')::uuid), 'R5 reopen clears archived_at');

-- ========== B on A's confirmed / draft via RPC ==========
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$select public.confirm_scope(current_setting('test.a_v3')::uuid)$$, 'P0001', 'not_found', 'X1 B confirming A''s draft -> not_found');
select throws_ok($$select public.confirm_scope(current_setting('test.a_v1')::uuid)$$, 'P0001', 'not_found', 'X2 B confirming A''s confirmed version -> not_found (no state leak)');
select throws_ok($$select public.confirm_scope(gen_random_uuid())$$, 'P0001', 'not_found', 'X3 random id -> not_found');
reset role;

-- ========== unauthenticated RPC ==========
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.confirm_scope(current_setting('test.a_v3')::uuid)$$, 'P0001', 'not_authenticated', 'U1 confirm without sub -> not_authenticated');
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'not_authenticated', 'U2 delete_my_account without sub -> not_authenticated');
reset role;
set local role anon;
select throws_ok($$select public.confirm_scope(current_setting('test.a_v3')::uuid)$$, '42501', null, 'U3 anon cannot call confirm_scope');
select throws_ok($$insert into public.projects (title, client_name, currency) values ('anon', 'x', 'EUR')$$, '42501', null, 'U4 anon cannot insert projects');
reset role;

-- ========== B deletes own account; A's data untouched (AC-10 / T-10) ==========
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'D1 B deletes own account');
reset role;
select is((select count(*)::int from auth.users where id = 'b0000000-0000-4000-8000-0000000000b2')
        + (select count(*)::int from public.profiles where id = 'b0000000-0000-4000-8000-0000000000b2')
        + (select count(*)::int from public.projects where owner_id = 'b0000000-0000-4000-8000-0000000000b2'), 0, 'D2 no rows of B remain');
select ok((select count(*) = 1 from auth.users where id = 'a0000000-0000-4000-8000-0000000000a1')
      and (select count(*) = 2 from public.projects where owner_id = 'a0000000-0000-4000-8000-0000000000a1')
      and (select count(*) = 3 from public.scope_versions where project_id = current_setting('test.a_project')::uuid), 'D3 A''s account and data untouched by B''s deletion');
select set_config('guardscope.account_deletion', 'unset', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'D4 A (with confirmed baseline + v2) deletes own account');
reset role;
select is((select count(*)::int from public.scope_versions where project_id = current_setting('test.a_project')::uuid)
        + (select count(*)::int from public.scope_items i where i.scope_version_id in (current_setting('test.a_v1')::uuid, current_setting('test.a_v2')::uuid, current_setting('test.a_v3')::uuid))
        + (select count(*)::int from public.projects where owner_id = 'a0000000-0000-4000-8000-0000000000a1')
        + (select count(*)::int from auth.identities where user_id = 'a0000000-0000-4000-8000-0000000000a1'), 0, 'D5 no project, version, item or identity rows of A remain');
select is(coalesce(current_setting('guardscope.account_deletion', true), ''), 'off', 'D6 bypass flag is off after delete_my_account returns');

select * from finish();
rollback;
