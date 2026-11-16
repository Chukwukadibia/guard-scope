-- pgTAP (Tester, Phase 3): gaps beyond tests/db/requests.test.sql. TEST_PLAN T-02..T-08.
-- Run without Docker: python3 -I scripts/pgtap-wrap.py tests/db/requests_tester.test.sql -> execute_sql (ends in ROLLBACK).
-- Keep every assertion on ONE line (the wrapper rewrites lines that start with select ok/is/throws_ok/lives_ok).
begin;
create extension if not exists pgtap with schema extensions;
select plan(138);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'p3t-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'p3t-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- ===================== G: grant matrix (as superuser) =====================
select ok(not has_table_privilege('anon', 'public.requests', 'select') and not has_table_privilege('anon', 'public.requests', 'insert') and not has_table_privilege('anon', 'public.requests', 'update') and not has_table_privilege('anon', 'public.requests', 'delete'), 'G1 anon has no table privilege on requests');
select ok(not has_table_privilege('anon', 'public.activity_events', 'select') and not has_table_privilege('anon', 'public.activity_events', 'insert') and not has_table_privilege('anon', 'public.activity_events', 'update') and not has_table_privilege('anon', 'public.activity_events', 'delete'), 'G2 anon has no table privilege on activity_events');
select ok(not has_table_privilege('anon', 'public.revision_usages', 'select') and not has_table_privilege('anon', 'public.revision_usages', 'insert') and not has_table_privilege('anon', 'public.revision_usages', 'update') and not has_table_privilege('anon', 'public.revision_usages', 'delete'), 'G3 anon has no table privilege on revision_usages');
select ok(has_table_privilege('authenticated', 'public.activity_events', 'select') and not has_table_privilege('authenticated', 'public.activity_events', 'insert') and not has_table_privilege('authenticated', 'public.activity_events', 'update') and not has_table_privilege('authenticated', 'public.activity_events', 'delete') and not has_table_privilege('authenticated', 'public.activity_events', 'truncate'), 'G4 authenticated: activity_events is SELECT-only');
select ok(not has_table_privilege('authenticated', 'public.requests', 'delete') and not has_table_privilege('authenticated', 'public.requests', 'truncate'), 'G5 authenticated cannot delete/truncate requests (C-2)');
select ok(not has_column_privilege('authenticated', 'public.requests', 'classification', 'insert') and not has_column_privilege('authenticated', 'public.requests', 'classification', 'update'), 'G6 classification is not client-writable (BR-2)');
select ok(not has_column_privilege('authenticated', 'public.requests', 'project_id', 'update'), 'G7 project_id cannot be updated (no moving requests)');
select ok(not has_column_privilege('authenticated', 'public.requests', 'id', 'insert') and not has_column_privilege('authenticated', 'public.requests', 'created_at', 'insert') and not has_column_privilege('authenticated', 'public.requests', 'updated_at', 'insert') and not has_column_privilege('authenticated', 'public.requests', 'created_at', 'update') and not has_column_privilege('authenticated', 'public.requests', 'updated_at', 'update'), 'G8 server-owned request columns not client-writable');
select ok(has_column_privilege('authenticated', 'public.requests', 'title', 'update') and has_column_privilege('authenticated', 'public.requests', 'internal_notes', 'update') and has_column_privilege('authenticated', 'public.requests', 'received_on', 'update'), 'G9 editable request fields are updatable');
select ok(not has_table_privilege('authenticated', 'public.revision_usages', 'update') and not has_table_privilege('authenticated', 'public.revision_usages', 'truncate') and has_table_privilege('authenticated', 'public.revision_usages', 'delete'), 'G10 revision_usages: no UPDATE/TRUNCATE, DELETE (undo) allowed');
select ok(not has_column_privilege('authenticated', 'public.revision_usages', 'recorded_by', 'insert') and not has_column_privilege('authenticated', 'public.revision_usages', 'recorded_at', 'insert') and not has_column_privilege('authenticated', 'public.revision_usages', 'id', 'insert'), 'G11 recorded_by/recorded_at/id are server-owned');
select ok(has_function_privilege('authenticated', 'public.classify_request(uuid,text)', 'execute') and not has_function_privilege('anon', 'public.classify_request(uuid,text)', 'execute'), 'G12 classify_request: authenticated yes, anon no');
select ok(not has_function_privilege('authenticated', 'public.requests_before_write()', 'execute') and not has_function_privilege('authenticated', 'public.activity_events_guard()', 'execute') and not has_function_privilege('authenticated', 'public.requests_after_insert_event()', 'execute') and not has_function_privilege('authenticated', 'public.revision_usages_event()', 'execute') and not has_function_privilege('anon', 'public.revision_usages_event()', 'execute'), 'G13 trigger functions not executable by clients');
select ok(not exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid in ('public.classify_request(uuid,text)'::regprocedure, 'public.requests_after_insert_event()'::regprocedure, 'public.revision_usages_event()'::regprocedure) and a.grantee = 0), 'G14 no PUBLIC execute on the RPC or definer triggers');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.requests'::regclass, 'public.activity_events'::regclass, 'public.revision_usages'::regclass)), 'G15 RLS enabled on all three tables');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.classify_request(uuid,text)'::regprocedure), 'G16 classify_request is SECURITY DEFINER with empty search_path');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('requests', 'revision_usages', 'activity_events') and (column_name ~* '(price|amount|value|revenue|cost|fee|currency|total)')), 'G17 REQ-004/AC-9: no monetary columns on Phase 3 tables');

