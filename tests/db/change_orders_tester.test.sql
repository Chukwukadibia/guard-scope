-- pgTAP: Phase 4 change orders, independent Tester suite (TEST_PLAN T-01..T-09; FEATURE_SPEC BR-1..BR-7, AC-1..AC-9).
-- Run: npx supabase test db   (or, without Docker: python3 -I scripts/pgtap-wrap.py tests/db/change_orders_tester.test.sql)
-- Client-terminal states (approved / declined / clarification_requested) do not exist until Phase 5; they are inserted
-- here as superuser only, to prove the guard behaviour (TEST_PLAN header).
begin;
create extension if not exists pgtap with schema extensions;
create temp table _cnt (label text, n int);
grant insert, select on _cnt to anon, authenticated;
-- try_sql: runs a statement in a subtransaction; returns 'ok' (and rolls it back) or 'SQLSTATE:message'.
create function pg_temp.try_sql(q text) returns text language plpgsql as $f$
declare
  v_state text;
  v_msg text;
begin
  execute q;
  raise exception 'TRY_ROLLBACK';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  if v_msg = 'TRY_ROLLBACK' then
    return 'ok';
  end if;
  return v_state || ':' || v_msg;
end;
$f$;
select plan(125);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a4000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'p4t-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b4000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'p4t-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- =====================================================================
-- G: grant matrix (AC-9, ARCHITECTURE §5.1)
-- =====================================================================
select ok(not has_table_privilege('anon', 'public.change_orders', 'select,insert,update,delete,truncate')
      and not has_table_privilege('anon', 'public.change_order_versions', 'select,insert,update,delete,truncate'), 'G1 anon has no table privilege on change_orders / change_order_versions');
select ok(has_table_privilege('authenticated', 'public.change_orders', 'select')
      and not has_table_privilege('authenticated', 'public.change_orders', 'insert,update,delete,truncate'), 'G2 authenticated: change_orders is SELECT-only');
select ok(not has_table_privilege('authenticated', 'public.change_order_versions', 'insert,delete,truncate'), 'G3 authenticated cannot INSERT/DELETE/TRUNCATE versions');
select is((select string_agg(c, ',' order by c) from unnest(array['id','change_order_id','version_no','status','sent_at','created_by','created_at','updated_at','status_changed_at']) c
           where has_column_privilege('authenticated', 'public.change_order_versions', c, 'update')), null, 'G4 server-owned version columns (status, sent_at, version_no, change_order_id, ...) not client-updatable');
select is((select string_agg(c, ',' order by c) from unnest(array['title','description','price_impact','currency','time_impact_value','time_impact_unit','proposed_deadline','assumptions','exclusions','client_terms']) c
           where not has_column_privilege('authenticated', 'public.change_order_versions', c, 'update')), null, 'G5 the ten content columns are client-updatable (drafts only, via RLS)');
select ok(has_function_privilege('authenticated', 'public.create_change_order(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.send_change_order_version(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.cancel_change_order_version(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.new_change_order_version(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.discard_change_order_draft(uuid)', 'execute'), 'G6 authenticated can execute the five Phase 4 RPCs');
select ok(not has_function_privilege('anon', 'public.create_change_order(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.send_change_order_version(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.cancel_change_order_version(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.new_change_order_version(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.discard_change_order_draft(uuid)', 'execute'), 'G7 anon cannot execute any Phase 4 RPC');
select ok(not has_function_privilege('authenticated', 'public._lock_change_order(uuid,boolean)', 'execute')
      and not has_function_privilege('anon', 'public._lock_change_order(uuid,boolean)', 'execute')
      and not has_function_privilege('authenticated', 'public.change_order_versions_guard()', 'execute')
      and not has_function_privilege('anon', 'public.change_order_versions_guard()', 'execute'), 'G8 _lock_change_order and the guard trigger function are not executable by API roles');
select ok(not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
           where p.oid in ('public._lock_change_order(uuid,boolean)'::regprocedure, 'public.create_change_order(uuid)'::regprocedure, 'public.send_change_order_version(uuid)'::regprocedure,
                           'public.cancel_change_order_version(uuid)'::regprocedure, 'public.new_change_order_version(uuid)'::regprocedure, 'public.discard_change_order_draft(uuid)'::regprocedure,
                           'public.change_order_versions_guard()'::regprocedure) and a.grantee = 0), 'G9 no PUBLIC execute on any Phase 4 function');
select is((select count(*)::int from pg_proc where oid in ('public._lock_change_order(uuid,boolean)'::regprocedure, 'public.create_change_order(uuid)'::regprocedure, 'public.send_change_order_version(uuid)'::regprocedure,
                           'public.cancel_change_order_version(uuid)'::regprocedure, 'public.new_change_order_version(uuid)'::regprocedure, 'public.discard_change_order_draft(uuid)'::regprocedure)
           and prosecdef and proconfig @> array['search_path=""']), 6, 'G10 all definer functions pin an empty search_path');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.change_orders'::regclass, 'public.change_order_versions'::regclass)), 'G11 RLS enabled on both tables');

-- =====================================================================
-- Setup as A
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select ok(pg_temp.try_sql($$select public._lock_change_order(gen_random_uuid(), true)$$) like '42501:%', 'G12 authenticated calling _lock_change_order directly gets 42501');
insert into public.projects (title, client_name, currency) values ('T4 Main', 'Acme', 'EUR'), ('T4 Closed', 'Acme', 'GBP'), ('T4 Terminal', 'Acme', 'USD');
select set_config('t.pm', (select id::text from public.projects where title = 'T4 Main'), true);
select set_config('t.pc', (select id::text from public.projects where title = 'T4 Closed'), true);
select set_config('t.pt', (select id::text from public.projects where title = 'T4 Terminal'), true);
insert into public.requests (project_id, title, description, internal_notes) values
  (current_setting('t.pm')::uuid, 'R add', 'Public details for the client', 'TOPSECRET-INTERNAL'),
  (current_setting('t.pm')::uuid, 'R inc', null, null),
  (current_setting('t.pm')::uuid, 'R clar', null, null),
  (current_setting('t.pm')::uuid, 'R unc', null, null),
  (current_setting('t.pm')::uuid, 'R add2', null, 'TOPSECRET-2'),
  (current_setting('t.pc')::uuid, 'C add1', 'closed one', null),
  (current_setting('t.pc')::uuid, 'C add2', 'closed two', null),
  (current_setting('t.pt')::uuid, 'T add', 'terminal', null),
  (current_setting('t.pt')::uuid, 'T add2', 'pending one', null);
