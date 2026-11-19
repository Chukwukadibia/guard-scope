-- pgTAP: Phase 5 secure client approval (TEST_PLAN T-01..T-13). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(136);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000a5', 'authenticated', 'authenticated', 'p5-a@guardscope.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-0000000000b5', 'authenticated', 'authenticated', 'p5-b@guardscope.test', '', now(), '{}', '{}', now(), now());

-- ===================== setup as A =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
update public.profiles set display_name = 'Alice Studio' where id = 'aaaaaaaa-0000-0000-0000-0000000000a5';
insert into public.projects (title, client_name, currency) values ('P5 Site', 'Acme Ltd', 'EUR');
insert into public.requests (project_id, title, description, internal_notes)
  select id, 'Pricing page', 'Add a pricing page', 'SECRET NOTE' from public.projects where title = 'P5 Site';
select public.classify_request((select id from public.requests where title = 'Pricing page'), 'additional');
select public.create_change_order((select id from public.requests where title = 'Pricing page'));
update public.change_order_versions set description = 'Build a pricing page', price_impact = 400, time_impact_value = 3, time_impact_unit = 'days' where version_no = 1;
select public.send_change_order_version((select id from public.change_order_versions where version_no = 1));
select set_config('t.v1', (select id::text from public.change_order_versions where version_no = 1), true);
select set_config('t.co', (select id::text from public.change_orders), true);
select set_config('t.proj', (select id::text from public.projects where title = 'P5 Site'), true);
select set_config('t.tok1', (public.issue_approval_link(current_setting('t.v1')::uuid))->>'token', true);

-- ===================== T-01 issuing =====================
select is(char_length(current_setting('t.tok1')), 43, 'token is 43 characters');
select ok(current_setting('t.tok1') ~ '^[A-Za-z0-9_-]{43}$', 'token is base64url');
select throws_ok($$select token_hash from public.approval_links$$, '42501', null, 'owner cannot read token_hash');
select lives_ok($$select set_config('t.tok1b', (public.issue_approval_link(current_setting('t.v1')::uuid))->>'token', true)$$, 'reissue succeeds');
select is((select count(*)::int from public.approval_links), 2, 'two links recorded');
select is((select count(*)::int from public.approval_links where revoked_at is null), 1, 'only one active link per version');
select ok(current_setting('t.tok1') <> current_setting('t.tok1b'), 'reissue produces a different token');
reset role;
select ok(not exists (select 1 from public.activity_events where summary like '%' || current_setting('t.tok1b') || '%' or metadata::text like '%' || current_setting('t.tok1b') || '%'), 'raw token appears in no history event');
select ok(exists (select 1 from public.approval_links where token_hash = extensions.digest(current_setting('t.tok1b'), 'sha256')) and not exists (select 1 from public.approval_links where encode(token_hash, 'escape') = current_setting('t.tok1b')), 'only the SHA-256 is stored');

-- ===================== T-02/03 public reads (anon) =====================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok1'))->>'state', 'revoked', 'reissued-over link is revoked');
select is(public.get_public_proposal(current_setting('t.tok1b'))->>'state', 'valid', 'new link is valid');
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(public.get_public_proposal(current_setting('t.tok1b'))->'proposal') k),
  'assumptions,client_name,client_terms,currency,description,exclusions,expires_at,freelancer_name,price_impact,project_title,proposed_deadline,sent_at,time_impact_unit,time_impact_value,title,version_no',
  'projection has exactly the BR-1 fields');