-- ===================== setup as A =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
insert into public.projects (title, client_name, currency) values ('T3 One', 'Acme', 'EUR'), ('T3 Two', 'Acme', 'EUR'), ('T3 Arch', 'Acme', 'EUR'), ('T3 Draft', 'Acme', 'EUR');
select set_config('t.p1', (select id::text from public.projects where title = 'T3 One'), true);
select set_config('t.p2', (select id::text from public.projects where title = 'T3 Two'), true);
select set_config('t.p3', (select id::text from public.projects where title = 'T3 Arch'), true);
select set_config('t.p4', (select id::text from public.projects where title = 'T3 Draft'), true);
insert into public.scope_items (scope_version_id, kind, description) select v.id, 'deliverable', 'Home page' from public.scope_versions v where v.project_id in (current_setting('t.p1')::uuid, current_setting('t.p2')::uuid, current_setting('t.p3')::uuid);
update public.scope_versions set revision_allowance_type = 'number', revision_allowance_count = 2 where project_id = current_setting('t.p1')::uuid;
select public.confirm_scope(v.id) from public.scope_versions v where v.project_id in (current_setting('t.p1')::uuid, current_setting('t.p2')::uuid, current_setting('t.p3')::uuid) and v.version_no = 1;
insert into public.requests (project_id, title, internal_notes) values (current_setting('t.p1')::uuid, 'R1 one', 'secret note A'), (current_setting('t.p2')::uuid, 'R2 two', null), (current_setting('t.p3')::uuid, 'R3 arch', null);
select set_config('t.r1', (select id::text from public.requests where title = 'R1 one'), true);
select set_config('t.r2', (select id::text from public.requests where title = 'R2 two'), true);
select set_config('t.r3', (select id::text from public.requests where title = 'R3 arch'), true);

