-- pgTAP (Tester Specialist): Phase 5 gap coverage, independent of the developer file. Run: npx supabase test db
-- or (no Docker): python3 -I scripts/pgtap-wrap.py tests/db/client_approval_tester.test.sql, then run the output in one SQL call.
-- NOTE: assertions that encode the SPEC where the implementation deviates are intentionally left failing (see ACCEPTANCE_REPORT).
begin;
create extension if not exists pgtap with schema extensions;
select plan(157);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000a6', 'authenticated', 'authenticated', 'p5t-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-0000000000b6', 'authenticated', 'authenticated', 'p5t-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- ===================== helpers (session-local) =====================
create function pg_temp.tk(n int) returns text language sql immutable as $$ select rpad('LabTok' || n || '_', 43, 'Q') $$;
create function pg_temp.mkv(n int, st text, rev boolean, exp boolean, proj uuid) returns uuid language sql as $$
  with r as (insert into public.requests (project_id, title, classification) values (proj, 'Lab ' || n, 'additional') returning id),
  c as (insert into public.change_orders (project_id, request_id) select proj, id from r returning id),
  v as (insert into public.change_order_versions (change_order_id, version_no, title, description, price_impact, currency, status, sent_at)
        select id, 1, 'Lab title ' || n, 'Lab description', 10, 'EUR', st, case when st = 'draft' then null else now() end from c returning id)
  insert into public.approval_links (version_id, token_hash, expires_at, revoked_at)
  select id, extensions.digest(pg_temp.tk(n), 'sha256'), case when exp then now() - interval '1 second' else now() + interval '1 day' end, case when rev then now() - interval '1 hour' end from v
  returning version_id $$;
create function pg_temp.vid(n int) returns uuid language sql stable security definer as $$ select l.version_id from public.approval_links l where l.token_hash = extensions.digest(pg_temp.tk(n), 'sha256') $$;
-- try(): runs q in a subtransaction; success is rolled back so the probe has no side effects ('ok'); failure returns 'SQLSTATE:message'.
create function pg_temp.try(q text) returns text language plpgsql as $$ begin execute q; raise exception 'TRY_ROLLBACK'; exception when others then if sqlerrm = 'TRY_ROLLBACK' then return 'ok'; end if; return sqlstate || ':' || sqlerrm; end $$;
create function pg_temp.try_issue(v uuid) returns text language plpgsql as $$ begin perform public.issue_approval_link(v); return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.try_revoke(v uuid) returns text language plpgsql as $$ begin return public.revoke_approval_link(v)::text; exception when others then return sqlerrm; end $$;
create function pg_temp.keys(j jsonb) returns text language sql immutable as $$ select coalesce(string_agg(k, ',' order by k collate "C"), '') from jsonb_object_keys(j) k $$;
create function pg_temp.key_for(h text) returns text language plpgsql as $$ begin perform set_config('request.headers', h, true); return encode(public._throttle_key(), 'hex'); end $$;
create temp table _toks (tok text);
grant insert, select on _toks to authenticated;

