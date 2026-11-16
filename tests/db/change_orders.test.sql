-- pgTAP: Phase 4 change orders (TEST_PLAN T-01..T-09). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'p4-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'p4-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- ---------- setup as A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
insert into public.projects (title, client_name, currency) values ('P4 Site', 'Acme', 'GBP');
insert into public.requests (project_id, title, description, internal_notes)
  select id, 'Pricing page', 'Add a pricing page', 'SECRET NOTE' from public.projects where title = 'P4 Site';
insert into public.requests (project_id, title) select id, 'Fix typo' from public.projects where title = 'P4 Site';
select public.classify_request((select id from public.requests where title = 'Fix typo'), 'included');

-- ---------- create ----------
select throws_ok($$select public.create_change_order((select id from public.requests where title = 'Pricing page'))$$, 'P0001', 'request_not_additional', 'unclassified request cannot create a proposal');
select throws_ok($$select public.create_change_order((select id from public.requests where title = 'Fix typo'))$$, 'P0001', 'request_not_additional', 'included request cannot create a proposal (REQ-004)');
select public.classify_request((select id from public.requests where title = 'Pricing page'), 'additional');
select lives_ok($$select public.create_change_order((select id from public.requests where title = 'Pricing page'))$$, 'additional request creates a proposal');
select throws_ok($$select public.create_change_order((select id from public.requests where title = 'Pricing page'))$$, 'P0001', 'change_order_exists', 'only one proposal per request');
select ok((select v.status = 'draft' and v.version_no = 1 and v.title = 'Pricing page' and v.description = 'Add a pricing page' and v.currency = 'GBP'
           and position('SECRET' in coalesce(v.description,'') || coalesce(v.assumptions,'') || coalesce(v.client_terms,'')) = 0
           from public.change_order_versions v), 'v1 draft pre-filled from request, project currency, no private notes');
select is((select count(*)::int from public.activity_events where event_type = 'change_order.created'), 1, 'created event');
select throws_ok($$insert into public.change_orders (project_id, request_id) select project_id, id from public.requests where title = 'Fix typo'$$, '42501', null, 'no direct insert into change_orders');
select throws_ok($$insert into public.change_order_versions (change_order_id, version_no, title, currency) select id, 9, 'x', 'GBP' from public.change_orders$$, '42501', null, 'no direct insert into versions');

-- ---------- draft editing + send validation ----------
select lives_ok($$update public.change_order_versions set description = '', price_impact = 0 where version_no = 1$$, 'owner edits draft');
select throws_ok($$select public.send_change_order_version((select id from public.change_order_versions where version_no = 1))$$, 'P0001', 'missing_content', 'send rejects empty description');
update public.change_order_versions set description = 'Build a pricing page' where version_no = 1;
select throws_ok($$select public.send_change_order_version((select id from public.change_order_versions where version_no = 1))$$, 'P0001', 'invalid_impact', 'send rejects zero impact');
select throws_ok($$update public.change_order_versions set time_impact_value = 2 where version_no = 1$$, '23514', null, 'time value without unit rejected');
update public.change_order_versions set price_impact = 400, time_impact_value = 3, time_impact_unit = 'days', proposed_deadline = current_date - 10 where version_no = 1;
select throws_ok($$select public.send_change_order_version((select id from public.change_order_versions where version_no = 1))$$, 'P0001', 'deadline_in_past', 'send rejects a past deadline');
update public.change_order_versions set proposed_deadline = current_date + 30 where version_no = 1;
select throws_ok($$update public.change_order_versions set status = 'pending' where version_no = 1$$, '42501', null, 'owner cannot write status directly');
select lives_ok($$select public.send_change_order_version((select id from public.change_order_versions where version_no = 1))$$, 'valid draft sends');
select ok((select status = 'pending' and sent_at is not null from public.change_order_versions where version_no = 1), 'v1 pending with send time');
select throws_ok($$select public.send_change_order_version((select id from public.change_order_versions where version_no = 1))$$, 'P0001', 'not_draft', 'cannot send twice');

