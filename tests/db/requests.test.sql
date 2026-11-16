-- pgTAP: Phase 3 requests, classification history, revision usage (TEST_PLAN T-02..T-08). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'p3-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'p3-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- ---------- as A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
insert into public.projects (title, client_name, currency) values ('P3 Site', 'Acme', 'EUR'), ('P3 Other', 'Acme', 'EUR');

select lives_ok($$insert into public.requests (project_id, title) values ((select id from public.projects where title = 'P3 Site'), 'Add a blog')$$, 'A creates request with title only');
select is((select received_on from public.requests where title = 'Add a blog'), current_date, 'received_on defaults to today');
select is((select count(*)::int from public.activity_events where event_type = 'request.created' and entity_id = (select id from public.requests where title = 'Add a blog')), 1, 'request.created event recorded');
select throws_ok($$insert into public.requests (project_id, title, received_on) values ((select id from public.projects where title = 'P3 Site'), 'Future', current_date + 5)$$, '23514', 'received_on_in_future', 'future received date rejected');
select throws_ok($$insert into public.requests (project_id, title, source_channel) values ((select id from public.projects where title = 'P3 Site'), 'Bad channel', 'telegram')$$, '23514', null, 'invalid channel rejected');
select throws_ok(format($$insert into public.requests (project_id, title) values ((select id from public.projects where title = 'P3 Site'), %L)$$, repeat('x', 201)), '23514', null, '201-char title rejected');
select throws_ok($$update public.requests set classification = 'included' where title = 'Add a blog'$$, '42501', null, 'direct classification write rejected');

select lives_ok($$select public.classify_request((select id from public.requests where title = 'Add a blog'), 'additional')$$, 'A classifies as additional');
select ok((select metadata = '{"from":"unclassified","to":"additional"}'::jsonb and actor_type = 'freelancer' from public.activity_events where event_type = 'request.classified'), 'classification event has from/to');
select lives_ok($$select public.classify_request((select id from public.requests where title = 'Add a blog'), 'additional')$$, 'same classification again succeeds');
select is((select count(*)::int from public.activity_events where event_type = 'request.classified'), 1, 'no duplicate event for same value');
select throws_ok($$select public.classify_request((select id from public.requests where title = 'Add a blog'), 'legally_out_of_scope')$$, 'P0001', 'invalid_classification', 'invalid classification rejected');

select throws_ok($$insert into public.activity_events (project_id, actor_type, event_type, entity_type, entity_id, summary) values ((select id from public.projects where title = 'P3 Site'), 'freelancer', 'x', 'y', gen_random_uuid(), 'forged')$$, '42501', null, 'client cannot insert events');
select throws_ok($$update public.activity_events set summary = 'edited'$$, '42501', null, 'client cannot update events');
select throws_ok($$delete from public.activity_events$$, '42501', null, 'client cannot delete events');

-- revision usage
select throws_ok($$insert into public.revision_usages (project_id) values ((select id from public.projects where title = 'P3 Site'))$$, '42501', null, 'no revision usage before scope is confirmed');
insert into public.scope_items (scope_version_id, kind, description) select id, 'deliverable', 'Home' from public.scope_versions where project_id = (select id from public.projects where title = 'P3 Site');
update public.scope_versions set revision_allowance_type = 'number', revision_allowance_count = 2 where project_id = (select id from public.projects where title = 'P3 Site');
select public.confirm_scope((select id from public.scope_versions where project_id = (select id from public.projects where title = 'P3 Site') and version_no = 1));
select lives_ok($$insert into public.revision_usages (project_id, request_id, note) values ((select id from public.projects where title = 'P3 Site'), (select id from public.requests where title = 'Add a blog'), 'Round 1')$$, 'A records a revision used');
select is((select count(*)::int from public.activity_events where event_type = 'revision.recorded'), 1, 'revision.recorded event');
select lives_ok($$delete from public.revision_usages where note = 'Round 1'$$, 'A undoes a recorded revision');
select is((select count(*)::int from public.activity_events where event_type = 'revision.undone'), 1, 'revision.undone event');
insert into public.scope_items (scope_version_id, kind, description) select id, 'deliverable', 'X' from public.scope_versions where project_id = (select id from public.projects where title = 'P3 Other');
select public.confirm_scope((select id from public.scope_versions where project_id = (select id from public.projects where title = 'P3 Other') and version_no = 1));
select throws_ok($$insert into public.revision_usages (project_id, request_id) values ((select id from public.projects where title = 'P3 Other'), (select id from public.requests where title = 'Add a blog'))$$, '42501', null, 'cannot link a request from another project');

reset role;
select throws_ok($$update public.activity_events set summary = 'edited'$$, 'P0001', 'activity_event_immutable', 'events immutable even for privileged roles');
select set_config('test.req', (select id::text from public.requests where title = 'Add a blog'), true);
select set_config('test.proj', (select id::text from public.projects where title = 'P3 Site'), true);

-- ---------- as B ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
select is((select count(*)::int from public.requests), 0, 'B sees no requests of A');
select is((select count(*)::int from public.activity_events), 0, 'B sees no events of A');
select throws_ok($$insert into public.requests (project_id, title) values (current_setting('test.proj')::uuid, 'B sneaks in')$$, '42501', null, 'B cannot create a request on A''s project');
select throws_ok($$select public.classify_request(current_setting('test.req')::uuid, 'included')$$, 'P0001', 'not_found', 'B cannot classify A''s request');
select throws_ok($$insert into public.revision_usages (project_id) values (current_setting('test.proj')::uuid)$$, '42501', null, 'B cannot record usage on A''s project');
reset role;

-- ---------- archived (A) ----------
update public.projects set status = 'archived' where id = current_setting('test.proj')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
select throws_ok($$insert into public.requests (project_id, title) values (current_setting('test.proj')::uuid, 'After archive')$$, '42501', null, 'no new requests on archived project');
select throws_ok($$select public.classify_request(current_setting('test.req')::uuid, 'included')$$, 'P0001', 'project_archived', 'no classification on archived project');
update public.requests set title = 'renamed' where id = current_setting('test.req')::uuid;
reset role;
select is((select title from public.requests where id = current_setting('test.req')::uuid), 'Add a blog', 'no edits on archived project');

-- ---------- anon ----------
set local role anon;
select throws_ok($$select * from public.requests$$, '42501', null, 'anon cannot read requests');
reset role;

-- ---------- account deletion cascades ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
select public.delete_my_account();
reset role;
select is((select count(*)::int from public.requests where project_id = current_setting('test.proj')::uuid)
        + (select count(*)::int from public.activity_events where project_id = current_setting('test.proj')::uuid)
        + (select count(*)::int from public.revision_usages where project_id = current_setting('test.proj')::uuid), 0,
        'account deletion removes requests, events and usages');

select * from finish();
rollback;