select public.classify_request(id, 'additional') from public.requests where title in ('R add', 'R add2', 'C add1', 'C add2', 'T add', 'T add2');
select public.classify_request((select id from public.requests where title = 'R inc'), 'included');
select public.classify_request((select id from public.requests where title = 'R clar'), 'needs_clarification');

-- =====================================================================
-- C: creation (AC-1, BR-6, C-1, C-6)
-- =====================================================================
select throws_ok($$select public.create_change_order((select id from public.requests where title = 'R unc'))$$, 'P0001', 'request_not_additional', 'C1 unclassified request cannot create');
select throws_ok($$select public.create_change_order((select id from public.requests where title = 'R inc'))$$, 'P0001', 'request_not_additional', 'C2 included request cannot create');
select throws_ok($$select public.create_change_order((select id from public.requests where title = 'R clar'))$$, 'P0001', 'request_not_additional', 'C3 needs_clarification request cannot create');
select is((select count(*)::int from public.change_orders) + (select count(*)::int from public.activity_events where entity_type = 'change_order'), 0, 'C4 rejected creates leave no rows or events');
select lives_ok($$select public.create_change_order((select id from public.requests where title = 'R add'))$$, 'C5 additional request creates a proposal');
select throws_ok($$select public.create_change_order((select id from public.requests where title = 'R add'))$$, 'P0001', 'change_order_exists', 'C6 second proposal for the same request rejected (C-1)');
select set_config('t.co1', (select id::text from public.change_orders where request_id = (select id from public.requests where title = 'R add')), true);
select ok((select co.project_id = current_setting('t.pm')::uuid and co.created_by = 'a4000000-0000-4000-8000-0000000000a1'::uuid from public.change_orders co where co.id = current_setting('t.co1')::uuid), 'C7 proposal linked to project and creator');
select ok((select v.version_no = 1 and v.status = 'draft' and v.sent_at is null and v.title = 'R add' and v.description = 'Public details for the client'
           and v.currency = 'EUR' and v.price_impact = 0 and v.time_impact_value is null and v.time_impact_unit is null and v.proposed_deadline is null
           and v.assumptions is null and v.exclusions is null and v.client_terms is null
           from public.change_order_versions v where v.change_order_id = current_setting('t.co1')::uuid), 'C8 v1 draft pre-filled: title, details, project currency, no impact');
select is((select count(*)::int from public.change_order_versions v where row(v.*)::text like '%TOPSECRET%'), 0, 'C9 BR-6: internal notes appear in no version column');
select ok((select entity_version = 1 and actor_type = 'freelancer' and actor_id = 'a4000000-0000-4000-8000-0000000000a1'::uuid and metadata->>'request_id' = (select id::text from public.requests where title = 'R add')
           and summary not like '%TOPSECRET%' from public.activity_events where event_type = 'change_order.created' and entity_id = current_setting('t.co1')::uuid), 'C10 created event: v1, actor, request id, no notes');
select throws_ok($$select public.create_change_order(gen_random_uuid())$$, 'P0001', 'not_found', 'C11 random request id -> not_found');
select throws_ok($$select public.create_change_order(null)$$, 'P0001', 'not_found', 'C12 null request id -> not_found');
select public.classify_request((select id from public.requests where title = 'R add'), 'included');
select is((select count(*)::int from public.change_order_versions where change_order_id = current_setting('t.co1')::uuid), 1, 'C13 C-6: reclassifying the request leaves the proposal intact');
select public.classify_request((select id from public.requests where title = 'R add'), 'additional');

-- =====================================================================
-- D: draft editing via REST semantics (AC-2)
-- =====================================================================
select set_config('t.v1', (select id::text from public.change_order_versions where change_order_id = current_setting('t.co1')::uuid and version_no = 1), true);
with u as (update public.change_order_versions set title = 'Pricing page', description = 'Build a pricing page', price_impact = 1234.5, currency = 'GBP',
                  time_impact_value = 2.5, time_impact_unit = 'days', proposed_deadline = current_date + 20, assumptions = 'Assume A', exclusions = 'Excl B', client_terms = 'Terms C'
           where id = current_setting('t.v1')::uuid returning 1) insert into _cnt select 'd_all', count(*) from u;
select is((select n from _cnt where label = 'd_all'), 1, 'D1 owner updates all ten fields of the draft (1 row)');
select ok((select title = 'Pricing page' and description = 'Build a pricing page' and price_impact = 1234.50 and currency = 'GBP' and time_impact_value = 2.50 and time_impact_unit = 'days'
           and proposed_deadline = current_date + 20 and assumptions = 'Assume A' and exclusions = 'Excl B' and client_terms = 'Terms C' and updated_at > created_at
           from public.change_order_versions where id = current_setting('t.v1')::uuid), 'D2 all fields persisted; updated_at advanced');
select is((select string_agg(x.k || '=' || split_part(pg_temp.try_sql(format('update public.change_order_versions set %s where id = %L', x.q, current_setting('t.v1'))), ':', 1), ',' order by x.k)
           from (values ('a_title_blank', $q$title = '   '$q$), ('b_title_201', format('title = %L', repeat('t', 201))), ('c_title_null', 'title = null'),
                        ('d_desc_5001', format('description = %L', repeat('d', 5001))), ('e_price_neg', 'price_impact = -0.01'), ('f_price_big', 'price_impact = 1e12'),
                        ('g_cur_lower', $q$currency = 'eur'$q$), ('h_cur_4', $q$currency = 'EURO'$q$), ('i_cur_digit', $q$currency = 'E1R'$q$), ('j_cur_null', 'currency = null'),
                        ('k_time_neg', 'time_impact_value = -1'), ('l_unit_bad', $q$time_impact_unit = 'months'$q$), ('m_unit_only', 'time_impact_value = null'),
                        ('n_value_only', 'time_impact_unit = null'), ('o_assump_5001', format('assumptions = %L', repeat('a', 5001))),
                        ('p_excl_5001', format('exclusions = %L', repeat('e', 5001))), ('q_terms_5001', format('client_terms = %L', repeat('c', 5001))),
                        ('r_time_big', 'time_impact_value = 1e6')) x(k, q)),
          'a_title_blank=23514,b_title_201=23514,c_title_null=23502,d_desc_5001=23514,e_price_neg=23514,f_price_big=22003,g_cur_lower=23514,h_cur_4=22001,i_cur_digit=23514,j_cur_null=23502,k_time_neg=23514,l_unit_bad=23514,m_unit_only=23514,n_value_only=23514,o_assump_5001=23514,p_excl_5001=23514,q_terms_5001=23514,r_time_big=22003',
          'D3 every field rule is enforced by the database on direct writes');