-- ===================== V: validation (BR-5, REQ-001) =====================
select lives_ok($$insert into public.requests (project_id, title, received_on) values (current_setting('t.p1')::uuid, 'V plus one', current_date + 1)$$, 'V1 received_on = today+1 accepted (documented time-zone tolerance)');
select throws_ok($$insert into public.requests (project_id, title, received_on) values (current_setting('t.p1')::uuid, 'V plus two', current_date + 2)$$, '23514', 'received_on_in_future', 'V2 received_on = today+2 rejected');
select throws_ok($$update public.requests set received_on = current_date + 2 where id = current_setting('t.r1')::uuid$$, '23514', 'received_on_in_future', 'V3 UPDATE to today+2 rejected');
select lives_ok($$update public.requests set received_on = current_date - 30 where id = current_setting('t.r1')::uuid$$, 'V4 past date accepted on update');
select throws_ok($$insert into public.requests (project_id, title) values (current_setting('t.p1')::uuid, '   ')$$, '23514', null, 'V5 whitespace-only title rejected');
select throws_ok($$insert into public.requests (project_id, title) values (current_setting('t.p1')::uuid, null)$$, '23502', null, 'V6 null title rejected');
select throws_ok($$insert into public.requests (project_id, title, received_on) values (current_setting('t.p1')::uuid, 'V null date', null)$$, '23502', null, 'V7 explicit null received_on rejected');
select lives_ok(format($$insert into public.requests (project_id, title, description, internal_notes) values (current_setting('t.p1')::uuid, %L, %L, %L)$$, repeat('t', 200), repeat('d', 5000), repeat('n', 5000)), 'V8 boundary lengths 200/5000/5000 accepted');
select throws_ok(format($$insert into public.requests (project_id, title, description) values (current_setting('t.p1')::uuid, 'V long desc', %L)$$, repeat('d', 5001)), '23514', null, 'V9 description 5001 rejected');
select throws_ok(format($$insert into public.requests (project_id, title, internal_notes) values (current_setting('t.p1')::uuid, 'V long notes', %L)$$, repeat('n', 5001)), '23514', null, 'V10 internal_notes 5001 rejected');
select throws_ok(format($$update public.requests set title = %L where id = current_setting('t.r1')::uuid$$, repeat('x', 201)), '23514', null, 'V11 201-char title rejected on UPDATE');
select lives_ok($$insert into public.requests (project_id, title, source_channel) values (current_setting('t.p1')::uuid, 'V ch1', 'whatsapp'), (current_setting('t.p1')::uuid, 'V ch2', 'email'), (current_setting('t.p1')::uuid, 'V ch3', 'call'), (current_setting('t.p1')::uuid, 'V ch4', 'meeting'), (current_setting('t.p1')::uuid, 'V ch5', 'other')$$, 'V12 all five channels accepted');
select throws_ok($$insert into public.requests (project_id, title, source_channel) values (current_setting('t.p1')::uuid, 'V caps', 'WhatsApp')$$, '23514', null, 'V13 channel is case-sensitive (label value rejected)');
select throws_ok($$insert into public.requests (project_id, title, classification) values (current_setting('t.p1')::uuid, 'V forged class', 'included')$$, '42501', null, 'V14 INSERT with classification rejected');
select throws_ok($$insert into public.requests (id, project_id, title) values (gen_random_uuid(), current_setting('t.p1')::uuid, 'V forged id')$$, '42501', null, 'V15 INSERT with client-chosen id rejected');
select throws_ok($$update public.requests set updated_at = now() - interval '1 year' where id = current_setting('t.r1')::uuid$$, '42501', null, 'V16 UPDATE of updated_at rejected');
select throws_ok($$delete from public.requests where id = current_setting('t.r1')::uuid$$, '42501', null, 'V17 owner cannot delete a request (C-2)');

-- ===================== M: moving a request =====================
select throws_ok($$update public.requests set project_id = current_setting('t.p2')::uuid where id = current_setting('t.r1')::uuid$$, '42501', null, 'M1 owner cannot move a request to another own project');
select is((select project_id::text from public.requests where id = current_setting('t.r1')::uuid), current_setting('t.p1'), 'M2 request still in its project');