select ok(position('SECRET NOTE' in public.get_public_proposal(current_setting('t.tok1b'))::text) = 0, 'private request notes never appear');
select ok(public.get_public_proposal(current_setting('t.tok1b'))::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}', 'no internal ids in the projection');
select is(public.get_public_proposal(current_setting('t.tok1b'))->'proposal'->>'freelancer_name', 'Alice Studio', 'freelancer display name shown');
select ok((select bool_and(public.get_public_proposal(t)->>'state' = 'invalid')
           from unnest(array[null, '', 'abc', repeat('a', 44), repeat('a', 42) || '!', repeat('A', 43), '''; drop table public.projects;--']::text[]) t), 'guessed, malformed, null and injection-like tokens are invalid');
select is(public.submit_public_decision(current_setting('t.tok1b'), 'maybe', null, '11111111-1111-1111-1111-111111111111')->>'error', 'validation', 'unknown decision value rejected');
select is(public.submit_public_decision(current_setting('t.tok1b'), 'approved', repeat('x', 2001), '11111111-1111-1111-1111-111111111111')->>'error', 'validation', 'comment over 2000 characters rejected');
select is(public.submit_public_decision(current_setting('t.tok1b'), 'approved', null, null)->>'error', 'validation', 'missing idempotency key rejected');

-- ===================== T-05/06 decision =====================
select is(public.submit_public_decision(current_setting('t.tok1b'), 'approved', 'Looks good, thanks', '11111111-1111-1111-1111-111111111111')->>'result', 'recorded', 'approve is recorded');
select is(public.submit_public_decision(current_setting('t.tok1b'), 'approved', 'Looks good, thanks', '11111111-1111-1111-1111-111111111111')->>'result', 'already_recorded', 'retry with the same key is idempotent');
select is(public.submit_public_decision(current_setting('t.tok1b'), 'declined', null, '22222222-2222-2222-2222-222222222222')->>'error', 'decided', 'a second, different decision is rejected');
select is(public.get_public_proposal(current_setting('t.tok1b'))->>'state', 'decided', 'link now reports decided');
select ok(public.get_public_proposal(current_setting('t.tok1b'))->'decision'->>'decision' = 'approved' and position('Looks good' in public.get_public_proposal(current_setting('t.tok1b'))::text) = 0, 'decided page shows the decision, not the comment');
reset role;
select is((select count(*)::int from public.client_decisions where version_id = current_setting('t.v1')::uuid), 1, 'exactly one decision stored');
select is((select status from public.change_order_versions where id = current_setting('t.v1')::uuid), 'approved', 'version status is approved');
select ok((select comment = 'Looks good, thanks' and decided_at is not null from public.client_decisions), 'comment and server time stored');
select ok((select actor_type = 'client' and metadata = '{"has_comment": true}'::jsonb and position('Looks good' in summary) = 0 from public.activity_events where event_type = 'change_order.approved'), 'client event recorded without the comment text');

-- ===================== more versions and link states =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
select throws_ok($$select public.issue_approval_link(current_setting('t.v1')::uuid)$$, 'P0001', 'not_pending', 'no link for a decided (approved) version');
select set_config('t.v2', (public.new_change_order_version(current_setting('t.co')::uuid))::text, true);
update public.change_order_versions set price_impact = 500 where id = current_setting('t.v2')::uuid;
select public.send_change_order_version(current_setting('t.v2')::uuid);
select throws_ok($$select public.issue_approval_link((select id from public.change_order_versions where version_no = 2 and status = 'draft'))$$, 'P0001', 'not_found', 'sanity: no draft v2 remains');
select set_config('t.tok2', (public.issue_approval_link(current_setting('t.v2')::uuid))->>'token', true);
select lives_ok($$select public.cancel_change_order_version(current_setting('t.v2')::uuid)$$, 'cancel v2');
reset role;
select ok((select bool_and(revoked_at is not null) from public.approval_links where version_id = current_setting('t.v2')::uuid), 'cancel revokes the link');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok2'))->>'state', 'cancelled', 'cancelled link state');
select is(public.submit_public_decision(current_setting('t.tok2'), 'approved', null, '33333333-3333-3333-3333-333333333333')->>'error', 'cancelled', 'cancelled link cannot decide');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
select set_config('t.v3', (public.new_change_order_version(current_setting('t.co')::uuid))::text, true);
select public.send_change_order_version(current_setting('t.v3')::uuid);
select set_config('t.tok3', (public.issue_approval_link(current_setting('t.v3')::uuid))->>'token', true);
select set_config('t.v4', (public.new_change_order_version(current_setting('t.co')::uuid))::text, true);
select public.send_change_order_version(current_setting('t.v4')::uuid);
select set_config('t.tok4', (public.issue_approval_link(current_setting('t.v4')::uuid))->>'token', true);
reset role;
select ok((select bool_and(revoked_at is not null) from public.approval_links where version_id = current_setting('t.v3')::uuid), 'sending a newer version revokes the superseded version''s link');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok3'))->>'state', 'superseded', 'replaced link state');
select is(public.submit_public_decision(current_setting('t.tok3'), 'approved', null, '44444444-4444-4444-4444-444444444444')->>'error', 'superseded', 'replaced link cannot decide (CO-008)');
reset role;

-- revoke / reissue
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
select is(public.revoke_approval_link(current_setting('t.v4')::uuid), true, 'owner revokes the active link');
select is(public.revoke_approval_link(current_setting('t.v4')::uuid), false, 'revoking again does nothing');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok4'))->>'state', 'revoked', 'revoked link state');
select is(public.submit_public_decision(current_setting('t.tok4'), 'approved', null, '55555555-5555-5555-5555-555555555555')->>'error', 'revoked', 'revoked link cannot decide');
reset role;

-- expiry (test-only privileged bypass of the guard, then the guard is verified to be back on)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
select set_config('t.tok4b', (public.issue_approval_link(current_setting('t.v4')::uuid))->>'token', true);
reset role;
select ok((select expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour' from public.approval_links where token_hash = extensions.digest(current_setting('t.tok4b'), 'sha256')), 'expiry is 30 days from issue (OD-4)');
select set_config('guardscope.account_deletion', 'on', true);
update public.approval_links set expires_at = now() - interval '1 second' where token_hash = extensions.digest(current_setting('t.tok4b'), 'sha256');
select set_config('guardscope.account_deletion', 'off', true);
select throws_ok($$update public.approval_links set expires_at = now() + interval '1 year'$$, 'P0001', 'approval_link_immutable', 'expiry cannot be extended once the test bypass is off');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok4b'))->>'state', 'expired', 'expired link state');
select is(public.submit_public_decision(current_setting('t.tok4b'), 'approved', null, '66666666-6666-6666-6666-666666666666')->>'error', 'expired', 'expired link cannot decide');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
select set_config('t.tok4c', (public.issue_approval_link(current_setting('t.v4')::uuid))->>'token', true);
reset role;

-- ===================== T-09 throttle =====================
create function pg_temp.try_submit(t text, c text) returns text language plpgsql as $$
declare r jsonb;
begin
  r := public.submit_public_decision(t, 'approved', c, gen_random_uuid());
  raise exception 'R:%', coalesce(r->>'result', r->>'error');
exception when others then
  return case when sqlerrm like 'R:%' then substr(sqlerrm, 3) else sqlstate || ':' || sqlerrm end;
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"9.9.9.9"}', true);
select is((select count(*)::int from generate_series(1, 20) g where public.get_public_proposal(repeat('C', 43))->>'state' = 'invalid'), 20, 'first 20 failures from one source are processed');
select is(public.get_public_proposal(repeat('C', 43))->>'state', 'rate_limited', 'the 21st attempt is rate limited');
select is(public.get_public_proposal(current_setting('t.tok4c'))->>'state', 'valid', 'DEC-015: a blocked source is still served a correct token');
select is(pg_temp.try_submit(current_setting('t.tok4c'), null), 'recorded', 'DEC-015: a blocked source can still decide with a correct token (rolled back here)');
select is(public.submit_public_decision(repeat('C', 43), 'approved', null, '77777777-7777-7777-7777-777777777777')->>'error', 'rate_limited', 'a blocked source gets rate_limited for a missed token on submit');
select set_config('request.headers', '{"cf-connecting-ip":"8.8.8.8"}', true);
select is(public.get_public_proposal(current_setting('t.tok4c'))->>'state', 'valid', 'a different source is unaffected');
reset role;
select ok((select bool_and(octet_length(source_key) in (1, 32)) from public.public_link_attempts), 'throttle rows hold salted hashes, never raw addresses');
select set_config('request.headers', '{"x-forwarded-for":"6.6.6.6, 5.5.5.5"}', true);
select set_config('t.k1', encode(public._throttle_key(), 'hex'), true);
select set_config('request.headers', '{"cf-connecting-ip":"5.5.5.5"}', true);
select set_config('t.k2', encode(public._throttle_key(), 'hex'), true);
select set_config('request.headers', '{"x-forwarded-for":"6.6.6.6"}', true);
select set_config('t.k3', encode(public._throttle_key(), 'hex'), true);
select set_config('request.headers', '{"cf-connecting-ip":"5.5.5.5","x-forwarded-for":"6.6.6.6"}', true);
select set_config('t.k4', encode(public._throttle_key(), 'hex'), true);
select ok(current_setting('t.k1') = current_setting('t.k2') and current_setting('t.k3') <> current_setting('t.k2') and current_setting('t.k4') = current_setting('t.k2'), 'key uses cf-connecting-ip, else the LAST x-forwarded-for entry (spoofed first entry ignored)');
-- global breaker holds back only sources that have already failed
select set_config('request.headers', '{"cf-connecting-ip":"7.7.7.7"}', true);
insert into public.public_link_attempts (source_key, window_start, failures)
  values ('\x00'::bytea, date_bin('10 minutes', now(), timestamptz '2000-01-01'), 1000)
  on conflict (source_key, window_start) do update set failures = 1000;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok4c'))->>'state', 'valid', 'global breaker: a source with no failures still works');
select is(public.get_public_proposal(repeat('D', 43))->>'state', 'invalid', 'global breaker: its first failure is processed');
select is(public.get_public_proposal(current_setting('t.tok4c'))->>'state', 'valid', 'DEC-015: global breaker open, source already failed: a correct token is still served');
select is(public.get_public_proposal(repeat('D', 43))->>'state', 'rate_limited', 'global breaker: after a failure the source is held back for misses');
reset role;
delete from public.public_link_attempts;
-- SEC-5-1: /64 keying, IPv4 unchanged, malformed values never raise
create function pg_temp.kf(h text) returns text language plpgsql as $$ begin perform set_config('request.headers', h, true); return encode(public._throttle_key(), 'hex'); end $$;
select is(pg_temp.kf('{"cf-connecting-ip":"2001:db8:1:2::1"}'), pg_temp.kf('{"cf-connecting-ip":"2001:db8:1:2:ffff:abcd:1234:9"}'), 'SEC-5-1: two IPv6 addresses in the same /64 share one bucket');
select isnt(pg_temp.kf('{"cf-connecting-ip":"2001:db8:1:2::1"}'), pg_temp.kf('{"cf-connecting-ip":"2001:db8:1:3::1"}'), 'SEC-5-1: different /64 prefixes get different buckets');
select is(pg_temp.kf('{"x-forwarded-for":"1.1.1.1, 2001:db8:1:2::1"}'), pg_temp.kf('{"cf-connecting-ip":"2001:db8:1:2::77"}'), 'SEC-5-1: the /64 rule applies to x-forwarded-for as well');
select is(pg_temp.kf('{"cf-connecting-ip":"5.5.5.5"}'), encode(extensions.digest((select salt from public.public_link_config) || convert_to('5.5.5.5', 'utf8'), 'sha256'), 'hex'), 'SEC-5-1: IPv4 key is unchanged (salted hash of the full address)');
select isnt(pg_temp.kf('{"cf-connecting-ip":"5.5.5.5"}'), pg_temp.kf('{"cf-connecting-ip":"5.5.5.6"}'), 'SEC-5-1: IPv4 addresses are not merged');
select is(pg_temp.kf('{"cf-connecting-ip":"::ffff:5.5.5.5"}'), pg_temp.kf('{"cf-connecting-ip":"5.5.5.5"}'), 'SEC-5-1: IPv4-mapped IPv6 is keyed as the IPv4 address');
select lives_ok($$select pg_temp.kf('{"cf-connecting-ip":"zz::::/999"}'), pg_temp.kf('{"cf-connecting-ip":"1.2.3.4:8080"}'), pg_temp.kf('{"cf-connecting-ip":"::ffff:999.1.1.1"}'), pg_temp.kf('{"x-forwarded-for":",,"}'), pg_temp.kf('{"cf-connecting-ip":"' || repeat('f', 5000) || '"}'), pg_temp.kf('[1'), pg_temp.kf('{"cf-connecting-ip":123}'), pg_temp.kf('null')$$, 'SEC-5-1: malformed address headers never raise');
select is(pg_temp.kf('{"cf-connecting-ip":"not-an-ip"}'), encode(extensions.digest((select salt from public.public_link_config) || convert_to('not-an-ip', 'utf8'), 'sha256'), 'hex'), 'SEC-5-1: a non-address value falls back to the raw text key (as before)');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'public_link_attempts' and indexdef ilike '%(window_start)%'), 'SEC-5-1: window_start index exists');
-- cleanup: bounded batch, removes old rows, keeps fresh ones, deterministic
select set_config('request.headers', '{"cf-connecting-ip":"4.4.4.4"}', true);
insert into public.public_link_attempts (source_key, window_start, failures)
  select extensions.digest(g::text, 'sha256'), now() - interval '3 days' - (g || ' minutes')::interval, 1 from generate_series(1, 120) g;
select public._throttle_record_failure(public._throttle_key());
select is((select count(*)::int from public.public_link_attempts where window_start < now() - interval '1 day'), 70, 'SEC-5-1: one failure call deletes at most a bounded batch (50) of old rows');
select public._throttle_record_failure(public._throttle_key());
select public._throttle_record_failure(public._throttle_key());
select is((select count(*)::int from public.public_link_attempts where window_start < now() - interval '1 day'), 0, 'SEC-5-1: further failure calls finish removing old rows');
select is((select failures from public.public_link_attempts where source_key = public._throttle_key() and window_start = date_bin('10 minutes', now(), timestamptz '2000-01-01')), 3, 'SEC-5-1: current-window rows are kept and counted');
-- below 1000: the per-source cap of 20 still applies to a fresh source
delete from public.public_link_attempts;
insert into public.public_link_attempts (source_key, window_start, failures) values ('\x00'::bytea, date_bin('10 minutes', now(), timestamptz '2000-01-01'), 500);
select public._throttle_record_failure(extensions.digest('fresh20', 'sha256')) from generate_series(1, 19);
select ok(not public._throttle_blocked(extensions.digest('fresh20', 'sha256')), 'SEC-5-1: below the breaker a source with 19 failures is not blocked');
select public._throttle_record_failure(extensions.digest('fresh20', 'sha256'));
select ok(public._throttle_blocked(extensions.digest('fresh20', 'sha256')), 'SEC-5-1: the per-source cap of 20 still applies below the breaker');
-- breaker open, below the hard cap: a fresh source still gets a row and is held back after its first miss
delete from public.public_link_attempts;
insert into public.public_link_attempts (source_key, window_start, failures) values ('\x00'::bytea, date_bin('10 minutes', now(), timestamptz '2000-01-01'), 1000);
select ok(not public._throttle_blocked(extensions.digest('newcomer', 'sha256')), 'SEC-5-1: breaker open: a fresh source is not blocked before it fails');
select public._throttle_record_failure(extensions.digest('newcomer', 'sha256'));
select is((select count(*)::int from public.public_link_attempts where source_key = extensions.digest('newcomer', 'sha256')), 1, 'SEC-5-1: breaker open below the hard cap: the fresh source gets a per-source row');
select ok(public._throttle_blocked(extensions.digest('newcomer', 'sha256')), 'SEC-5-1: breaker open: the fresh source is blocked after its first miss');
-- hard cap: lockdown (no new rows, every source blocked)
delete from public.public_link_attempts;
insert into public.public_link_attempts (source_key, window_start, failures) values ('\x00'::bytea, date_bin('10 minutes', now(), timestamptz '2000-01-01'), (select hard_cap from public._throttle_limits()));
select public._throttle_record_failure(extensions.digest('latecomer', 'sha256'));
select is((select count(*)::int from public.public_link_attempts), 1, 'SEC-5-1: at the hard cap no new per-source row is inserted');
select is((select failures from public.public_link_attempts where source_key = '\x00'::bytea), (select hard_cap + 1 from public._throttle_limits()), 'SEC-5-1: at the hard cap the global row still counts');
select ok(public._throttle_blocked(extensions.digest('latecomer', 'sha256')) and public._throttle_blocked(extensions.digest('never-seen', 'sha256')), 'SEC-5-1: at the hard cap every source is blocked for the rest of the window (documented lockdown trade-off)');
select is((select hard_cap from public._throttle_limits()), 5000, 'SEC-5-1: hard cap is 5000 in _throttle_limits()');
-- DEC-015: a found token is never throttled; misses are, and a blocked miss is not recorded
delete from public.public_link_attempts;
select set_config('request.headers', '{"cf-connecting-ip":"3.3.3.3"}', true);
insert into public.public_link_attempts (source_key, window_start, failures) values (public._throttle_key(), date_bin('10 minutes', now(), timestamptz '2000-01-01'), 20);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok4c'))->>'state', 'valid', 'DEC-015: per-source block: get serves a correct token');
select is(pg_temp.try_submit(current_setting('t.tok4c'), 'ok'), 'recorded', 'DEC-015: per-source block: submit records a decision for a correct token');
select is(public.get_public_proposal(repeat('E', 43))->>'state', 'rate_limited', 'DEC-015: per-source block: a missed token on get is rate_limited');
select is(public.submit_public_decision(repeat('E', 43), 'approved', null, gen_random_uuid())->>'error', 'rate_limited', 'DEC-015: per-source block: a missed token on submit is rate_limited');
reset role;
select is((select failures from public.public_link_attempts where source_key = public._throttle_key()), 20, 'DEC-015: blocked misses are not recorded (source count unchanged)');
delete from public.public_link_attempts;
insert into public.public_link_attempts (source_key, window_start, failures) values ('\x00'::bytea, date_bin('10 minutes', now(), timestamptz '2000-01-01'), 1000), (public._throttle_key(), date_bin('10 minutes', now(), timestamptz '2000-01-01'), 1);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok4c'))->>'state', 'valid', 'DEC-015: breaker open: get serves a correct token to a source that already failed');
select is(pg_temp.try_submit(current_setting('t.tok4c'), 'ok'), 'recorded', 'DEC-015: breaker open: submit records a decision for a correct token');
select is(public.get_public_proposal(repeat('E', 43))->>'state', 'rate_limited', 'DEC-015: breaker open: a miss from that source is rate_limited');
reset role;
select is((select failures from public.public_link_attempts where source_key = '\x00'::bytea), 1000, 'DEC-015: breaker open: the blocked miss was not counted');
delete from public.public_link_attempts;
insert into public.public_link_attempts (source_key, window_start, failures) values ('\x00'::bytea, date_bin('10 minutes', now(), timestamptz '2000-01-01'), (select hard_cap from public._throttle_limits()));
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tok4c'))->>'state', 'valid', 'DEC-015: hard cap: get serves a correct token to a fresh source');
select is(pg_temp.try_submit(current_setting('t.tok4c'), 'ok'), 'recorded', 'DEC-015: hard cap: submit records a decision for a correct token');
select is(public.get_public_proposal(repeat('E', 43))->>'state', 'rate_limited', 'DEC-015: hard cap: a miss from any source is rate_limited (lockdown covers misses only)');
select is(public.submit_public_decision(repeat('E', 43), 'approved', null, gen_random_uuid())->>'error', 'rate_limited', 'DEC-015: hard cap: a missed token on submit is rate_limited');
reset role;
select is((select count(*)::int from public.public_link_attempts) * 10000 + (select failures from public.public_link_attempts where source_key = '\x00'::bytea), 15000, 'DEC-015: hard cap: no rows added and the global count unchanged by blocked misses');
select set_config('request.headers', '', true);
delete from public.public_link_attempts;
-- SEC-5-8: raw-length pre-check, trim boundary (accept cases run in a rolled-back subtransaction so the link stays pending)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.submit_public_decision(current_setting('t.tok4c'), 'approved', repeat('x', 8001), '88888888-8888-8888-8888-888888888881')->>'error', 'validation', 'SEC-5-8: a comment over the 8000-character raw bound is rejected');
select is(public.submit_public_decision(current_setting('t.tok4c'), 'approved', repeat(' ', 8001), '88888888-8888-8888-8888-888888888882')->>'error', 'validation', 'SEC-5-8: an over-long whitespace-only comment is rejected before the trim');
select is(public.submit_public_decision(current_setting('t.tok4c'), 'approved', repeat(' ', 100) || repeat('x', 2001) || repeat(E'\n', 100), '88888888-8888-8888-8888-888888888883')->>'error', 'validation', 'SEC-5-8: 2001 characters after trimming is still rejected');
select is(public.submit_public_decision(current_setting('t.tok4c'), 'approved', repeat('x', 8001), '88888888-8888-8888-8888-888888888884')->>'error', 'validation', 'SEC-5-8: over-long comment is rejected the same way with a valid token');
select is(public.get_public_proposal(current_setting('t.tok4c'))->>'state', 'valid', 'SEC-5-8: rejected submissions recorded nothing');
select is(pg_temp.try_submit(current_setting('t.tok4c'), repeat(' ', 3000) || repeat('y', 2000) || repeat(E'\t', 3000)), 'recorded', 'SEC-5-8: a 2000-character comment with surrounding whitespace (within the raw bound) is accepted');
select is(pg_temp.try_submit(current_setting('t.tok4c'), repeat('y', 8000)), 'validation', 'SEC-5-8: 8000 raw non-blank characters pass the pre-check and fail the 2000 rule');
select is(pg_temp.try_submit(current_setting('t.tok4c'), repeat(E' \n', 4000)), 'recorded', 'SEC-5-8: exactly 8000 raw whitespace characters are accepted as an empty comment');
reset role;
delete from public.public_link_attempts;
select set_config('request.headers', '', true);

-- ===================== project locks =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
update public.projects set status = 'completed' where id = current_setting('t.proj')::uuid;
select throws_ok($$select public.issue_approval_link(current_setting('t.v4')::uuid)$$, 'P0001', 'project_not_active', 'no new link on a completed project');
select is(public.revoke_approval_link(current_setting('t.v4')::uuid), true, 'revoking is still allowed on a completed project (safety action)');
update public.projects set status = 'active' where id = current_setting('t.proj')::uuid;
select set_config('t.tok4d', (public.issue_approval_link(current_setting('t.v4')::uuid))->>'token', true);
reset role;

-- ===================== decline without comment, clarification =====================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.submit_public_decision(current_setting('t.tok4d'), 'declined', '   ', '88888888-8888-8888-8888-888888888888')->>'result', 'recorded', 'decline without a comment is recorded');
reset role;
select ok((select status = 'declined' and comment is null from public.change_order_versions v join public.client_decisions d on d.version_id = v.id where v.id = current_setting('t.v4')::uuid), 'declined, blank comment stored as null');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
select set_config('t.v5', (public.new_change_order_version(current_setting('t.co')::uuid))::text, true);
select public.send_change_order_version(current_setting('t.v5')::uuid);
select set_config('t.tok5', (public.issue_approval_link(current_setting('t.v5')::uuid))->>'token', true);
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.submit_public_decision(current_setting('t.tok5'), 'clarification_requested', 'Does this include hosting?', '99999999-9999-9999-9999-999999999999')->>'result', 'recorded', 'clarification request is recorded');
reset role;
select is((select status from public.change_order_versions where id = current_setting('t.v5')::uuid), 'clarification_requested', 'clarification is its own terminal status, not approval');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
select lives_ok($$select public.new_change_order_version(current_setting('t.co')::uuid)$$, 'after a clarification the freelancer can send a new version (OD-6)');

-- ===================== regression: link-state fixes (Tester F-1, F-2, F-3) =====================
-- A draft revision of a pending version must not supersede its live link (CO-008: only a SENT newer version does).
insert into public.requests (project_id, title, description) values (current_setting('t.proj')::uuid, 'Draft rev', 'Regression request');
select public.classify_request((select id from public.requests where title = 'Draft rev'), 'additional');
select set_config('t.co2', (public.create_change_order((select id from public.requests where title = 'Draft rev')))::text, true);
update public.change_order_versions set description = 'Regression', price_impact = 100 where change_order_id = current_setting('t.co2')::uuid and version_no = 1;
select public.send_change_order_version((select id from public.change_order_versions where change_order_id = current_setting('t.co2')::uuid and version_no = 1));
select set_config('t.tokF', (public.issue_approval_link((select id from public.change_order_versions where change_order_id = current_setting('t.co2')::uuid and version_no = 1)))->>'token', true);
select public.new_change_order_version(current_setting('t.co2')::uuid);
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_proposal(current_setting('t.tokF'))->>'state', 'valid', 'F-1: a draft v2 does not supersede the pending v1 link');
select is(public.submit_public_decision(current_setting('t.tokF'), 'declined', E' \t\r\n ', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa')->>'result', 'recorded', 'F-1/F-2: decision is accepted despite a draft v2, with a tab/newline-only comment');
select is(public.submit_public_decision(current_setting('t.tokF'), 'declined', repeat('x', 2001), 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb')->>'error', 'validation', 'F-2: a 2001-character comment is still rejected');
reset role;
select ok((select d.comment is null from public.client_decisions d join public.change_order_versions v on v.id = d.version_id where v.change_order_id = current_setting('t.co2')::uuid)
      and (select (metadata->>'has_comment')::boolean = false from public.activity_events where event_type = 'change_order.declined' and entity_id = current_setting('t.co2')::uuid), 'F-2: whitespace-only comment stored as null and has_comment is false');
-- F-3 / BR-2 precedence in the helper itself (a pending, not-latest version is superseded even if revoked or expired).
select is(public._link_state('pending', now(), now() + interval '1 day', 1, 2), 'superseded', 'F-3: pending, revoked, not latest is superseded');
select is(public._link_state('pending', null, now() - interval '1 day', 1, 2), 'superseded', 'F-3: pending, expired, not latest is superseded');
select ok(public._link_state('approved', now(), now() - interval '1 day', 1, 2) = 'decided'
      and public._link_state('cancelled', now(), now() - interval '1 day', 1, 2) = 'cancelled'
      and public._link_state('draft', null, now() + interval '1 day', 2, 2) = 'invalid', 'F-3: decided, cancelled and invalid keep their precedence');
select is(public._link_state('pending', now(), now() + interval '1 day', 2, 2), 'revoked', 'F-3: the latest pending version that is revoked still reports revoked');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);

-- ===================== T-10 access control =====================
select throws_ok($$insert into public.client_decisions (version_id, link_id, decision, idempotency_key) select version_id, id, 'approved', gen_random_uuid() from public.approval_links limit 1$$, '42501', null, 'owner cannot write decisions');
select throws_ok($$update public.approval_links set revoked_at = null$$, '42501', null, 'owner cannot write links directly');
select is((select comment from public.client_decisions where decision = 'approved'), 'Looks good, thanks', 'owner reads the client comment against the exact version');
select throws_ok($$select public.issue_approval_link(gen_random_uuid())$$, 'P0001', 'not_found', 'unknown version id');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b5","role":"authenticated"}', true);
select is((select count(*)::int from public.approval_links) + (select count(*)::int from public.client_decisions), 0, 'B sees none of A''s links or decisions');
select throws_ok($$select public.issue_approval_link(current_setting('t.v5')::uuid)$$, 'P0001', 'not_found', 'B cannot issue a link on A''s version');
select throws_ok($$select public.revoke_approval_link(current_setting('t.v4')::uuid)$$, 'P0001', 'not_found', 'B cannot revoke A''s link');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.approval_links$$, '42501', null, 'anon cannot read links');
select throws_ok($$select * from public.client_decisions$$, '42501', null, 'anon cannot read decisions');
select throws_ok($$select * from public.public_link_attempts$$, '42501', null, 'anon cannot read throttle rows');
select throws_ok($$select * from public.public_link_config$$, '42501', null, 'anon cannot read the salt');
select throws_ok($$select * from public.change_order_versions$$, '42501', null, 'anon cannot read versions directly');
select throws_ok($$select public.issue_approval_link(gen_random_uuid())$$, '42501', null, 'anon cannot issue links');
reset role;
select ok(has_function_privilege('anon', 'public.get_public_proposal(text)', 'execute')
      and has_function_privilege('anon', 'public.submit_public_decision(text,text,text,uuid)', 'execute')
      and not has_function_privilege('anon', 'public.issue_approval_link(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.revoke_approval_link(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.issue_approval_link(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.revoke_approval_link(uuid)', 'execute'), 'grant matrix: only the two public RPCs are executable by anon');
select ok(not has_function_privilege('anon', 'public._throttle_key()', 'execute')
      and not has_function_privilege('anon', 'public._throttle_blocked(bytea)', 'execute')
      and not has_function_privilege('anon', 'public._throttle_record_failure(bytea)', 'execute')
      and not has_function_privilege('anon', 'public._link_state(text,timestamptz,timestamptz,int,int)', 'execute')
      and not has_function_privilege('anon', 'public._throttle_limits()', 'execute')
      and not has_function_privilege('authenticated', 'public._throttle_blocked(bytea)', 'execute'), 'internal helpers are not callable through the API');

-- ===================== immutability (privileged roles too) =====================
select throws_ok($$update public.client_decisions set decision = 'declined'$$, 'P0001', 'client_decision_immutable', 'decisions cannot be updated');
select throws_ok($$delete from public.client_decisions$$, 'P0001', 'client_decision_immutable', 'decisions cannot be deleted');
select throws_ok($$update public.approval_links set token_hash = extensions.digest('x', 'sha256')$$, 'P0001', 'approval_link_immutable', 'token hash cannot change');
select throws_ok($$update public.approval_links set revoked_at = null where revoked_at is not null$$, 'P0001', 'approval_link_immutable', 'a revoked link cannot be revived');
select throws_ok($$delete from public.approval_links$$, 'P0001', 'approval_link_immutable', 'links cannot be deleted');

-- ===================== account deletion =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
select public.delete_my_account();
reset role;
select is((select count(*)::int from public.approval_links) + (select count(*)::int from public.client_decisions) + (select count(*)::int from public.change_order_versions), 0, 'account deletion removes links, decisions and versions');

select * from finish();
rollback;