select ok(pg_temp.try_sql(format($$update public.change_order_versions set title = %L, description = %L, assumptions = %L, exclusions = %L, client_terms = %L where id = %L$$,
           repeat('t', 200), repeat('d', 5000), repeat('a', 5000), repeat('e', 5000), repeat('c', 5000), current_setting('t.v1'))) = 'ok', 'D4 boundary lengths 200/5000 accepted');
select is((select string_agg(x.c || '=' || split_part(pg_temp.try_sql(format('update public.change_order_versions set %s where id = %L', x.q, current_setting('t.v1'))), ':', 1), ',' order by x.c)
           from (values ('status', $q$status = 'pending'$q$), ('sent_at', 'sent_at = now()'), ('version_no', 'version_no = 5'), ('change_order_id', 'change_order_id = gen_random_uuid()'),
                        ('created_by', 'created_by = null'), ('created_at', 'created_at = now()'), ('updated_at', 'updated_at = now()'), ('status_changed_at', 'status_changed_at = now()'), ('id', 'id = gen_random_uuid()')) x(c, q)),
          'change_order_id=42501,created_at=42501,created_by=42501,id=42501,sent_at=42501,status=42501,status_changed_at=42501,updated_at=42501,version_no=42501',
          'D5 owner cannot write any server-owned column, even on a draft');
select throws_ok(format($$delete from public.change_order_versions where id = %L$$, current_setting('t.v1')), '42501', null, 'D6 owner cannot DELETE a version via REST (discard is RPC-only)');
select throws_ok($$delete from public.change_orders$$, '42501', null, 'D7 owner cannot DELETE change_orders via REST');
select throws_ok($$insert into public.change_order_versions (change_order_id, version_no, title, currency, status, sent_at) select id, 2, 'x', 'EUR', 'approved', now() from public.change_orders$$, '42501', null, 'D8 owner cannot INSERT a version (e.g. a forged approved one)');

-- =====================================================================
-- S: send validation (AC-3, BR-7)
-- =====================================================================
update public.change_order_versions set description = '   ' where id = current_setting('t.v1')::uuid;
select throws_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.v1')), 'P0001', 'missing_content', 'S1 whitespace-only description rejected at send');
update public.change_order_versions set description = 'Build a pricing page', price_impact = 0, time_impact_value = 0, time_impact_unit = 'hours' where id = current_setting('t.v1')::uuid;
select throws_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.v1')), 'P0001', 'invalid_impact', 'S2 price 0 and time 0 rejected');
update public.change_order_versions set time_impact_value = null, time_impact_unit = null where id = current_setting('t.v1')::uuid;
select throws_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.v1')), 'P0001', 'invalid_impact', 'S3 no impact at all rejected');
update public.change_order_versions set price_impact = 400, proposed_deadline = current_date - 2 where id = current_setting('t.v1')::uuid;
select throws_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.v1')), 'P0001', 'deadline_in_past', 'S4 deadline two days ago rejected');
select is((select status from public.change_order_versions where id = current_setting('t.v1')::uuid), 'draft', 'S5 rejected sends leave the draft as draft');
update public.change_order_versions set title = 'Pricing page', description = 'Build a pricing page', price_impact = 400, currency = 'EUR', time_impact_value = 3, time_impact_unit = 'days',
       proposed_deadline = current_date + 30, assumptions = 'Assume A', exclusions = 'Excl B', client_terms = 'Terms C' where id = current_setting('t.v1')::uuid;
select ok((select (public.send_change_order_version(current_setting('t.v1')::uuid)).status = 'pending'), 'S6 valid draft sends; RPC returns the pending row');
select ok((select status = 'pending' and sent_at is not null and sent_at <= clock_timestamp() and sent_at > now() - interval '1 minute' and status_changed_at >= sent_at - interval '1 second'
           from public.change_order_versions where id = current_setting('t.v1')::uuid), 'S7 pending with server send time');
select ok((select metadata->>'price_impact' = '400.00' and metadata->>'currency' = 'EUR' and entity_version = 1
           from public.activity_events where event_type = 'change_order.sent' and entity_id = current_setting('t.co1')::uuid), 'S8 sent event records proposed impact and currency for v1');
select throws_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.v1')), 'P0001', 'not_draft', 'S9 stale tab: sending an already-sent version -> not_draft');
select throws_ok($$select public.send_change_order_version(gen_random_uuid())$$, 'P0001', 'not_found', 'S10 random version id -> not_found');
select public.create_change_order((select id from public.requests where title = 'R add2'));
select set_config('t.co2', (select id::text from public.change_orders where request_id = (select id from public.requests where title = 'R add2')), true);
update public.change_order_versions set description = 'time only', time_impact_value = 4, time_impact_unit = 'hours' where change_order_id = current_setting('t.co2')::uuid;
select lives_ok(format($$select public.send_change_order_version((select id from public.change_order_versions where change_order_id = %L))$$, current_setting('t.co2')), 'S11 CO-003: time-only change (price 0) can be sent');