-- ===================== C: classification =====================
select is((select classification from public.requests where id = current_setting('t.r1')::uuid), 'unclassified', 'C1 initial classification is unclassified (DEC-007)');
insert into public.requests (project_id, title) values (current_setting('t.p1')::uuid, 'C to additional'), (current_setting('t.p1')::uuid, 'C to clarify');
select lives_ok($$select public.classify_request((select id from public.requests where title = 'C to additional'), 'additional')$$, 'C2 unclassified -> additional');
select lives_ok($$select public.classify_request((select id from public.requests where title = 'C to clarify'), 'needs_clarification')$$, 'C3 unclassified -> needs_clarification');
select is((select classification from public.requests where title = 'C to clarify'), 'needs_clarification', 'C4 needs_clarification stored');
select is((select (public.classify_request(current_setting('t.r1')::uuid, 'included')).classification), 'included', 'C5 unclassified -> included; RPC returns the updated row');
select lives_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'needs_clarification')$$, 'C6 included -> needs_clarification');
select lives_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'additional')$$, 'C7 needs_clarification -> additional');
select lives_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'included')$$, 'C8 additional -> included (back again)');
select lives_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'included')$$, 'C9 included -> included is a no-op');
select is((select count(*)::int from public.activity_events where entity_id = current_setting('t.r1')::uuid and event_type = 'request.classified'), 4, 'C10 exactly 4 classification events for 4 real changes');
select is((select array_agg((metadata->>'from') || '>' || (metadata->>'to') order by metadata->>'from') from public.activity_events where entity_id = current_setting('t.r1')::uuid and event_type = 'request.classified'), array['additional>included', 'included>needs_clarification', 'needs_clarification>additional', 'unclassified>included'], 'C11 from/to pairs are exact');
select ok((select bool_and(actor_type = 'freelancer' and actor_id = 'aaaaaaaa-0000-0000-0000-0000000000a4'::uuid and project_id = current_setting('t.p1')::uuid and entity_type = 'request') from public.activity_events where entity_id = current_setting('t.r1')::uuid), 'C12 events carry actor, project and entity');
select throws_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'unclassified')$$, 'P0001', 'invalid_classification', 'C13 cannot return to unclassified (initial state only)');
select throws_ok($$select public.classify_request(current_setting('t.r1')::uuid, null)$$, 'P0001', 'invalid_classification', 'C14 null classification rejected');
select throws_ok($$select public.classify_request(null, 'included')$$, 'P0001', 'not_found', 'C15 null id -> not_found');
select throws_ok($$select public.classify_request(gen_random_uuid(), 'included')$$, 'P0001', 'not_found', 'C16 random id -> not_found');
select throws_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'Included')$$, 'P0001', 'invalid_classification', 'C17 label text is not a valid value');
select ok(not exists (select 1 from public.activity_events where summary ~* '(legal|out of scope|in scope|breach|owe)'), 'C18 BR-6: no legal wording in event summaries');
select ok((select bool_and(summary like 'Marked "R1 one" as %') from public.activity_events where entity_id = current_setting('t.r1')::uuid and event_type = 'request.classified'), 'C19 summary says "Marked ... as ..."');

-- ===================== E: forging events =====================
select throws_ok($$insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, summary, metadata) values (current_setting('t.p1')::uuid, 'client', null, 'request.classified', 'request', current_setting('t.r1')::uuid, 'Client approved', '{"from":"additional","to":"included"}')$$, '42501', null, 'E1 owner cannot insert a forged event on own project');
select set_config('guardscope.account_deletion', 'on', true);
select throws_ok($$delete from public.activity_events where project_id = current_setting('t.p1')::uuid$$, '42501', null, 'E2 deletion flag does not grant a client DELETE on events');
select throws_ok($$update public.requests set classification = 'additional' where id = current_setting('t.r1')::uuid$$, '42501', null, 'E3 deletion flag does not open a direct classification write');
select set_config('guardscope.account_deletion', '', true);
insert into public.requests (project_id, title) values (current_setting('t.p1')::uuid, 'Inject", "to": "legally_out');
select lives_ok($$select public.classify_request((select id from public.requests where title like 'Inject%'), 'additional')$$, 'E4 title with JSON-looking quotes classifies');
select is((select metadata from public.activity_events where entity_id = (select id from public.requests where title like 'Inject%') and event_type = 'request.classified'), '{"from":"unclassified","to":"additional"}'::jsonb, 'E5 metadata cannot be injected through the title');
select is((select count(*)::int from public.activity_events where entity_id = current_setting('t.r1')::uuid and event_type = 'request.created'), 1, 'E6 one request.created event per request');