-- ===================== real-flow setup as A and B =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
update public.profiles set display_name = 'Tester Alpha' where id = 'aaaaaaaa-0000-0000-0000-0000000000a6';
insert into public.projects (title, client_name, currency) values ('T5 Proj', 'Client X', 'EUR');
insert into public.requests (project_id, title, description, internal_notes) select id, 'Real req', 'desc', 'PRIVATE-NOTE-XYZ' from public.projects where title = 'T5 Proj';
select public.classify_request((select id from public.requests where title = 'Real req'), 'additional');
select public.create_change_order((select id from public.requests where title = 'Real req'));
update public.change_order_versions set description = 'Build it', price_impact = 250 where version_no = 1;
select public.send_change_order_version((select id from public.change_order_versions where version_no = 1));
select set_config('t.v1', (select id::text from public.change_order_versions where version_no = 1), true);
select set_config('t.co1', (select id::text from public.change_orders), true);
select set_config('t.tokA', (public.issue_approval_link(current_setting('t.v1')::uuid))->>'token', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
insert into public.projects (title, client_name, currency) values ('B Proj', 'Client B', 'USD');
reset role;
select set_config('t.projA', (select id::text from public.projects where title = 'T5 Proj'), true);
select set_config('t.projB', (select id::text from public.projects where title = 'B Proj'), true);

-- ===================== state precedence: pure matrix over _link_state (BR-2) =====================
-- Oracle written from the spec text, independent of the implementation. Combos with pending + not-latest + (revoked or expired)
-- are asserted separately because the implementation orders those differently from BR-2.
select ok((select bool_and(public._link_state(s, case when r then now() - interval '1 hour' end, case when e then now() - interval '1 second' else now() + interval '1 day' end, case when n then 1 else 2 end, 2) = exp)
  from (select s, r, e, n, case when s = 'draft' then 'invalid' when s = 'superseded' then 'superseded' when s = 'cancelled' then 'cancelled'
                                when s in ('approved', 'declined', 'clarification_requested') then 'decided'
                                when r then 'revoked' when e then 'expired' when n then 'superseded' else 'valid' end exp
        from unnest(array['draft', 'pending', 'superseded', 'cancelled', 'approved', 'declined', 'clarification_requested']) s, (values (true), (false)) a(r), (values (true), (false)) b(e), (values (true), (false)) c(n)
        where not (s = 'pending' and n and (r or e))) q), 'precedence matrix: every status x revoked x expired x not-latest combination (excluding pending+not-latest+revoked/expired) matches BR-2');
select is((select count(*)::int from unnest(array['draft', 'pending', 'superseded', 'cancelled', 'approved', 'declined', 'clarification_requested']) s, (values (true), (false)) a(r), (values (true), (false)) b(e), (values (true), (false)) c(n)), 56, 'precedence matrix covers 56 combinations');
select is(public._link_state('pending', now() - interval '1 hour', now() - interval '1 second', 1, 1), 'revoked', 'revoked AND expired -> revoked');
select is(public._link_state('superseded', now() - interval '1 hour', now() + interval '1 day', 1, 2), 'superseded', 'superseded AND revoked -> superseded');
select is(public._link_state('superseded', now() - interval '1 hour', now() - interval '1 second', 1, 2), 'superseded', 'superseded AND revoked AND expired -> superseded');
select is(public._link_state('approved', now() - interval '1 hour', now() + interval '1 day', 1, 1), 'decided', 'decided AND revoked -> decided');
select is(public._link_state('declined', now() - interval '1 hour', now() - interval '1 second', 1, 1), 'decided', 'decided AND revoked AND expired -> decided');
select is(public._link_state('clarification_requested', null, now() - interval '1 second', 1, 1), 'decided', 'decided AND expired -> decided');
select is(public._link_state('cancelled', now() - interval '1 hour', now() - interval '1 second', 1, 1), 'cancelled', 'cancelled AND revoked AND expired -> cancelled');
select is(public._link_state('draft', now() - interval '1 hour', now() - interval '1 second', 1, 1), 'invalid', 'draft always invalid, whatever else is set');
select is(public._link_state('pending', now() - interval '1 hour', now() + interval '1 day', 1, 2), 'superseded', 'SPEC BR-2: pending, not the latest version, and revoked -> superseded (implementation says revoked)');
select is(public._link_state('pending', null, now() - interval '1 second', 1, 2), 'superseded', 'SPEC BR-2: pending, not the latest version, and expired -> superseded (implementation says expired)');

-- ===================== lab fixtures for end-to-end states =====================
select pg_temp.mkv(1, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(2, 'pending', true, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(3, 'pending', false, true, current_setting('t.projA')::uuid);
select pg_temp.mkv(4, 'pending', true, true, current_setting('t.projA')::uuid);
select pg_temp.mkv(5, 'approved', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(6, 'approved', true, true, current_setting('t.projA')::uuid);
select pg_temp.mkv(7, 'declined', true, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(8, 'clarification_requested', false, true, current_setting('t.projA')::uuid);
select pg_temp.mkv(9, 'cancelled', true, true, current_setting('t.projA')::uuid);
select pg_temp.mkv(10, 'cancelled', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(11, 'superseded', true, true, current_setting('t.projA')::uuid);
select pg_temp.mkv(12, 'superseded', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(13, 'draft', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(14, 'draft', true, true, current_setting('t.projA')::uuid);
insert into public.client_decisions (version_id, link_id, decision, comment, idempotency_key)
  select l.version_id, l.id, v.status, 'LabComment', ('00000000-0000-0000-0000-' || lpad(x.n::text, 12, '0'))::uuid
  from (values (5), (6), (7), (8)) x(n) join public.approval_links l on l.token_hash = extensions.digest(pg_temp.tk(x.n), 'sha256') join public.change_order_versions v on v.id = l.version_id;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"10.1.0.1"}', true);
select ok((select bool_and(public.get_public_proposal(pg_temp.tk(e.n))->>'state' = e.s) from (values (1, 'valid'), (2, 'revoked'), (3, 'expired'), (4, 'revoked'), (5, 'decided'), (6, 'decided'), (7, 'decided'), (8, 'decided'), (9, 'cancelled'), (10, 'cancelled'), (11, 'superseded'), (12, 'superseded'), (13, 'invalid'), (14, 'invalid')) e(n, s)), 'end to end: every precedence combination as seen by the client (incl. link for a DRAFT version -> invalid)');
select is(pg_temp.keys(public.get_public_proposal(pg_temp.tk(1))), 'proposal,state', 'valid projection top-level keys');
select ok((select bool_and(pg_temp.keys(public.get_public_proposal(pg_temp.tk(n))) = 'decision,proposal,state' and pg_temp.keys(public.get_public_proposal(pg_temp.tk(n))->'decision') = 'decided_at,decision') from unnest(array[5, 6, 7, 8]) n), 'decided projection keys (decision carries only decision + decided_at)');
select ok((select bool_and(pg_temp.keys(public.get_public_proposal(pg_temp.tk(n))) = 'freelancer_name,state') from unnest(array[2, 3, 4, 9, 10, 11, 12]) n), 'revoked/expired/cancelled/superseded leak ONLY state + freelancer_name');
select ok((select bool_and(public.get_public_proposal(pg_temp.tk(n))::text !~ '(Client X|T5 Proj|Lab title|Lab description|LabComment)') from unnest(array[2, 3, 4, 9, 10, 11, 12]) n), 'non-valid states carry no client name, project title, proposal text or comment');
select ok((select bool_and(public.get_public_proposal(pg_temp.tk(n))::text !~ '(LabComment|idempotency|link_id|version_id|token)') from unnest(array[5, 6, 7, 8]) n), 'decided projection never exposes the comment, key or internal ids');
select is(public.get_public_proposal(pg_temp.tk(2))->>'freelancer_name', 'Tester Alpha', 'non-valid state shows the freelancer display name');
select set_config('request.headers', '{"cf-connecting-ip":"10.1.0.2"}', true);
select ok((select bool_and(public.submit_public_decision(pg_temp.tk(e.n), 'approved', null, 'ffffffff-ffff-ffff-ffff-ffffffffffff')->>'error' = e.s) from (values (2, 'revoked'), (3, 'expired'), (4, 'revoked'), (5, 'decided'), (6, 'decided'), (7, 'decided'), (8, 'decided'), (9, 'cancelled'), (10, 'cancelled'), (11, 'superseded'), (12, 'superseded'), (13, 'invalid'), (14, 'invalid')) e(n, s)), 'no decision can be recorded in any non-valid combination (each reports its own state)');
select is(public.submit_public_decision(pg_temp.tk(6), 'declined', 'other', '00000000-0000-0000-0000-000000000006')->>'result', 'already_recorded', 'retry with the original key still returns the original even though the link is revoked+expired');
select is(public.submit_public_decision(pg_temp.tk(6), 'declined', 'other', '00000000-0000-0000-0000-000000000006')->>'decision', 'approved', 'idempotent retry returns the ORIGINAL decision, not the new request');
select is(pg_temp.keys(public.submit_public_decision(pg_temp.tk(6), 'declined', null, '00000000-0000-0000-0000-000000000006')), 'decided_at,decision,result', 'already_recorded shape');
select is(pg_temp.keys(public.submit_public_decision(pg_temp.tk(5), 'declined', null, 'ffffffff-ffff-ffff-ffff-ffffffffffff')), 'error', 'error shape is only {error}');
select is(pg_temp.keys(public.get_public_proposal(pg_temp.tk(13) || 'x')), 'state', 'invalid projection carries only state');
reset role;
select is((select count(*)::int from public.client_decisions where version_id not in (pg_temp.vid(5), pg_temp.vid(6), pg_temp.vid(7), pg_temp.vid(8)) and version_id in (select v.id from public.change_order_versions v join public.change_orders co on co.id = v.change_order_id where co.project_id = current_setting('t.projA')::uuid)), 0, 'no stray decisions were created by the non-valid attempts');

-- ===================== real flow: draft revision of a PENDING version (pending but not the latest) =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
select set_config('t.v2', (public.new_change_order_version(current_setting('t.co1')::uuid))::text, true);
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"10.1.0.3"}', true);
select is(public.get_public_proposal(current_setting('t.tokA'))->>'state', 'valid', 'SPEC CO-008: v1 is still the current PENDING version while the owner merely has an unsent draft v2 -> link should stay valid (implementation: superseded)');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
select is(public.discard_change_order_draft(current_setting('t.v2')::uuid), false, 'owner discards the draft revision');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tokA'))->>'state', 'valid', 'after the draft is discarded the same link is valid again');
reset role;
-- lab: pending v1 with an unsent draft v2, driven through the decision RPC
select pg_temp.mkv(20, 'pending', false, false, current_setting('t.projA')::uuid);
insert into public.change_order_versions (change_order_id, version_no, title, description, price_impact, currency, status) select change_order_id, 2, 'Lab draft', 'd', 10, 'EUR', 'draft' from public.change_order_versions where id = pg_temp.vid(20);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.submit_public_decision(pg_temp.tk(20), 'approved', null, '20202020-2020-2020-2020-202020202020')->>'result', 'recorded', 'SPEC CO-008: the client can still decide the pending version while an unsent draft exists (implementation: rejected as superseded)');
reset role;
delete from public.change_order_versions where change_order_id = (select change_order_id from public.change_order_versions where id = pg_temp.vid(20)) and status = 'draft';
-- real send -> superseded precedes revoked
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
select set_config('t.v2', (public.new_change_order_version(current_setting('t.co1')::uuid))::text, true);
select public.send_change_order_version(current_setting('t.v2')::uuid);
select set_config('t.tokB', (public.issue_approval_link(current_setting('t.v2')::uuid))->>'token', true);
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tokA'))->>'state', 'superseded', 'real flow: send v2 -> v1 link is superseded (status + revoked both set; superseded wins)');
select is(public.get_public_proposal(current_setting('t.tokB'))->>'state', 'valid', 'real flow: v2 link valid');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
select is(pg_temp.try_issue(current_setting('t.v1')::uuid), 'not_pending', 'cannot issue a link on a superseded version');
select public.cancel_change_order_version(current_setting('t.v2')::uuid);
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tokB'))->>'state', 'cancelled', 'real flow: cancel -> cancelled (status + revoked both set; cancelled wins)');
reset role;

-- ===================== issue_approval_link on every version status; owner vs other owner =====================
select pg_temp.mkv(30, 'draft', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(31, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(32, 'approved', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(33, 'declined', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(34, 'clarification_requested', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(35, 'cancelled', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(36, 'superseded', false, false, current_setting('t.projA')::uuid);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
select ok((select bool_and(pg_temp.try_issue(pg_temp.vid(n)) = 'not_found') from unnest(array[30, 31, 32, 33, 34, 35, 36]) n), 'B cannot issue a link on ANY of A''s versions (not_found, no existence leak)');
select ok((select bool_and(pg_temp.try_revoke(pg_temp.vid(n)) = 'not_found') from unnest(array[1, 2, 5, 31]) n), 'B cannot revoke any of A''s links');
select is((select count(*)::int from public.approval_links) + (select count(*)::int from public.client_decisions), 0, 'B reads none of A''s links or decisions');
select is(pg_temp.try_issue(gen_random_uuid()), 'not_found', 'unknown version id looks the same as another owner''s version');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(pg_temp.try_issue(pg_temp.vid(31)), 'not_authenticated', 'authenticated role without a user id is rejected on issue');
select is(pg_temp.try_revoke(pg_temp.vid(31)), 'not_authenticated', 'and on revoke');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
select is(pg_temp.try_issue(pg_temp.vid(30)), 'not_pending', 'issue on DRAFT version rejected');
select is(pg_temp.try_issue(pg_temp.vid(32)), 'not_pending', 'issue on APPROVED version rejected');
select is(pg_temp.try_issue(pg_temp.vid(33)), 'not_pending', 'issue on DECLINED version rejected');
select is(pg_temp.try_issue(pg_temp.vid(34)), 'not_pending', 'issue on CLARIFICATION_REQUESTED version rejected');
select is(pg_temp.try_issue(pg_temp.vid(35)), 'not_pending', 'issue on CANCELLED version rejected');
select is(pg_temp.try_issue(pg_temp.vid(36)), 'not_pending', 'issue on SUPERSEDED version rejected');
select is((select count(*)::int from public.approval_links where version_id = pg_temp.vid(31) and revoked_at is null), 1, 'A''s pending version has one active link before issuing');
select is(pg_temp.try_issue(pg_temp.vid(31)), 'ok', 'issue on PENDING version succeeds');
select is((select count(*)::int from public.approval_links where version_id = pg_temp.vid(31) and revoked_at is null), 1, 'still exactly one active link after reissue');
select is((select count(*)::int from public.approval_links where version_id = pg_temp.vid(31)), 2, 'old link kept (revoked), not deleted');
select is((select count(*)::int from public.client_decisions where comment = 'LabComment'), 4, 'A reads the 4 lab decisions on A''s versions');
select is(pg_temp.try_revoke(pg_temp.vid(5)), 'true', 'owner may revoke a link after the decision (safety action)');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"10.1.0.4"}', true);
select is(public.get_public_proposal(pg_temp.tk(5))->>'state', 'decided', 'decided AND revoked (real revoke) -> still decided');
select is(public.submit_public_decision(pg_temp.tk(5), 'approved', null, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')->>'error', 'decided', 'and still cannot decide again');
reset role;

-- ===================== T-01: 200 issues: uniqueness, shape, hash-only storage everywhere =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
insert into _toks select (public.issue_approval_link(pg_temp.vid(31))->>'token') from generate_series(1, 200);
reset role;
select is((select count(distinct tok)::int from _toks), 200, '200 issues, 200 distinct tokens (no collision)');
select ok((select bool_and(tok ~ '^[A-Za-z0-9_-]{43}$' and right(tok, 1) ~ '[AEIMQUYcgkosw048]') from _toks), 'every token is 43 base64url chars of a 32-byte value (last char carries 4 bits)');
select is((select count(*)::int from _toks t join public.approval_links l on l.token_hash = extensions.digest(t.tok, 'sha256')), 200, 'each token''s SHA-256 is stored');
select is((select count(*)::int from public.approval_links where version_id = pg_temp.vid(31) and revoked_at is null), 1, 'after 200 reissues exactly one active link remains');
select ok(not exists (select 1 from pg_tables t cross join _toks k where t.schemaname = 'public' and position(k.tok in ((xpath('/row/c/text()', query_to_xml(format('select coalesce(string_agg(x::text, %L), %L) as c from public.%I x', ' ', '', t.tablename), false, true, '')))[1])::text) > 0), 'no raw token appears in ANY row of ANY public table (links, decisions, events, versions, ...)');
select ok(not exists (select 1 from public.approval_links l where l::text ~ 'LabTok' or length(encode(l.token_hash, 'base64')) < 40), 'approval_links rows hold 32-byte hashes only');
select ok(not exists (select 1 from public.activity_events where event_type like 'change_order.link%' and (summary ~ '[A-Za-z0-9_-]{43}' or metadata::text ~ '[A-Za-z0-9_-]{43}')), 'link_issued / link_revoked events contain no token-like string');

-- ===================== grants: exact column sets per role =====================
select is((select coalesce(string_agg(a.attname::text || ':' || p, ',' order by a.attname::text collate "C", p), '') from pg_attribute a cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p where a.attrelid = 'public.approval_links'::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', a.attrelid, a.attnum, p)), 'created_at:SELECT,expires_at:SELECT,id:SELECT,revoked_at:SELECT,version_id:SELECT', 'authenticated may read exactly 5 approval_links columns (never token_hash), nothing else');
select is((select coalesce(string_agg(a.attname::text || ':' || p, ',' order by a.attname::text collate "C", p), '') from pg_attribute a cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p where a.attrelid = 'public.client_decisions'::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', a.attrelid, a.attnum, p)), 'comment:SELECT,decided_at:SELECT,decision:SELECT,id:SELECT,link_id:SELECT,version_id:SELECT', 'authenticated may read exactly 6 client_decisions columns (never idempotency_key), nothing else');
select is((select count(*)::int from pg_attribute a cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p cross join unnest(array['public.approval_links', 'public.client_decisions', 'public.public_link_attempts', 'public.public_link_config']) t where a.attrelid = t::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('anon', a.attrelid, a.attnum, p)), 0, 'anon has no column privilege of any kind on the four new tables');
select is((select count(*)::int from pg_attribute a cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p cross join unnest(array['public.public_link_attempts', 'public.public_link_config']) t where a.attrelid = t::regclass and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', a.attrelid, a.attnum, p)), 0, 'authenticated has no privilege on the throttle tables');
select is((select count(*)::int from unnest(array['anon', 'authenticated']) r cross join unnest(array['public.approval_links', 'public.client_decisions', 'public.public_link_attempts', 'public.public_link_config']) t cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) p where has_table_privilege(r, t::regclass, p)), 0, 'no API role holds INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES on any new table');
select is((select count(*)::int from unnest(array['anon']) r cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p where has_table_privilege(r, 'public.change_order_versions'::regclass, p)), 0, 'anon has no privilege on change_order_versions');
select is((select coalesce(string_agg(proname, ',' order by proname), '') from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('anon', oid, 'execute')), 'get_public_proposal,submit_public_decision', 'the set of anon-executable public functions is exactly the two public RPCs');
select is((select coalesce(string_agg(proname, ',' order by proname), '') from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', oid, 'execute') and (proname like '\_%' or proname like '%guard%')), '', 'no internal helper or trigger function is executable by authenticated');
select ok((select bool_and(prosecdef and 'search_path=""' = any(proconfig)) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('get_public_proposal', 'submit_public_decision', 'issue_approval_link', 'revoke_approval_link', '_throttle_blocked', '_throttle_record_failure')), 'security definer functions pin an empty search_path');

-- ===================== runtime privileges: every column blocked from update/delete for every role =====================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok((select bool_and(pg_temp.try(q) like '42501:%') from unnest(array[
  'update public.client_decisions set decision = ''declined''', 'delete from public.client_decisions', 'insert into public.client_decisions (version_id, link_id, decision, idempotency_key) values (gen_random_uuid(), gen_random_uuid(), ''approved'', gen_random_uuid())',
  'update public.approval_links set revoked_at = null', 'delete from public.approval_links', 'insert into public.approval_links (version_id, token_hash, expires_at) values (gen_random_uuid(), ''\x00'', now())',
  'update public.public_link_attempts set failures = 0', 'delete from public.public_link_attempts', 'insert into public.public_link_attempts values (''\x01'', now(), 1)',
  'update public.public_link_config set salt = ''\x00''', 'select salt from public.public_link_config', 'select token_hash from public.approval_links', 'select idempotency_key from public.client_decisions',
  'update public.change_order_versions set status = ''approved''', 'select 1 from public.change_order_versions', 'select 1 from public.activity_events']) q), 'anon: every write and read on every new table / versions / events is denied (42501)');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
select ok((select bool_and(pg_temp.try(q) like '42501:%') from unnest(array[
  'update public.client_decisions set decision = ''declined''', 'delete from public.client_decisions', 'insert into public.client_decisions (version_id, link_id, decision, idempotency_key) values (gen_random_uuid(), gen_random_uuid(), ''approved'', gen_random_uuid())',
  'update public.approval_links set revoked_at = null', 'update public.approval_links set expires_at = now() + interval ''1 year''', 'delete from public.approval_links', 'insert into public.approval_links (version_id, token_hash, expires_at) values (gen_random_uuid(), ''\x00'', now())',
  'select * from public.approval_links', 'select * from public.client_decisions', 'select token_hash from public.approval_links', 'select idempotency_key from public.client_decisions',
  'select * from public.public_link_attempts', 'update public.public_link_attempts set failures = 0', 'delete from public.public_link_attempts', 'select * from public.public_link_config',
  'update public.change_order_versions set status = ''approved''', 'delete from public.change_order_versions']) q), 'authenticated owner: no write on any new table, no token_hash / idempotency_key / throttle read, cannot set a version status directly');
select ok((select bool_and(pg_temp.try(q) = 'ok') from unnest(array['select id, version_id, expires_at, revoked_at, created_at from public.approval_links', 'select id, version_id, link_id, decision, comment, decided_at from public.client_decisions']) q), 'owner can read the allowed column lists');
reset role;
-- privileged roles: the guard triggers must hold for service_role and for the superuser, on every column
set local role service_role;
select set_config('t.sr1', (select bool_and(pg_temp.try(q) = 'P0001:client_decision_immutable') from unnest(array[
  'update public.client_decisions set id = gen_random_uuid()', 'update public.client_decisions set version_id = gen_random_uuid()', 'update public.client_decisions set link_id = gen_random_uuid()',
  'update public.client_decisions set decision = ''declined''', 'update public.client_decisions set comment = ''edited''', 'update public.client_decisions set comment = null',
  'update public.client_decisions set idempotency_key = gen_random_uuid()', 'update public.client_decisions set decided_at = now()', 'delete from public.client_decisions']) q)::text, true);
select set_config('t.sr2', (select bool_and(pg_temp.try(q) = 'P0001:approval_link_immutable') from unnest(array[
  'update public.approval_links set id = gen_random_uuid()', 'update public.approval_links set version_id = gen_random_uuid()', 'update public.approval_links set token_hash = extensions.digest(''x'', ''sha256'')',
  'update public.approval_links set expires_at = expires_at + interval ''1 day''', 'update public.approval_links set created_at = created_at - interval ''1 day''',
  'update public.approval_links set revoked_at = null where revoked_at is not null', 'update public.approval_links set revoked_at = now() + interval ''1 day'' where revoked_at is not null', 'delete from public.approval_links']) q)::text, true);
reset role;
select ok(current_setting('t.sr1')::boolean, 'service_role: every client_decisions column (and delete) is immutable');
select ok(current_setting('t.sr2')::boolean, 'service_role: every approval_links column is immutable, a revoked link can neither be revived nor re-dated, and links cannot be deleted');
select ok((select bool_and(pg_temp.try(q) = 'P0001:client_decision_immutable') from unnest(array[
  'update public.client_decisions set id = gen_random_uuid()', 'update public.client_decisions set version_id = gen_random_uuid()', 'update public.client_decisions set link_id = gen_random_uuid()',
  'update public.client_decisions set decision = ''declined''', 'update public.client_decisions set comment = ''edited''', 'update public.client_decisions set idempotency_key = gen_random_uuid()',
  'update public.client_decisions set decided_at = now()', 'delete from public.client_decisions']) q), 'superuser: every client_decisions column (and delete) is immutable');
select ok((select bool_and(pg_temp.try(q) = 'P0001:approval_link_immutable') from unnest(array[
  'update public.approval_links set id = gen_random_uuid()', 'update public.approval_links set version_id = gen_random_uuid()', 'update public.approval_links set token_hash = extensions.digest(''x'', ''sha256'')',
  'update public.approval_links set expires_at = expires_at + interval ''1 day''', 'update public.approval_links set created_at = created_at - interval ''1 day''',
  'update public.approval_links set revoked_at = null where revoked_at is not null', 'update public.approval_links set revoked_at = now() + interval ''1 day'' where revoked_at is not null', 'delete from public.approval_links']) q), 'superuser: every approval_links column is immutable, a revoked link can neither be revived nor re-dated, and links cannot be deleted');
select is(pg_temp.try('update public.approval_links set revoked_at = now() where revoked_at is null and token_hash = extensions.digest(pg_temp.tk(12), ''sha256'')'), 'ok', 'the only permitted link change: null -> revoked_at');
select is(pg_temp.try('update public.change_order_versions set status = ''pending'' where status = ''approved'''), 'P0001:invalid_transition', 'a decided version cannot be reopened, even by a privileged role');

-- ===================== token edge cases (all must be invalid, no crash) =====================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"10.2.0.1"}', true);
select ok((select bool_and(public.get_public_proposal(repeat('a', 42) || c)->>'state' = 'invalid') from unnest(array['+', '/', '=', '.', ' ', E'\t', E'\n', E'\r', '%', '*', E'\\', '''', '"', ';', '<', '>', '~', '@', '!']) c), '43 chars with one char from each invalid class (symbols, padding, whitespace, control, quotes) -> invalid');
select set_config('request.headers', '{"cf-connecting-ip":"10.2.0.2"}', true);
select ok((select bool_and(public.get_public_proposal(repeat('a', 42) || c)->>'state' = 'invalid') from unnest(array[U&'\00e9', U&'\00f1', U&'\FF10', U&'\0430', U&'\03BF', U&'\+01F600', U&'\4E2D', U&'\0131', U&'\017F', U&'\212A', U&'\0301']) c), '43 chars with a unicode char (accented, fullwidth digit, Cyrillic a, Greek omicron, emoji, CJK, dotless i, long s, Kelvin sign, combining mark) -> invalid');
select set_config('request.headers', '{"cf-connecting-ip":"10.2.0.3"}', true);
select ok((select bool_and(public.get_public_proposal(v)->>'state' = 'invalid') from (select unnest(array[' ' || pg_temp.tk(1), pg_temp.tk(1) || ' ', E'\n' || pg_temp.tk(1), pg_temp.tk(1) || E'\n', E'\t' || pg_temp.tk(1) || E'\t', substr(pg_temp.tk(1), 1, 42) || E'\n', ' ' || substr(pg_temp.tk(1), 2), substr(pg_temp.tk(1), 1, 42), pg_temp.tk(1) || 'A', U&'\00a0' || substr(pg_temp.tk(1), 2), pg_temp.tk(1) || U&'\200b']) v) s), 'leading/trailing whitespace, NBSP, zero-width space, 42-char and 44-char variants of a VALID token are invalid (no trimming)');
select ok(public.get_public_proposal(pg_temp.tk(1))->>'state' = 'valid', 'sanity: the untouched lab token is valid (and a valid token still works while the same source has failures)');
select set_config('request.headers', '{"cf-connecting-ip":"10.2.0.4"}', true);
select ok((select bool_and(public.get_public_proposal(v)->>'state' = 'invalid') from (select unnest(array[swapped, upper(pg_temp.tk(1)), lower(pg_temp.tk(1))]) v from (select translate(pg_temp.tk(1), 'LabTokQ', 'lABtOKq') swapped) z) s), 'case variants of a valid token (swapped, upper, lower) are invalid (token is case-sensitive)');
select ok(translate(pg_temp.tk(1), 'LabTokQ', 'lABtOKq') <> pg_temp.tk(1), 'sanity: the case variant really differs');
select set_config('request.headers', '{"cf-connecting-ip":"10.2.0.5"}', true);
select ok((select bool_and(public.get_public_proposal(v)->>'state' = 'invalid') from unnest(array[null, '', ' ', 'a', repeat('a', 42), repeat('a', 44), repeat('A', 43), repeat('_', 43), repeat('-', 43), repeat('0', 43), '''; drop table public.projects;--', repeat('%', 43), 'null', '{"a":1}', '../../etc/passwd', repeat('a', 21) || E'\n' || repeat('a', 21), '${jndi:ldap://x}', '<script>alert(1)</script>']) v), 'empty, short, long, repeated, SQL/JSON/path/template-injection tokens -> invalid');
select set_config('request.headers', '{"cf-connecting-ip":"10.2.0.6"}', true);
select set_config('t.t0', clock_timestamp()::text, true);
select is(public.get_public_proposal(repeat('a', 1048576))->>'state', 'invalid', '1 MB token of valid alphabet -> invalid');
select is(public.get_public_proposal(repeat(U&'\00e9', 524288))->>'state', 'invalid', '1 MB unicode token -> invalid');
select is(public.submit_public_decision(repeat('a', 1048576), 'approved', null, gen_random_uuid())->>'error', 'invalid', '1 MB token on submit -> invalid');
select ok(clock_timestamp() - current_setting('t.t0')::timestamptz < interval '2 seconds', '1 MB inputs are rejected quickly (no slow path / regex over the whole string)');
select set_config('request.headers', '{"cf-connecting-ip":"10.2.0.7"}', true);
select is(public.submit_public_decision(pg_temp.tk(1), 'approved', repeat('y', 1048576), gen_random_uuid())->>'error', 'validation', '1 MB comment -> validation, nothing stored');
reset role;
select is((select count(*)::int from public.client_decisions where version_id not in (pg_temp.vid(5), pg_temp.vid(6), pg_temp.vid(7), pg_temp.vid(8), pg_temp.vid(20)) and version_id in (select v.id from public.change_order_versions v join public.change_orders co on co.id = v.change_order_id where co.project_id = current_setting('t.projA')::uuid)), 0, 'none of the edge-case tokens or comments created a decision');
select ok((select count(*) from public.public_link_attempts where source_key <> '\x00') > 0 and (select sum(failures) from public.public_link_attempts where source_key = '\x00') >= 60, 'failed token edge cases were counted by the throttle');
delete from public.public_link_attempts;

-- ===================== comment edge cases and decision-value strictness =====================
select pg_temp.mkv(60, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(61, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(62, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(63, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(64, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(65, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(66, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(67, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(68, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(69, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(75, 'pending', false, false, current_setting('t.projA')::uuid);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"10.3.0.1"}', true);
select is(public.submit_public_decision(pg_temp.tk(60), 'approved', repeat('x', 2000), gen_random_uuid())->>'result', 'recorded', 'comment of exactly 2000 characters is accepted');
select is(public.submit_public_decision(pg_temp.tk(61), 'approved', repeat('x', 2001), gen_random_uuid())->>'error', 'validation', 'comment of 2001 characters is rejected');
select is(public.submit_public_decision(pg_temp.tk(62), 'approved', E'  \t\n \r\n  ', gen_random_uuid())->>'result', 'recorded', 'whitespace-only comment is accepted as no comment');
select is(public.submit_public_decision(pg_temp.tk(63), 'approved', U&'\00dcn\00efc\00f6d\00e9 \2713 \65e5\672c\8a9e \+01F600 \2013 \201cquotes\201d \00f1', gen_random_uuid())->>'result', 'recorded', 'unicode comment accepted');
select is(public.submit_public_decision(pg_temp.tk(64), 'declined', '<script>alert(1)</script><img src=x onerror=alert(1)> &amp; "dq" ''sq'' `bt` {{7*7}} ${x}', gen_random_uuid())->>'result', 'recorded', 'HTML/script/template comment accepted (text only)');
select is(public.submit_public_decision(pg_temp.tk(65), 'clarification_requested', repeat(U&'\00e9', 2000), gen_random_uuid())->>'result', 'recorded', '2000 multi-byte characters accepted (limit counts characters, not bytes)');
select is(public.submit_public_decision(pg_temp.tk(66), 'approved', repeat(U&'\00e9', 2001), gen_random_uuid())->>'error', 'validation', '2001 multi-byte characters rejected');
select is(public.submit_public_decision(pg_temp.tk(67), 'approved', '  padded  ', gen_random_uuid())->>'result', 'recorded', 'comment with surrounding spaces accepted');
select is(public.submit_public_decision(pg_temp.tk(68), 'approved', '''); drop table public.projects;--' || E'\nline2\r\nline3', gen_random_uuid())->>'result', 'recorded', 'SQL-looking multi-line comment accepted as text');
select ok((select bool_and(public.submit_public_decision(pg_temp.tk(75), v, null, gen_random_uuid())->>'error' = 'validation') from unnest(array['Approved', 'APPROVED', ' approved', 'approved ', 'approve', 'approved;', '', 'clarification', 'decline', E'approved\n', U&'approv\00e9d']) v), 'decision values are matched exactly (case, whitespace, near-misses all rejected)');
select is(public.submit_public_decision(pg_temp.tk(75), null, null, gen_random_uuid())->>'error', 'validation', 'null decision rejected');
select is(public.submit_public_decision(repeat('a', 43), 'bogus', null, gen_random_uuid())->>'error', 'validation', 'bad decision with a bad token reports validation (validation precedes lookup, so it never touches the token)');
reset role;
select is((select length(comment) from public.client_decisions where version_id = pg_temp.vid(60)), 2000, 'stored comment is exactly 2000 chars');
select is((select count(*)::int from public.client_decisions where version_id in (pg_temp.vid(61), pg_temp.vid(66), pg_temp.vid(75))), 0, 'rejected submissions stored nothing');
select is((select status from public.change_order_versions where id = pg_temp.vid(61)), 'pending', 'a rejected submission leaves the version pending');
select is((select comment from public.client_decisions where version_id = pg_temp.vid(62)), null, 'whitespace-only comment stored as NULL');
select is((select comment from public.client_decisions where version_id = pg_temp.vid(63)), U&'\00dcn\00efc\00f6d\00e9 \2713 \65e5\672c\8a9e \+01F600 \2013 \201cquotes\201d \00f1', 'unicode stored verbatim');
select is((select comment from public.client_decisions where version_id = pg_temp.vid(64)), '<script>alert(1)</script><img src=x onerror=alert(1)> &amp; "dq" ''sq'' `bt` {{7*7}} ${x}', 'HTML/script text stored verbatim, never interpreted or escaped by the server');
select is((select length(comment) from public.client_decisions where version_id = pg_temp.vid(65)), 2000, 'multi-byte comment stored in full');
select is((select comment from public.client_decisions where version_id = pg_temp.vid(67)), 'padded', 'surrounding spaces trimmed');
select is((select comment from public.client_decisions where version_id = pg_temp.vid(68)), '''); drop table public.projects;--' || E'\nline2\r\nline3', 'SQL-looking multi-line comment stored verbatim (CRLF preserved)');
select ok(exists (select 1 from public.projects where title = 'T5 Proj'), 'sanity: projects table still intact');
select ok((select bool_and(metadata = jsonb_build_object('has_comment', (d.comment is not null)) and summary !~ 'script|padded|quotes') from public.activity_events e join public.change_orders co on co.id = e.entity_id join public.change_order_versions v on v.change_order_id = co.id join public.client_decisions d on d.version_id = v.id where e.actor_type = 'client' and e.event_type = 'change_order.' || d.decision and v.id in (pg_temp.vid(60), pg_temp.vid(62), pg_temp.vid(63), pg_temp.vid(64), pg_temp.vid(67))), 'client events carry only has_comment, never comment text');
select is((select count(*)::int from public.activity_events e join public.change_orders co on co.id = e.entity_id join public.change_order_versions v on v.change_order_id = co.id where e.actor_type = 'client' and v.id = pg_temp.vid(60)), 1, 'exactly one client event per decision');

-- ===================== idempotency key reuse across different links =====================
select pg_temp.mkv(72, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(73, 'pending', false, false, current_setting('t.projA')::uuid);
select pg_temp.mkv(74, 'pending', false, false, current_setting('t.projA')::uuid);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"10.3.0.2"}', true);
select is(public.submit_public_decision(pg_temp.tk(72), 'approved', 'first', '12121212-1212-1212-1212-121212121212')->>'result', 'recorded', 'key K on link 72 -> recorded');
select is(public.submit_public_decision(pg_temp.tk(73), 'declined', 'second', '12121212-1212-1212-1212-121212121212')->>'result', 'recorded', 'the same key K on a DIFFERENT link is a new decision, not a replay of link 72''s');
select is(public.submit_public_decision(pg_temp.tk(73), 'approved', null, '12121212-1212-1212-1212-121212121212')->>'decision', 'declined', 'replay of K on link 73 returns link 73''s own original decision (no cross-link leakage)');
select is(public.submit_public_decision(pg_temp.tk(74), 'clarification_requested', null, '12121212-1212-1212-1212-121212121212')->>'result', 'recorded', 'third link, same key, independent');
reset role;
select is((select count(*)::int from public.client_decisions where idempotency_key = '12121212-1212-1212-1212-121212121212'), 3, 'three decisions share one key value, one per link');
select is((select string_agg(decision, ',' order by decision) from public.client_decisions where idempotency_key = '12121212-1212-1212-1212-121212121212'), 'approved,clarification_requested,declined', 'each kept its own decision value');

-- ===================== the one valid decision: shape, event, status =====================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"10.3.0.3"}', true);
select is(pg_temp.keys(public.submit_public_decision(pg_temp.tk(1), 'approved', null, '10101010-1010-1010-1010-101010101010')), 'decided_at,decision,result', 'recorded shape');
reset role;
select ok((select e.actor_id is null and e.actor_type = 'client' and e.summary = 'Client approved version 1' and e.entity_version = 1 and e.metadata = '{"has_comment": false}'::jsonb from public.activity_events e where e.entity_id = (select change_order_id from public.change_order_versions where id = pg_temp.vid(1)) and e.event_type = 'change_order.approved'), 'client event: actor client, no actor id, exact summary, has_comment false');

-- ===================== throttle accounting and boundaries =====================
select is(pg_temp.key_for('{"cf-connecting-ip":"5.5.5.5"}'), pg_temp.key_for('{"cf-connecting-ip":"  5.5.5.5  "}'), 'cf-connecting-ip is trimmed');
select is(pg_temp.key_for('{"x-forwarded-for":"1.1.1.1, 9.9.9.9"}'), pg_temp.key_for('{"x-forwarded-for":"2.2.2.2, 3.3.3.3, 9.9.9.9"}'), 'changing any NON-last x-forwarded-for entry does not change the key');
select isnt(pg_temp.key_for('{"x-forwarded-for":"1.1.1.1, 9.9.9.9"}'), pg_temp.key_for('{"x-forwarded-for":"1.1.1.1, 9.9.9.8"}'), 'changing the LAST entry changes the key');
select isnt(pg_temp.key_for('{"cf-connecting-ip":"5.5.5.5"}'), encode(extensions.digest('5.5.5.5', 'sha256'), 'hex'), 'key is salted (not the plain SHA-256 of the address)');
select is(pg_temp.key_for('{"cf-connecting-ip":"5.5.5.5"}'), pg_temp.key_for('{"cf-connecting-ip":"5.5.5.5","x-forwarded-for":"6.6.6.6, 7.7.7.7"}'), 'cf-connecting-ip beats any x-forwarded-for');
select is(pg_temp.key_for(''), pg_temp.key_for('not json'), 'unparseable or missing headers fall back to one shared key');
select set_config('request.headers', '', true);
delete from public.public_link_attempts;
select set_config('t.kA', pg_temp.key_for('{"cf-connecting-ip":"2.2.2.2"}'), true);
insert into public.public_link_attempts (source_key, window_start, failures) values (decode(current_setting('t.kA'), 'hex'), date_bin('10 minutes', now(), timestamptz '2000-01-01') - interval '10 minutes', 500);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"2.2.2.2"}', true);
select is(public.get_public_proposal(pg_temp.tk(2))->>'state', 'revoked', 'failures from the PREVIOUS window do not block (window reset)');
reset role;
insert into public.public_link_attempts (source_key, window_start, failures) values (decode(current_setting('t.kA'), 'hex'), date_bin('10 minutes', now(), timestamptz '2000-01-01'), 19) on conflict (source_key, window_start) do update set failures = 19;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"2.2.2.2"}', true);
select is(public.get_public_proposal(repeat('Z', 43))->>'state', 'invalid', 'at 19 recorded failures the 20th is still processed');
select is(public.get_public_proposal(pg_temp.tk(2))->>'state', 'rate_limited', 'at 20 recorded failures the source is blocked, even for a known token');
select is(public.submit_public_decision(pg_temp.tk(2), 'approved', null, gen_random_uuid())->>'error', 'rate_limited', 'blocked source: submit is blocked before any validation');
select is(public.submit_public_decision(repeat('Z', 43), 'bogus', null, null)->>'error', 'rate_limited', 'blocked source gets rate_limited even for malformed submit input');
select set_config('request.headers', '{"cf-connecting-ip":"2.3.3.3"}', true);
select is((select count(*)::int from generate_series(1, 25) g where public.get_public_proposal(pg_temp.tk(1))->>'state' = 'decided'), 25, '25 reads of a real token never trip the throttle (valid/decided tokens are not failures)');
select set_config('request.headers', '{"cf-connecting-ip":"2.4.4.4"}', true);
select is((select count(*)::int from generate_series(1, 25) g where public.get_public_proposal(pg_temp.tk(2))->>'state' = 'revoked'), 25, '25 reads of a revoked/expired/cancelled-type token never trip the throttle either');
select set_config('request.headers', '{"cf-connecting-ip":"2.5.5.5"}', true);
select is((select count(*)::int from generate_series(1, 25) g where public.submit_public_decision(pg_temp.tk(2), 'nope', null, gen_random_uuid())->>'error' = 'validation'), 25, 'validation errors are not failures (cannot be used to burn another source''s budget, nor to probe)');
select set_config('request.headers', '{"cf-connecting-ip":"2.6.6.6"}', true);
select is((select count(*)::int from generate_series(1, 20) g where public.get_public_proposal(null)->>'state' = 'invalid'), 20, 'null tokens count as failures: 20 processed');
select is(public.get_public_proposal(null)->>'state', 'rate_limited', 'null-token flood is throttled on the 21st');
reset role;
select is((select count(*)::int from public.public_link_attempts where source_key in (decode(pg_temp.key_for('{"cf-connecting-ip":"2.3.3.3"}'), 'hex'), decode(pg_temp.key_for('{"cf-connecting-ip":"2.4.4.4"}'), 'hex'), decode(pg_temp.key_for('{"cf-connecting-ip":"2.5.5.5"}'), 'hex'))), 0, 'valid, non-valid-but-found and validation requests left no throttle rows');
select set_config('request.headers', '', true);
delete from public.public_link_attempts;
select set_config('t.kB', pg_temp.key_for('{"cf-connecting-ip":"2.7.7.7"}'), true);
insert into public.public_link_attempts (source_key, window_start, failures) values ('\x00'::bytea, date_bin('10 minutes', now(), timestamptz '2000-01-01'), 999), (decode(current_setting('t.kB'), 'hex'), date_bin('10 minutes', now(), timestamptz '2000-01-01'), 1);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"2.7.7.7"}', true);
select is(public.get_public_proposal(pg_temp.tk(2))->>'state', 'revoked', 'global breaker at 999: not yet engaged');
select is(public.get_public_proposal(repeat('Z', 43))->>'state', 'invalid', 'global breaker: the failure that makes it 1000 is processed');
select is(public.get_public_proposal(pg_temp.tk(2))->>'state', 'rate_limited', 'global breaker at 1000 holds back sources that already failed');
select set_config('request.headers', '{"cf-connecting-ip":"2.8.8.8"}', true);
select is(public.get_public_proposal(pg_temp.tk(2))->>'state', 'revoked', 'global breaker does not affect a source with no failures');
reset role;
select ok((select bool_and(octet_length(source_key) in (1, 32) and failures > 0) from public.public_link_attempts), 'throttle rows: hash keys only');
delete from public.public_link_attempts;
select set_config('request.headers', '', true);

-- ===================== account deletion cascade =====================
select pg_temp.mkv(90, 'pending', false, false, current_setting('t.projB')::uuid);
create temp table _pre as select l.id as link_id, v.id as version_id from public.approval_links l join public.change_order_versions v on v.id = l.version_id join public.change_orders co on co.id = v.change_order_id where co.project_id = current_setting('t.projA')::uuid;
select ok((select count(*) from _pre) > 200 and (select count(*) from public.client_decisions where version_id in (select version_id from _pre)) >= 10, 'sanity: lots of A data present before deletion');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
select public.delete_my_account();
reset role;
select is((select count(*)::int from public.approval_links where id in (select link_id from _pre)), 0, 'account deletion removed ALL of A''s links');
select is((select count(*)::int from public.approval_links l join public.change_order_versions v on v.id = l.version_id join public.change_orders co on co.id = v.change_order_id where co.project_id = current_setting('t.projB')::uuid), 1, 'B''s link remains');
select is((select count(*)::int from public.client_decisions where version_id in (select version_id from _pre)), 0, 'account deletion removed ALL of A''s decisions');
select is((select count(*)::int from public.change_order_versions where id in (select version_id from _pre)), 0, 'account deletion removed all of A''s versions');
select is((select count(*)::int from public.activity_events where project_id = current_setting('t.projA')::uuid), 0, 'account deletion removed A''s history events');
select is((select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000a6'), 0, 'A''s profile is gone');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"10.9.0.1"}', true);
select is(public.get_public_proposal(current_setting('t.tokA'))->>'state', 'invalid', 'a deleted account''s link now resolves to invalid (no state, no name)');
select is(pg_temp.keys(public.get_public_proposal(pg_temp.tk(5))), 'state', 'including a decided one');
select is(public.get_public_proposal(pg_temp.tk(90))->>'state', 'valid', 'B''s link is untouched by A''s deletion');
reset role;

select * from finish();
rollback;