-- =====================================================================
-- I: immutability after send (AC-4, BR-2) as owner via REST
-- =====================================================================
reset role;
select set_config('t.v1_hash', (select md5(row(v.*)::text) from public.change_order_versions v where id = current_setting('t.v1')::uuid), true);
select set_config('t.v1_content', (select md5(row(v.title, v.description, v.price_impact, v.currency, v.time_impact_value, v.time_impact_unit, v.proposed_deadline, v.assumptions, v.exclusions, v.client_terms, v.sent_at, v.created_at, v.version_no, v.change_order_id)::text)
           from public.change_order_versions v where id = current_setting('t.v1')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
with u as (update public.change_order_versions set title = 'x', description = 'x', price_impact = 1, currency = 'USD', time_impact_value = 1, time_impact_unit = 'hours',
                  proposed_deadline = current_date + 1, assumptions = 'x', exclusions = 'x', client_terms = 'x' where id = current_setting('t.v1')::uuid returning 1)
  insert into _cnt select 'i_rest', count(*) from u;
select is((select n from _cnt where label = 'i_rest'), 0, 'I1 owner REST PATCH of every content column on a sent version affects 0 rows');
select set_config('guardscope.account_deletion', 'on', true);
with u as (update public.change_order_versions set title = 'flag' where id = current_setting('t.v1')::uuid returning 1) insert into _cnt select 'i_flag', count(*) from u;
select is((select n from _cnt where label = 'i_flag'), 0, 'I2 even with the deletion flag set, the owner cannot edit a sent version via REST');
select throws_ok(format($$delete from public.change_order_versions where id = %L$$, current_setting('t.v1')), '42501', null, 'I3 even with the deletion flag set, the owner cannot DELETE a version');
select set_config('guardscope.account_deletion', '', true);
reset role;
select is((select md5(row(v.*)::text) from public.change_order_versions v where id = current_setting('t.v1')::uuid), current_setting('t.v1_hash'), 'I4 sent v1 row byte-for-byte unchanged');

-- =====================================================================
-- V: versions, supersede, uniqueness, swap (AC-5, BR-3)
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('t.v2', public.new_change_order_version(current_setting('t.co1')::uuid)::text, true);
select ok((select v2.version_no = 2 and v2.status = 'draft' and v2.sent_at is null
           and (v2.title, v2.description, v2.price_impact, v2.currency, v2.time_impact_value, v2.time_impact_unit, v2.proposed_deadline, v2.assumptions, v2.exclusions, v2.client_terms)
             = (v1.title, v1.description, v1.price_impact, v1.currency, v1.time_impact_value, v1.time_impact_unit, v1.proposed_deadline, v1.assumptions, v1.exclusions, v1.client_terms)
           from public.change_order_versions v1, public.change_order_versions v2 where v1.id = current_setting('t.v1')::uuid and v2.id = current_setting('t.v2')::uuid), 'V1 v2 copies every content field of v1');
select throws_ok(format($$select public.new_change_order_version(%L)$$, current_setting('t.co1')), 'P0001', 'draft_exists', 'V2 second draft rejected');
select is((select string_agg(version_no || ':' || status, ',' order by version_no) from public.change_order_versions where change_order_id = current_setting('t.co1')::uuid), '1:pending,2:draft', 'V3 v1 still pending while v2 is a draft');
update public.change_order_versions set price_impact = 650, title = 'Pricing page v2' where id = current_setting('t.v2')::uuid;
select lives_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.v2')), 'V4 send v2');
select is((select string_agg(version_no || ':' || status, ',' order by version_no) from public.change_order_versions where change_order_id = current_setting('t.co1')::uuid), '1:superseded,2:pending', 'V5 v1 superseded by v2');
reset role;
select is((select md5(row(v.title, v.description, v.price_impact, v.currency, v.time_impact_value, v.time_impact_unit, v.proposed_deadline, v.assumptions, v.exclusions, v.client_terms, v.sent_at, v.created_at, v.version_no, v.change_order_id)::text)
           from public.change_order_versions v where id = current_setting('t.v1')::uuid), current_setting('t.v1_content'), 'V6 v1 content and send time unchanged after being superseded');
select throws_ok(format($$insert into public.change_order_versions (change_order_id, version_no, title, currency, status, sent_at) values (%L, 9, 'dup pending', 'EUR', 'pending', now())$$, current_setting('t.co1')), '23505', null, 'V7 BR-3: second pending version rejected by the database (even superuser)');
select throws_ok(format($$insert into public.change_order_versions (change_order_id, version_no, title, currency) values (%L, 9, 'd1', 'EUR'), (%L, 10, 'd2', 'EUR')$$, current_setting('t.co1'), current_setting('t.co1')), '23505', null, 'V8 BR-3: two drafts rejected by the database (even superuser)');
select throws_ok(format($$insert into public.change_order_versions (change_order_id, version_no, title, currency, status, sent_at) values (%L, 2, 'dup no', 'EUR', 'cancelled', now())$$, current_setting('t.co1')), '23505', null, 'V9 duplicate version_no rejected');
select throws_ok(format($$update public.change_order_versions set version_no = case version_no when 1 then 2 else 1 end where change_order_id = %L and version_no in (1, 2)$$, current_setting('t.co1')),
                 'P0001', 'change_order_version_immutable', 'V10 superuser swap of version_no between v1 and v2 blocked');
select throws_ok(format($$update public.change_order_versions set change_order_id = %L where id = %L$$, current_setting('t.co1'), (select id from public.change_order_versions where change_order_id = current_setting('t.co2')::uuid)),
                 'P0001', 'change_order_version_immutable', 'V11 superuser move of a version to another change order blocked');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('t.v3', public.new_change_order_version(current_setting('t.co1')::uuid)::text, true);
reset role;
select throws_ok(format($$update public.change_order_versions set version_no = 7 where id = %L$$, current_setting('t.v3')), 'P0001', 'change_order_version_immutable', 'V12 version_no immutable even on a draft (superuser)');
select throws_ok(format($$update public.change_order_versions set change_order_id = %L where id = %L$$, current_setting('t.co2'), current_setting('t.v3')), 'P0001', 'change_order_version_immutable', 'V13 change_order_id immutable even on a draft (superuser)');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- =====================================================================
-- X: cancel / discard (AC-6, BR-4)
-- =====================================================================
select throws_ok(format($$select public.cancel_change_order_version(%L)$$, current_setting('t.v3')), 'P0001', 'not_pending', 'X1 cannot cancel a draft');
select throws_ok(format($$select public.cancel_change_order_version(%L)$$, current_setting('t.v1')), 'P0001', 'not_pending', 'X2 cannot cancel a superseded version');
select throws_ok(format($$select public.discard_change_order_draft(%L)$$, current_setting('t.v2')), 'P0001', 'not_draft', 'X3 cannot discard a pending version');
select throws_ok(format($$select public.discard_change_order_draft(%L)$$, current_setting('t.v1')), 'P0001', 'not_draft', 'X4 cannot discard a superseded version');
select is((select public.discard_change_order_draft(current_setting('t.v3')::uuid)), false, 'X5 discard of v3 draft returns false (proposal kept)');
select is((select string_agg(version_no || ':' || status, ',' order by version_no) from public.change_order_versions where change_order_id = current_setting('t.co1')::uuid), '1:superseded,2:pending', 'X6 only the v3 draft was removed');
select ok((select (public.cancel_change_order_version(current_setting('t.v2')::uuid)).status = 'cancelled'), 'X7 cancel pending v2');
select throws_ok(format($$select public.cancel_change_order_version(%L)$$, current_setting('t.v2')), 'P0001', 'not_pending', 'X8 cannot cancel twice');
select throws_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.v2')), 'P0001', 'not_draft', 'X9 cannot re-send a cancelled version');
select set_config('t.v3b', public.new_change_order_version(current_setting('t.co1')::uuid)::text, true);
select is((select version_no from public.change_order_versions where id = current_setting('t.v3b')::uuid), 3, 'X10 new version after cancel is v3 (number of the discarded draft reused)');
select ok((select price_impact = 650 and title = 'Pricing page v2' from public.change_order_versions where id = current_setting('t.v3b')::uuid), 'X11 new version copies the latest (cancelled v2), not v1');
select lives_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.v3b')), 'X12 send v3 after v2 was cancelled');
select is((select string_agg(version_no || ':' || status, ',' order by version_no) from public.change_order_versions where change_order_id = current_setting('t.co1')::uuid), '1:superseded,2:cancelled,3:pending', 'X13 cancelled v2 is not superseded by v3');
reset role;

-- =====================================================================
-- H: history (AC-7, BR-5)
-- =====================================================================
select is((select string_agg(replace(event_type, 'change_order.', '') || ':' || entity_version, ',' order by seq) from public.activity_events where entity_type = 'change_order' and entity_id = current_setting('t.co1')::uuid),
          'created:1,sent:1,version_created:2,superseded:1,sent:2,version_created:3,draft_discarded:3,cancelled:2,version_created:3,sent:3',
          'H1 every state change of the proposal recorded in seq order with version numbers');
select ok((select bool_and(project_id = current_setting('t.pm')::uuid and actor_type = 'freelancer' and actor_id = 'a4000000-0000-4000-8000-0000000000a1'::uuid and entity_version is not null)
           from public.activity_events where entity_type = 'change_order'), 'H2 all change_order events carry project, actor and version');
select ok((select coalesce(bool_and(prev is null or prev <= created_at), true) from (select created_at, lag(created_at) over (order by seq) prev from public.activity_events where entity_type = 'change_order') x), 'H3 created_at agrees with seq order');
select ok(not exists (select 1 from public.activity_events where entity_type = 'change_order' and summary ~* '(paid|collected|earned|TOPSECRET)'), 'H4 event summaries never say paid/collected/earned and never carry notes');
select throws_ok(format($$update public.activity_events set summary = 'rewritten' where entity_id = %L$$, current_setting('t.co1')), 'P0001', 'activity_event_immutable', 'H5 superuser cannot rewrite change_order history');
select throws_ok(format($$delete from public.activity_events where entity_id = %L$$, current_setting('t.co1')), 'P0001', 'activity_event_immutable', 'H6 superuser cannot delete change_order history');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok(format($$insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary) values (%L, 'client', null, 'change_order.approved', 'change_order', %L, 3, 'Client approved')$$, current_setting('t.pm'), current_setting('t.co1')),
                 '42501', null, 'H7 owner cannot forge a change_order event (e.g. client approved)');
select throws_ok(format($$update public.activity_events set entity_version = 9 where entity_id = %L$$, current_setting('t.co1')), '42501', null, 'H8 owner cannot update change_order events');
select throws_ok(format($$delete from public.activity_events where entity_id = %L$$, current_setting('t.co1')), '42501', null, 'H9 owner cannot delete change_order events');

-- =====================================================================
-- T: full transition / immutability matrix with client-terminal states created as superuser (BR-1, BR-2, HA-006)
-- =====================================================================
select set_config('t.cot', public.create_change_order((select id from public.requests where title = 'T add'))::text, true);
select set_config('t.cop', public.create_change_order((select id from public.requests where title = 'T add2'))::text, true);
update public.change_order_versions set price_impact = 10 where change_order_id = current_setting('t.cop')::uuid;
select public.send_change_order_version((select id from public.change_order_versions where change_order_id = current_setting('t.cop')::uuid));
reset role;
insert into public.change_order_versions (change_order_id, version_no, title, description, price_impact, currency, status, sent_at)
select current_setting('t.cot')::uuid, n, 'T v' || n, 'terminal', 5, 'USD', s, now() - interval '1 hour'
  from (values (2, 'approved'), (3, 'declined'), (4, 'clarification_requested'), (5, 'cancelled'), (6, 'superseded')) x(n, s);
create temp table _states as
  select v.id, v.status as from_s, v.version_no from public.change_order_versions v where v.change_order_id = current_setting('t.cot')::uuid
  union all select v.id, v.status, 100 from public.change_order_versions v where v.change_order_id = current_setting('t.cop')::uuid;
grant select on _states to authenticated;
select is((select string_agg(from_s, ',' order by from_s) from _states), 'approved,cancelled,clarification_requested,declined,draft,pending,superseded', 'T1 one version in each of the seven states');
create temp table _matrix as
  select s.from_s, t.to_s,
         case when (s.from_s = 'draft' and t.to_s = 'pending') or (s.from_s = 'pending' and t.to_s in ('approved', 'declined', 'clarification_requested', 'cancelled', 'superseded')) then 'ok' else 'P0001:invalid_transition' end as expected,
         pg_temp.try_sql(format('update public.change_order_versions set status = %L, sent_at = coalesce(sent_at, now()) where id = %L', t.to_s, s.id)) as actual
    from _states s cross join (values ('draft'), ('pending'), ('approved'), ('declined'), ('clarification_requested'), ('cancelled'), ('superseded')) t(to_s)
   where s.from_s <> t.to_s;
select is((select count(*)::int from _matrix), 42, 'T2 42 from/to combinations attempted');
select is((select string_agg(from_s || '>' || to_s || ' got ' || actual, '; ') from _matrix where actual <> expected), null, 'T3 BR-1: exactly the six allowed transitions succeed; all 36 others raise invalid_transition (superuser)');
select is((select count(*)::int from _matrix where expected = 'ok' and actual = 'ok'), 6, 'T4 the six allowed transitions really succeed');
select is((select string_agg(from_s, ',' order by from_s) from _states s where pg_temp.try_sql(format('delete from public.change_order_versions where id = %L', s.id)) = 'P0001:change_order_version_immutable'),
          'approved,cancelled,clarification_requested,declined,pending,superseded', 'T5 BR-2: no sent version (any state) can be deleted, even by superuser');
select is((select pg_temp.try_sql(format('delete from public.change_order_versions where id = %L', id)) from _states where from_s = 'draft'), 'ok', 'T6 a draft can be deleted (guard allows it)');
create temp table _imm as
  select s.from_s, c.col,
         pg_temp.try_sql(format('update public.change_order_versions set %s where id = %L', c.q, s.id)) as actual
    from _states s cross join (values
      ('title', $q$title = 'tampered'$q$), ('description', $q$description = 'tampered'$q$), ('price_impact', 'price_impact = price_impact + 1'), ('currency', $q$currency = 'JPY'$q$),
      ('time_value', $q$time_impact_value = 9, time_impact_unit = 'weeks'$q$), ('time_unit_only', $q$time_impact_value = coalesce(time_impact_value, 1), time_impact_unit = 'hours'$q$),
      ('time_clear', 'time_impact_value = null, time_impact_unit = null, price_impact = price_impact + 1'),
      ('proposed_deadline', 'proposed_deadline = current_date + 99'), ('assumptions', $q$assumptions = 'tampered'$q$), ('exclusions', $q$exclusions = 'tampered'$q$),
      ('client_terms', $q$client_terms = 'tampered'$q$), ('sent_at', $q$sent_at = sent_at - interval '1 day'$q$), ('created_at', $q$created_at = created_at - interval '1 day'$q$),
      ('status_changed_at', $q$status_changed_at = status_changed_at - interval '1 day'$q$), ('version_no', 'version_no = version_no + 50'), ('change_order_id', format('change_order_id = %L', current_setting('t.co1')))) c(col, q)
   where s.from_s <> 'draft';
select is((select count(*)::int from _imm), 96, 'T7 16 content/metadata writes x 6 sent states attempted');
select is((select string_agg(from_s || '.' || col || ' got ' || actual, '; ') from _imm where actual <> 'P0001:change_order_version_immutable'), null, 'T8 BR-2: every content column (and send/creation metadata) is immutable after send, in every state, for superuser');
select throws_ok(format($$update public.change_order_versions set sent_at = null, status = 'draft' where id = %L$$, (select id from _states where from_s = 'approved')), 'P0001', null, 'T9 cannot un-send an approved version');
select set_config('t.appr', (select id::text from _states where from_s = 'approved'), true);
select set_config('t.appr_upd', (select updated_at::text from public.change_order_versions where id = current_setting('t.appr')::uuid), true);
update public.change_order_versions set updated_at = now() - interval '5 years' where id = current_setting('t.appr')::uuid;
select is((select updated_at::text from public.change_order_versions where id = current_setting('t.appr')::uuid), current_setting('t.appr_upd'), 'T10 updated_at of a sent version cannot be rewritten');
-- owner RPCs against client-terminal states
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select string_agg(s.from_s || '=' || split_part(pg_temp.try_sql(format('select public.cancel_change_order_version(%L)', s.id)), ':', 2), ',' order by s.from_s) from _states s where s.from_s <> 'pending'),
          'approved=not_pending,cancelled=not_pending,clarification_requested=not_pending,declined=not_pending,draft=not_pending,superseded=not_pending', 'T11 cancel RPC refuses every non-pending state');