-- ===================== U: revision usages =====================
select lives_ok($$insert into public.revision_usages (project_id) values (current_setting('t.p1')::uuid)$$, 'U1 usage with no request link');
select lives_ok($$insert into public.revision_usages (project_id, request_id, note) values (current_setting('t.p1')::uuid, current_setting('t.r1')::uuid, 'same project')$$, 'U2 usage linked to a request in the same project');
select throws_ok($$insert into public.revision_usages (project_id, request_id) values (current_setting('t.p1')::uuid, current_setting('t.r2')::uuid)$$, '42501', null, 'U3 link to own request in another project rejected (BR-4)');
select throws_ok($$insert into public.revision_usages (project_id, request_id) values (current_setting('t.p1')::uuid, gen_random_uuid())$$, '42501', null, 'U4 link to a non-existent request rejected');
select throws_ok($$insert into public.revision_usages (project_id) values (current_setting('t.p4')::uuid)$$, '42501', null, 'U5 no usage on a project without a confirmed scope (C-3)');
select throws_ok(format($$insert into public.revision_usages (project_id, note) values (current_setting('t.p1')::uuid, %L)$$, repeat('n', 501)), '23514', null, 'U6 note > 500 rejected');
select throws_ok($$insert into public.revision_usages (project_id, recorded_by) values (current_setting('t.p1')::uuid, 'bbbbbbbb-0000-0000-0000-0000000000b4')$$, '42501', null, 'U7 recorded_by cannot be forged');
select is((select count(*)::int from public.revision_usages where project_id = current_setting('t.p1')::uuid and recorded_by = 'aaaaaaaa-0000-0000-0000-0000000000a4'::uuid), 2, 'U8 recorded_by defaults to the caller');
select throws_ok($$update public.revision_usages set note = 'edited' where project_id = current_setting('t.p1')::uuid$$, '42501', null, 'U9 usages cannot be edited');
select is((select count(*)::int from public.activity_events where project_id = current_setting('t.p1')::uuid and event_type = 'revision.recorded'), 2, 'U10 one revision.recorded event per accepted insert, none for rejected');
select is((select metadata->>'request_id' from public.activity_events where event_type = 'revision.recorded' and metadata->>'request_id' is not null and project_id = current_setting('t.p1')::uuid), current_setting('t.r1'), 'U11 revision.recorded carries the linked request id');
select lives_ok($$insert into public.revision_usages (project_id) values (current_setting('t.p3')::uuid)$$, 'U12 usage on T3 Arch before archiving');
select set_config('t.u3', (select id::text from public.revision_usages where project_id = current_setting('t.p3')::uuid), true);
select set_config('t.u1', (select id::text from public.revision_usages where project_id = current_setting('t.p1')::uuid and request_id is null), true);
reset role;

-- ===================== setup as B =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
insert into public.projects (title, client_name, currency) values ('T3 B proj', 'Beta', 'EUR');
select set_config('t.bp', (select id::text from public.projects where title = 'T3 B proj'), true);
insert into public.scope_items (scope_version_id, kind, description) select id, 'deliverable', 'B thing' from public.scope_versions where project_id = current_setting('t.bp')::uuid;
select public.confirm_scope((select id from public.scope_versions where project_id = current_setting('t.bp')::uuid and version_no = 1));
insert into public.requests (project_id, title) values (current_setting('t.bp')::uuid, 'B request');
select set_config('t.br', (select id::text from public.requests where title = 'B request'), true);

-- ===================== B: B against A =====================
select is((select count(*)::int from public.requests where project_id in (current_setting('t.p1')::uuid, current_setting('t.p3')::uuid)), 0, 'B1 B reads none of A''s requests (by project filter)');
select is((select count(*)::int from public.requests where id = current_setting('t.r1')::uuid), 0, 'B2 B cannot read A''s request by id (incl. internal notes)');
select is((select count(*)::int from public.revision_usages where project_id = current_setting('t.p1')::uuid), 0, 'B3 B reads none of A''s usages');
select is((select count(*)::int from public.activity_events where project_id = current_setting('t.p1')::uuid or entity_id = current_setting('t.r1')::uuid), 0, 'B4 B reads none of A''s events');
delete from public.revision_usages where id = current_setting('t.u1')::uuid;
update public.requests set title = 'pwned by B', internal_notes = 'B was here' where id = current_setting('t.r1')::uuid;
select throws_ok($$update public.requests set project_id = current_setting('t.bp')::uuid where id = current_setting('t.r1')::uuid$$, '42501', null, 'B5 B cannot move A''s request into B''s project');
select throws_ok($$insert into public.revision_usages (project_id, request_id) values (current_setting('t.bp')::uuid, current_setting('t.r1')::uuid)$$, '42501', null, 'B6 B cannot link A''s request to B''s usage');
select throws_ok($$insert into public.revision_usages (project_id, request_id) values (current_setting('t.p1')::uuid, current_setting('t.br')::uuid)$$, '42501', null, 'B7 B cannot record usage on A''s project with B''s request');
select throws_ok($$insert into public.requests (project_id, title) values (current_setting('t.p1')::uuid, 'B on A')$$, '42501', null, 'B8 B cannot create on A''s project');
select throws_ok($$select public.classify_request(current_setting('t.r3')::uuid, 'included')$$, 'P0001', 'not_found', 'B9 B on A''s request in a soon-archived project -> not_found');
select throws_ok($$insert into public.activity_events (project_id, actor_type, event_type, entity_type, entity_id, summary) values (current_setting('t.p1')::uuid, 'client', 'x', 'request', current_setting('t.r1')::uuid, 'forged by B')$$, '42501', null, 'B10 B cannot insert events into A''s project');
select is((select count(*)::int from public.activity_events where project_id = current_setting('t.bp')::uuid and event_type = 'request.created'), 1, 'B11 B sees B''s own request.created event');
reset role;
select is((select count(*)::int from public.revision_usages where id = current_setting('t.u1')::uuid), 1, 'B12 B''s DELETE of A''s usage removed nothing');
select ok((select title = 'R1 one' and internal_notes = 'secret note A' from public.requests where id = current_setting('t.r1')::uuid), 'B13 B''s UPDATE of A''s request changed nothing');
select is((select count(*)::int from public.activity_events where project_id = current_setting('t.p1')::uuid and event_type = 'revision.undone'), 0, 'B14 no undo event from B''s failed delete');

