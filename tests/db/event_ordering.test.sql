-- pgTAP: D-2 / ISS-015 regression. Event created_at and seq are assigned at insert time (not at
-- transaction start), so history order follows the order in which changes were applied.
-- Run: npx supabase test db   (or: python3 -I scripts/pgtap-wrap.py tests/db/event_ordering.test.sql)
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- schema
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
           where d.adrelid = 'public.activity_events'::regclass and a.attname = 'created_at'), 'clock_timestamp()', 'created_at defaults to clock_timestamp()');
select is((select attidentity::text from pg_attribute where attrelid = 'public.activity_events'::regclass and attname = 'seq'), 'a', 'seq is GENERATED ALWAYS AS IDENTITY');
select ok(not has_column_privilege('authenticated', 'public.activity_events', 'seq', 'insert')
          and not has_column_privilege('authenticated', 'public.activity_events', 'seq', 'update'), 'seq is not client-writable');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'eo-a@guardscope.test', '', now(), '{}', '{}', now(), now());

-- ---------- as A, all inside ONE transaction ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
insert into public.projects (title, client_name, currency) values ('EO Site', 'Acme', 'EUR');

-- event 1 (request.created via trigger), then sleep, then event 2 (classify_request), sleep, event 3
insert into public.requests (project_id, title) values ((select id from public.projects where title = 'EO Site'), 'Order me');
select pg_sleep(0.05);
select public.classify_request((select id from public.requests where title = 'Order me'), 'additional');
select pg_sleep(0.05);
select public.classify_request((select id from public.requests where title = 'Order me'), 'included');

select is((select count(*)::int from public.activity_events where entity_id = (select id from public.requests where title = 'Order me')), 3, 'three events recorded in one transaction');
select is((select count(distinct created_at)::int from public.activity_events where entity_id = (select id from public.requests where title = 'Order me')), 3, 'created_at differs between inserts in the same transaction');
select ok((select bool_and(created_at > now()) from public.activity_events where entity_id = (select id from public.requests where title = 'Order me')), 'created_at is insert time, later than transaction start now()');
select ok((select (max(created_at) - min(created_at)) >= interval '100 milliseconds' from public.activity_events where entity_id = (select id from public.requests where title = 'Order me')), 'created_at reflects the sleeps between inserts');
select is((select array_agg(event_type order by seq) from public.activity_events where entity_id = (select id from public.requests where title = 'Order me')),
          array['request.created', 'request.classified', 'request.classified'], 'seq increases in insert order');
select ok((select bool_and(ordered) from (select (lag(created_at) over (order by seq)) is null or lag(created_at) over (order by seq) < created_at as ordered
             from public.activity_events where entity_id = (select id from public.requests where title = 'Order me')) x), 'created_at order agrees with seq order');
-- from/to chain read in seq order is unbroken and ends at the stored classification
select is((select array_agg((metadata ->> 'from') || '>' || (metadata ->> 'to') order by seq) from public.activity_events
           where entity_id = (select id from public.requests where title = 'Order me') and event_type = 'request.classified'),
          array['unclassified>additional', 'additional>included'], 'history chain in seq order ends at the stored value');

reset role;
select throws_ok($$insert into public.activity_events (project_id, actor_type, event_type, entity_type, entity_id, summary, seq)
                   values ((select id from public.projects where title = 'EO Site'), 'system', 'x', 'y', gen_random_uuid(), 'forged order', 1)$$,
                 '428C9', null, 'explicit seq is rejected even for the table owner');

select * from finish();
rollback;