select is((select string_agg(s.from_s || '=' || split_part(pg_temp.try_sql(format('select public.send_change_order_version(%L)', s.id)), ':', 2), ',' order by s.from_s) from _states s where s.from_s <> 'draft'),
          'approved=not_draft,cancelled=not_draft,clarification_requested=not_draft,declined=not_draft,pending=not_draft,superseded=not_draft', 'T12 send RPC refuses every non-draft state');
select is((select string_agg(s.from_s || '=' || split_part(pg_temp.try_sql(format('select public.discard_change_order_draft(%L)', s.id)), ':', 2), ',' order by s.from_s) from _states s where s.from_s <> 'draft'),
          'approved=not_draft,cancelled=not_draft,clarification_requested=not_draft,declined=not_draft,pending=not_draft,superseded=not_draft', 'T13 discard RPC refuses every non-draft state');
select is((select count(*)::int from public.change_order_versions v join _states s on s.id = v.id where v.status <> s.from_s), 0, 'T14 no state changed by the refused RPCs');
-- C-5: new version after approved. Discard the v1 draft of the terminal proposal first.
select is((select public.discard_change_order_draft((select id from _states where from_s = 'draft'))), false, 'T15 discard v1 draft while later versions exist keeps the proposal');
select set_config('t.cot_v7', public.new_change_order_version(current_setting('t.cot')::uuid)::text, true);
select ok((select version_no = 7 and status = 'draft' and price_impact = 5 from public.change_order_versions where id = current_setting('t.cot_v7')::uuid), 'T16 C-5: new version allowed after a client-terminal (superseded/approved...) latest version; copies v6');