-- ===================== R: archived project (A) =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
update public.projects set status = 'archived' where id = current_setting('t.p3')::uuid;
select is((select status from public.projects where id = current_setting('t.p3')::uuid), 'archived', 'R0 A archived T3 Arch');
select set_config('t.ev3', (select count(*)::text from public.activity_events where project_id = current_setting('t.p3')::uuid), true);
delete from public.revision_usages where id = current_setting('t.u3')::uuid;
update public.requests set title = 'edited after archive', internal_notes = 'x' where id = current_setting('t.r3')::uuid;
select throws_ok($$insert into public.revision_usages (project_id) values (current_setting('t.p3')::uuid)$$, '42501', null, 'R1 no usage recorded on an archived project');
select throws_ok($$select public.classify_request(current_setting('t.r3')::uuid, 'additional')$$, 'P0001', 'project_archived', 'R2 no classification on an archived project');
select throws_ok($$insert into public.requests (project_id, title) values (current_setting('t.p3')::uuid, 'late')$$, '42501', null, 'R3 no request created on an archived project');
select is((select count(*)::int from public.requests where project_id = current_setting('t.p3')::uuid), 1, 'R4 archived requests stay readable');
select is((select count(*)::int from public.revision_usages where id = current_setting('t.u3')::uuid), 1, 'R5 undo (DELETE) of a usage on an archived project removed nothing');
select is((select title from public.requests where id = current_setting('t.r3')::uuid), 'R3 arch', 'R6 edit on an archived project changed nothing');
select is((select count(*)::text from public.activity_events where project_id = current_setting('t.p3')::uuid), current_setting('t.ev3'), 'R7 blocked actions wrote no events');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
select throws_ok($$select public.classify_request(current_setting('t.r3')::uuid, 'included')$$, 'P0001', 'not_found', 'R7b B on A''s ARCHIVED request gets not_found, not project_archived (no oracle)');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
update public.projects set status = 'active' where id = current_setting('t.p3')::uuid;
select lives_ok($$select public.classify_request(current_setting('t.r3')::uuid, 'additional')$$, 'R8 after reopening, classification works again');
select lives_ok($$delete from public.revision_usages where id = current_setting('t.u3')::uuid$$, 'R9 after reopening, undo works');
select is((select count(*)::int from public.revision_usages where id = current_setting('t.u3')::uuid), 0, 'R10 undo actually removed the usage');
select is((select count(*)::int from public.activity_events where project_id = current_setting('t.p3')::uuid and event_type = 'revision.undone'), 1, 'R11 undo logged exactly once');
select ok((select bool_and(actor_id = 'aaaaaaaa-0000-0000-0000-0000000000a4'::uuid) from public.activity_events where project_id = current_setting('t.p3')::uuid), 'R12 actor_id recorded on all events of the project');
select ok(exists (select 1 from public.activity_events where event_type = 'revision.undone' and entity_id = current_setting('t.u3')::uuid and entity_type = 'revision_usage'), 'R13 undo event references the usage id');
reset role;