-- ---------- immutability (owner via REST semantics: RLS hides non-drafts from update) ----------
update public.change_order_versions set price_impact = 1 where version_no = 1;
select is((select price_impact from public.change_order_versions where version_no = 1), 400.00::numeric, 'owner update of sent version affects nothing');
select throws_ok($$select public.discard_change_order_draft((select id from public.change_order_versions where version_no = 1))$$, 'P0001', 'not_draft', 'cannot discard a sent version');

-- ---------- new version, supersede ----------
select lives_ok($$select public.new_change_order_version((select id from public.change_orders))$$, 'create v2 draft');
select throws_ok($$select public.new_change_order_version((select id from public.change_orders))$$, 'P0001', 'draft_exists', 'only one draft at a time');
select ok((select price_impact = 400 and time_impact_value = 3 and status = 'draft' from public.change_order_versions where version_no = 2), 'v2 copies v1');
update public.change_order_versions set price_impact = 500 where version_no = 2;
select lives_ok($$select public.send_change_order_version((select id from public.change_order_versions where version_no = 2))$$, 'send v2');
select is((select string_agg(version_no || ':' || status, ',' order by version_no) from public.change_order_versions), '1:superseded,2:pending', 'v1 superseded by v2');
select is((select price_impact from public.change_order_versions where version_no = 1), 400.00::numeric, 'v1 content preserved');

-- ---------- cancel, discard ----------
select lives_ok($$select public.cancel_change_order_version((select id from public.change_order_versions where version_no = 2))$$, 'cancel pending v2');
select throws_ok($$select public.cancel_change_order_version((select id from public.change_order_versions where version_no = 2))$$, 'P0001', 'not_pending', 'cannot cancel twice');
select public.new_change_order_version((select id from public.change_orders));
select is((select public.discard_change_order_draft((select id from public.change_order_versions where version_no = 3))), false, 'discard v3 draft keeps proposal');
select is((select count(*)::int from public.change_order_versions), 2, 'v3 removed, v1/v2 kept');

reset role;
-- ---------- guard applies to privileged roles ----------
select throws_ok($$update public.change_order_versions set price_impact = 1 where version_no = 1$$, 'P0001', 'change_order_version_immutable', 'privileged content update of sent version blocked');
select throws_ok($$update public.change_order_versions set status = 'pending' where version_no = 2$$, 'P0001', 'invalid_transition', 'cancelled -> pending blocked');
select throws_ok($$delete from public.change_order_versions where version_no = 1$$, 'P0001', 'change_order_version_immutable', 'sent version cannot be deleted');
select is((select string_agg(event_type, ',' order by seq) from public.activity_events where entity_type = 'change_order'),
  'change_order.created,change_order.sent,change_order.version_created,change_order.superseded,change_order.sent,change_order.cancelled,change_order.version_created,change_order.draft_discarded',
  'history records every state change in order');
select set_config('test.co', (select id::text from public.change_orders), true);
select set_config('test.proj', (select id::text from public.projects where title = 'P4 Site'), true);

-- ---------- B ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
select is((select count(*)::int from public.change_orders) + (select count(*)::int from public.change_order_versions), 0, 'B sees nothing of A');
select throws_ok($$select public.new_change_order_version(current_setting('test.co')::uuid)$$, 'P0001', 'not_found', 'B cannot create a version on A''s proposal');
reset role;

-- ---------- project not active ----------
update public.projects set status = 'completed' where id = current_setting('test.proj')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
select throws_ok($$select public.new_change_order_version(current_setting('test.co')::uuid)$$, 'P0001', 'project_not_active', 'no proposal changes on a completed project');
reset role;

-- ---------- anon ----------
set local role anon;
select throws_ok($$select * from public.change_order_versions$$, '42501', null, 'anon cannot read versions');
reset role;
select ok(not has_function_privilege('anon', 'public.send_change_order_version(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public._lock_change_order(uuid, boolean)', 'execute'), 'grant matrix: anon no RPC; helper not callable');

-- ---------- account deletion cascades ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
select public.delete_my_account();
reset role;
select is((select count(*)::int from public.change_orders where project_id = current_setting('test.proj')::uuid), 0, 'account deletion removes proposals');

select * from finish();
rollback;