-- =====================================================================
-- P: completed / archived projects (AC-8, C-2)
-- =====================================================================
select public.create_change_order((select id from public.requests where title = 'C add1'));
select set_config('t.coc', (select id::text from public.change_orders where project_id = current_setting('t.pc')::uuid), true);
update public.change_order_versions set price_impact = 99 where change_order_id = current_setting('t.coc')::uuid;
select public.send_change_order_version((select id from public.change_order_versions where change_order_id = current_setting('t.coc')::uuid));
select set_config('t.coc_v1', (select id::text from public.change_order_versions where change_order_id = current_setting('t.coc')::uuid and version_no = 1), true);
select set_config('t.coc_v2', public.new_change_order_version(current_setting('t.coc')::uuid)::text, true);
update public.projects set status = 'completed' where id = current_setting('t.pc')::uuid;
select is((select string_agg(x.k || '=' || split_part(pg_temp.try_sql(x.q), ':', 2), ',' order by x.k)
           from (values ('a_create', format('select public.create_change_order((select id from public.requests where title = %L))', 'C add2')),
                        ('b_send', format('select public.send_change_order_version(%L)', current_setting('t.coc_v2'))),
                        ('c_cancel', format('select public.cancel_change_order_version(%L)', current_setting('t.coc_v1'))),
                        ('d_new', format('select public.new_change_order_version(%L)', current_setting('t.coc'))),
                        ('e_discard', format('select public.discard_change_order_draft(%L)', current_setting('t.coc_v2')))) x(k, q)),
          'a_create=project_not_active,b_send=project_not_active,c_cancel=project_not_active,d_new=project_not_active,e_discard=project_not_active', 'P1 completed project: all five RPCs refused');