-- ===================== N: anon =====================
set local role anon;
select throws_ok($$select * from public.activity_events$$, '42501', null, 'N1 anon cannot read events');
select throws_ok($$select * from public.revision_usages$$, '42501', null, 'N2 anon cannot read usages');
select throws_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'included')$$, '42501', null, 'N3 anon cannot execute classify_request');
select throws_ok($$insert into public.requests (project_id, title) values (current_setting('t.p1')::uuid, 'anon')$$, '42501', null, 'N4 anon cannot insert requests');
select throws_ok($$insert into public.revision_usages (project_id) values (current_setting('t.p1')::uuid)$$, '42501', null, 'N5 anon cannot insert usages');
reset role;

-- authenticated with no JWT subject (e.g. malformed token) -> RPC refuses
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'included')$$, 'P0001', 'not_authenticated', 'N6 RPC refuses a caller without auth.uid()');
select is((select count(*)::int from public.requests), 0, 'N7 no rows visible without auth.uid()');
reset role;

-- ===================== X: superuser-level invariants =====================
select throws_ok(format($$insert into public.activity_events (project_id, actor_type, event_type, entity_type, entity_id, summary, metadata) values (current_setting('t.p1')::uuid, 'system', 'x', 'y', gen_random_uuid(), 's', jsonb_build_object('k', %L))$$, repeat('m', 3000)), '23514', null, 'X1 metadata > 2048 bytes rejected');
select lives_ok(format($$insert into public.activity_events (project_id, actor_type, event_type, entity_type, entity_id, summary, metadata) values (current_setting('t.p1')::uuid, 'system', 'x.size', 'y', gen_random_uuid(), 's', jsonb_build_object('k', %L))$$, repeat('m', 1500)), 'X2 metadata ~1.5 KB accepted');
select throws_ok(format($$insert into public.activity_events (project_id, actor_type, event_type, entity_type, entity_id, summary) values (current_setting('t.p1')::uuid, 'system', 'x', 'y', gen_random_uuid(), %L)$$, repeat('s', 301)), '23514', null, 'X3 summary > 300 rejected');
select throws_ok($$insert into public.activity_events (project_id, actor_type, event_type, entity_type, entity_id, summary) values (current_setting('t.p1')::uuid, 'robot', 'x', 'y', gen_random_uuid(), 's')$$, '23514', null, 'X4 unknown actor_type rejected');
select throws_ok($$delete from public.activity_events where project_id = current_setting('t.p1')::uuid$$, 'P0001', 'activity_event_immutable', 'X5 events undeletable even for superuser without the deletion flag');
select throws_ok($$update public.requests set classification = 'bogus' where id = current_setting('t.r1')::uuid$$, '23514', null, 'X6 classification CHECK holds even for privileged writes');
select ok((select length(summary) <= 300 from public.activity_events where event_type = 'request.created' and entity_id = (select id from public.requests where title = repeat('t', 200))), 'X7 request.created summary for a 200-char title fits the 300 limit');
select lives_ok($$update public.requests set title = repeat('q', 200) where id = current_setting('t.r1')::uuid$$, 'X8 superuser sets a 200-char title');
select lives_ok($$select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a4","role":"authenticated"}', true)$$, 'X9 impersonate A for long-title classify');
select lives_ok($$select public.classify_request(current_setting('t.r1')::uuid, 'needs_clarification')$$, 'X10 classify a 200-char-title request (summary truncated, fits 300)');
select ok((select bool_and(updated_at >= created_at) from public.requests), 'X11 updated_at never before created_at');
-- ===================== O: event ordering (Phase 3 retest 1, D-2 / ISS-015) =====================
select ok((select attidentity = 'a' and attnotnull and atttypid = 'bigint'::regtype from pg_attribute where attrelid = 'public.activity_events'::regclass and attname = 'seq'), 'O1 seq is bigint NOT NULL GENERATED ALWAYS AS IDENTITY');
select ok(exists (select 1 from pg_index i where i.indrelid = 'public.activity_events'::regclass and i.indisunique and i.indnkeyatts = 1 and i.indkey[0] = (select attnum from pg_attribute where attrelid = 'public.activity_events'::regclass and attname = 'seq')), 'O2 a unique index covers seq alone');
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum where d.adrelid = 'public.activity_events'::regclass and a.attname = 'created_at'), 'clock_timestamp()', 'O3 created_at defaults to clock_timestamp() (insert time, not transaction start)');
select is((select tgenabled::text from pg_trigger where tgrelid = 'public.activity_events'::regclass and tgname = 'activity_events_guard'), 'O', 'O4 append-only guard trigger is enabled (tgenabled = O) after the backfill');
select ok((select (tgtype & 2) = 2 and (tgtype & 8) = 8 and (tgtype & 16) = 16 from pg_trigger where tgrelid = 'public.activity_events'::regclass and tgname = 'activity_events_guard'), 'O5 guard fires BEFORE UPDATE and DELETE');
select throws_ok($$update public.activity_events set summary = 'rewritten' where project_id = current_setting('t.p1')::uuid$$, 'P0001', 'activity_event_immutable', 'O6 superuser UPDATE of an event is still blocked by the guard');
select throws_ok($$update public.activity_events set seq = default where project_id = current_setting('t.p1')::uuid$$, 'P0001', 'activity_event_immutable', 'O7 re-numbering seq (SET seq = DEFAULT) is blocked by the guard');
select throws_ok($$update public.activity_events set created_at = now() - interval '1 day' where project_id = current_setting('t.p1')::uuid$$, 'P0001', 'activity_event_immutable', 'O8 back-dating created_at is blocked by the guard');
select throws_ok($$update public.activity_events set seq = 1 where project_id = current_setting('t.p1')::uuid$$, '428C9', null, 'O9 explicit seq value rejected on UPDATE (GENERATED ALWAYS)');
select ok(has_column_privilege('authenticated', 'public.activity_events', 'seq', 'select') and not has_column_privilege('anon', 'public.activity_events', 'seq', 'select'), 'O10 seq readable by authenticated (reader orders by it), not by anon');
select is((select count(*)::int from (select seq from public.activity_events group by seq having count(*) > 1) d), 0, 'O11 no duplicate seq values');
select ok((select coalesce(bool_and(prev_c is null or prev_c <= created_at), true) from (select created_at, lag(created_at) over (order by seq) as prev_c from public.activity_events) x), 'O12 created_at never decreases in seq order (whole table, incl. this suite)');
select ok((select coalesce(bool_and(f = coalesce(prev_t, 'unclassified')), true) from (select metadata ->> 'from' as f, lag(metadata ->> 'to') over (partition by entity_id order by seq) as prev_t from public.activity_events where event_type = 'request.classified') x), 'O13 every request: each from equals the previous to in seq order (first from = unclassified)');
select ok((select coalesce(bool_and(r.classification = coalesce((select e.metadata ->> 'to' from public.activity_events e where e.entity_id = r.id and e.event_type = 'request.classified' order by e.seq desc limit 1), 'unclassified')), true) from public.requests r), 'O14 every request: latest event by seq equals the stored classification');
select ok((select coalesce(bool_and(c.seq < e.seq), true) from public.activity_events c join public.activity_events e on e.entity_id = c.entity_id and e.event_type = 'request.classified' where c.event_type = 'request.created'), 'O15 request.created precedes every classification of that request in seq order');
select throws_ok($$delete from public.projects where id = current_setting('t.p1')::uuid$$, 'P0001', null, 'X12 a project with history/confirmed scope cannot be deleted outside account deletion');
select set_config('guardscope.account_deletion', 'on', true);
select lives_ok($$delete from public.projects where id = current_setting('t.p1')::uuid$$, 'X13 with the deletion flag, project + requests + usages + events cascade');
select is((select count(*)::int from public.requests where project_id = current_setting('t.p1')::uuid) + (select count(*)::int from public.revision_usages where project_id = current_setting('t.p1')::uuid) + (select count(*)::int from public.activity_events where project_id = current_setting('t.p1')::uuid), 0, 'X14 nothing left for the deleted project (and no undo events re-inserted)');
select set_config('guardscope.account_deletion', '', true);

select * from finish();
rollback;