with u as (update public.change_order_versions set title = 'edited while completed' where id = current_setting('t.coc_v2')::uuid returning 1) insert into _cnt select 'p_completed', count(*) from u;
select is((select n from _cnt where label = 'p_completed'), 0, 'P2 completed project: REST draft update affects 0 rows');
select is((select count(*)::int from public.change_order_versions where change_order_id = current_setting('t.coc')::uuid), 2, 'P3 completed project: proposals remain readable');
update public.projects set status = 'archived' where id = current_setting('t.pc')::uuid;
select is((select string_agg(x.k || '=' || split_part(pg_temp.try_sql(x.q), ':', 2), ',' order by x.k)
           from (values ('a_create', format('select public.create_change_order((select id from public.requests where title = %L))', 'C add2')),
                        ('b_send', format('select public.send_change_order_version(%L)', current_setting('t.coc_v2'))),
                        ('c_cancel', format('select public.cancel_change_order_version(%L)', current_setting('t.coc_v1'))),
                        ('d_new', format('select public.new_change_order_version(%L)', current_setting('t.coc'))),
                        ('e_discard', format('select public.discard_change_order_draft(%L)', current_setting('t.coc_v2')))) x(k, q)),
          'a_create=project_not_active,b_send=project_not_active,c_cancel=project_not_active,d_new=project_not_active,e_discard=project_not_active', 'P4 archived project: all five RPCs refused');
with u as (update public.change_order_versions set title = 'edited while archived' where id = current_setting('t.coc_v2')::uuid returning 1) insert into _cnt select 'p_archived', count(*) from u;
select is((select n from _cnt where label = 'p_archived'), 0, 'P5 archived project: REST draft update affects 0 rows');
select is((select string_agg(version_no || ':' || status || ':' || title, ',' order by version_no) from public.change_order_versions where change_order_id = current_setting('t.coc')::uuid),
          '1:pending:C add1,2:draft:C add1', 'P6 nothing changed on the closed project');
update public.projects set status = 'active' where id = current_setting('t.pc')::uuid;
select lives_ok(format($$select public.send_change_order_version(%L)$$, current_setting('t.coc_v2')), 'P7 C-2: after reopening, proposal writes work again');

-- =====================================================================
-- B: user B against A (AC-9)
-- =====================================================================
reset role;
select set_config('t.pend', (select id::text from public.change_order_versions where change_order_id = current_setting('t.cop')::uuid and status = 'pending'), true);
select set_config('t.draft', (select id::text from public.change_order_versions where change_order_id = current_setting('t.cot')::uuid and status = 'draft'), true);
select set_config('t.ev_before', (select count(*)::text from public.activity_events where entity_type = 'change_order'), true);
select set_config('t.cov_hash', (select md5(string_agg(row(v.*)::text, '|' order by v.id)) from public.change_order_versions v), true);
update public.projects set status = 'archived' where id = current_setting('t.pc')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::int from public.change_orders) + (select count(*)::int from public.change_order_versions) + (select count(*)::int from public.activity_events where entity_type = 'change_order'), 0, 'B1 B reads no proposals, versions or proposal events of A');
select is((select string_agg(x.k || '=' || split_part(pg_temp.try_sql(x.q), ':', 2), ',' order by x.k)
           from (values ('b_send', format('select public.send_change_order_version(%L)', current_setting('t.draft'))),
                        ('c_cancel', format('select public.cancel_change_order_version(%L)', current_setting('t.pend'))),
                        ('d_new', format('select public.new_change_order_version(%L)', current_setting('t.cot'))),
                        ('e_discard', format('select public.discard_change_order_draft(%L)', current_setting('t.draft'))),
                        ('f_new_archived', format('select public.new_change_order_version(%L)', current_setting('t.coc'))),
                        ('g_cancel_archived', format('select public.cancel_change_order_version(%L)', current_setting('t.coc_v2')))) x(k, q)),
          'b_send=not_found,c_cancel=not_found,d_new=not_found,e_discard=not_found,f_new_archived=not_found,g_cancel_archived=not_found',
          'B2 every RPC on A''s ids returns not_found (also on A''s archived project: no state oracle)');
with u as (update public.change_order_versions set title = 'B was here', price_impact = 1 where id = current_setting('t.draft')::uuid returning 1) insert into _cnt select 'b_upd', count(*) from u;
select is((select n from _cnt where label = 'b_upd'), 0, 'B3 B REST update of A''s draft affects 0 rows');
select throws_ok(format($$delete from public.change_order_versions where id = %L$$, current_setting('t.draft')), '42501', null, 'B4 B cannot delete A''s versions');
select throws_ok(format($$insert into public.change_order_versions (change_order_id, version_no, title, currency) values (%L, 50, 'B', 'EUR')$$, current_setting('t.cot')), '42501', null, 'B5 B cannot insert a version into A''s proposal');
reset role;
-- B's create on A's request needs the real id (computed as superuser)
select set_config('t.req_add2_other', (select id::text from public.requests where title = 'C add2'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok(format($$select public.create_change_order(%L)$$, current_setting('t.req_add2_other')), 'P0001', 'not_found', 'B6 B cannot create a proposal on A''s additional request');
reset role;
select is((select md5(string_agg(row(v.*)::text, '|' order by v.id)) from public.change_order_versions v), current_setting('t.cov_hash'), 'B7 A''s versions byte-for-byte unchanged after B''s attempts');
select is((select count(*)::text from public.activity_events where entity_type = 'change_order'), current_setting('t.ev_before'), 'B8 B''s attempts wrote no events');

-- =====================================================================
-- N: anon and unauthenticated
-- =====================================================================
set local role anon;
select is((select string_agg(x.k || '=' || split_part(pg_temp.try_sql(x.q), ':', 1), ',' order by x.k)
           from (values ('a_sel_co', 'select * from public.change_orders'), ('b_sel_v', 'select * from public.change_order_versions'),
                        ('c_create', 'select public.create_change_order(gen_random_uuid())'), ('d_send', 'select public.send_change_order_version(gen_random_uuid())'),
                        ('e_cancel', 'select public.cancel_change_order_version(gen_random_uuid())'), ('f_new', 'select public.new_change_order_version(gen_random_uuid())'),
                        ('g_discard', 'select public.discard_change_order_draft(gen_random_uuid())'), ('h_lock', 'select public._lock_change_order(gen_random_uuid(), true)'),
                        ('i_upd', $q$update public.change_order_versions set title = 'anon'$q$)) x(k, q)),
          'a_sel_co=42501,b_sel_v=42501,c_create=42501,d_send=42501,e_cancel=42501,f_new=42501,g_discard=42501,h_lock=42501,i_upd=42501', 'N1 anon: every table read/write and every RPC refused (42501)');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((select string_agg(x.k || '=' || split_part(pg_temp.try_sql(x.q), ':', 2), ',' order by x.k)
           from (values ('c_create', format('select public.create_change_order(%L)', current_setting('t.req_add2_other'))), ('d_send', format('select public.send_change_order_version(%L)', current_setting('t.draft'))),
                        ('e_cancel', format('select public.cancel_change_order_version(%L)', current_setting('t.pend'))), ('f_new', format('select public.new_change_order_version(%L)', current_setting('t.cot'))),
                        ('g_discard', format('select public.discard_change_order_draft(%L)', current_setting('t.draft')))) x(k, q)),
          'c_create=not_authenticated,d_send=not_authenticated,e_cancel=not_authenticated,f_new=not_authenticated,g_discard=not_authenticated', 'N2 authenticated role without a user id: every RPC refused');
reset role;

-- =====================================================================
-- R: discard v1 removes the proposal (BR-4); re-create afterwards
-- =====================================================================
update public.projects set status = 'active' where id = current_setting('t.pc')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('t.co_r', public.create_change_order(current_setting('t.req_add2_other')::uuid)::text, true);
select is((select public.discard_change_order_draft((select id from public.change_order_versions where change_order_id = current_setting('t.co_r')::uuid))), true, 'R1 discarding a never-sent v1 returns true');
select is((select count(*)::int from public.change_orders where id = current_setting('t.co_r')::uuid) + (select count(*)::int from public.change_order_versions where change_order_id = current_setting('t.co_r')::uuid), 0, 'R2 the whole proposal is removed');
select is((select string_agg(replace(event_type, 'change_order.', '') || ':' || entity_version, ',' order by seq) from public.activity_events where entity_id = current_setting('t.co_r')::uuid), 'created:1,discarded:1', 'R3 history keeps created + discarded events for the removed proposal');
select lives_ok(format($$select public.create_change_order(%L)$$, current_setting('t.req_add2_other')), 'R4 the request can get a new proposal after v1 was discarded');
reset role;

-- =====================================================================
-- K: account deletion cascade
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
insert into public.projects (title, client_name, currency) values ('T4 B proj', 'Beta', 'CHF');
insert into public.requests (project_id, title) select id, 'B req' from public.projects where title = 'T4 B proj';
select public.classify_request((select id from public.requests where title = 'B req'), 'additional');
select public.create_change_order((select id from public.requests where title = 'B req'));
update public.change_order_versions set description = 'B work', price_impact = 5;
select public.send_change_order_version((select id from public.change_order_versions));
select is((select count(*)::int from public.change_order_versions where status = 'pending' and currency = 'CHF'), 1, 'K1 B has an own sent proposal');
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'K2 A (with sent, superseded, cancelled, approved... versions) deletes own account');
reset role;
select is((select count(*)::int from public.change_orders co join public.projects p on p.id = co.project_id where p.owner_id = 'a4000000-0000-4000-8000-0000000000a1'::uuid)
        + (select count(*)::int from public.change_order_versions where change_order_id in (current_setting('t.co1')::uuid, current_setting('t.co2')::uuid, current_setting('t.cot')::uuid, current_setting('t.cop')::uuid, current_setting('t.coc')::uuid))
        + (select count(*)::int from public.activity_events where project_id in (current_setting('t.pm')::uuid, current_setting('t.pc')::uuid, current_setting('t.pt')::uuid))
        + (select count(*)::int from public.projects where owner_id = 'a4000000-0000-4000-8000-0000000000a1'::uuid), 0, 'K3 no proposal, version, event or project of A remains');
select is((select count(*)::int from public.change_order_versions v join public.change_orders co on co.id = v.change_order_id join public.projects p on p.id = co.project_id
           where p.owner_id = 'b4000000-0000-4000-8000-0000000000b2'::uuid and v.status = 'pending'), 1, 'K4 B''s proposal untouched by A''s deletion');
select is(coalesce(current_setting('guardscope.account_deletion', true), ''), 'off', 'K5 bypass flag is off after delete_my_account');

select * from finish();
rollback;
