-- Phase 5 (secure client approval). ARCHITECTURE.md §4.1, §4.2, §5.2, §5.5, §9. Approved: HA-008
-- (OD-4: 30-day expiry; OD-5: no client identity). DEC-012 (throttle key), DEC-013 (link issuance).

-- ---------------------------------------------------------------------------
-- approval_links: the raw token is NEVER stored, only its SHA-256.
-- ---------------------------------------------------------------------------
create table public.approval_links (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.change_order_versions (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- At most one active (unrevoked) link per version
create unique index approval_links_one_active_uq on public.approval_links (version_id) where revoked_at is null;

alter table public.approval_links enable row level security;
revoke all on public.approval_links from anon, authenticated;
-- Column-level grant: the owner can never read token_hash
grant select (id, version_id, expires_at, revoked_at, created_at) on public.approval_links to authenticated;

create policy approval_links_select_own on public.approval_links for select to authenticated
  using (exists (select 1 from public.change_order_versions v
                 join public.change_orders co on co.id = v.change_order_id
                 join public.projects p on p.id = co.project_id
                 where v.id = approval_links.version_id and p.owner_id = (select auth.uid())));

create function public.approval_links_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('guardscope.account_deletion', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'approval_link_immutable' using errcode = 'P0001';
  end if;
  -- Only revoked_at may change, and only from null to a value (never cleared, never moved).
  if (new.id, new.version_id, new.token_hash, new.expires_at, new.created_at)
       is distinct from (old.id, old.version_id, old.token_hash, old.expires_at, old.created_at)
     or old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'approval_link_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.approval_links_guard() from public, anon, authenticated;

create trigger approval_links_guard
  before update or delete on public.approval_links
  for each row execute function public.approval_links_guard();

-- ---------------------------------------------------------------------------
-- client_decisions: one per version, immutable (HIST-002, CO-009).
-- ---------------------------------------------------------------------------
create table public.client_decisions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.change_order_versions (id) on delete cascade,
  link_id uuid not null references public.approval_links (id) on delete cascade,
  decision text not null check (decision in ('approved', 'declined', 'clarification_requested')),
  comment text check (comment is null or (char_length(comment) between 1 and 2000)),
  idempotency_key uuid not null,
  decided_at timestamptz not null default clock_timestamp(),
  constraint client_decisions_one_per_version unique (version_id),
  constraint client_decisions_idempotency_uq unique (link_id, idempotency_key)
);

alter table public.client_decisions enable row level security;
revoke all on public.client_decisions from anon, authenticated;
grant select (id, version_id, link_id, decision, comment, decided_at) on public.client_decisions to authenticated;

create policy client_decisions_select_own on public.client_decisions for select to authenticated
  using (exists (select 1 from public.change_order_versions v
                 join public.change_orders co on co.id = v.change_order_id
                 join public.projects p on p.id = co.project_id
                 where v.id = client_decisions.version_id and p.owner_id = (select auth.uid())));

create function public.client_decisions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('guardscope.account_deletion', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'client_decision_immutable' using errcode = 'P0001';
end;
$$;
revoke execute on function public.client_decisions_guard() from public, anon, authenticated;

create trigger client_decisions_guard
  before update or delete on public.client_decisions
  for each row execute function public.client_decisions_guard();

-- ---------------------------------------------------------------------------
-- Abuse throttle (DEC-012). No raw IPs: source keys are salted hashes.
-- ---------------------------------------------------------------------------
create table public.public_link_config (
  singleton boolean primary key default true check (singleton),
  salt bytea not null
);
insert into public.public_link_config (salt) values (extensions.gen_random_bytes(32));
alter table public.public_link_config enable row level security;
revoke all on public.public_link_config from anon, authenticated;

create table public.public_link_attempts (
  source_key bytea not null,
  window_start timestamptz not null,
  failures int not null default 0,
  primary key (source_key, window_start)
);
alter table public.public_link_attempts enable row level security;
revoke all on public.public_link_attempts from anon, authenticated;

-- All tunables in one place (spec C-3): per-source failures per window, global failures per window, window.
create function public._throttle_limits(out per_source int, out global_limit int, out win interval)
language sql
immutable
set search_path = ''
as $$ select 20, 1000, interval '10 minutes' $$;

-- Source key: cf-connecting-ip (edge-set, spoof-rejected) else the LAST x-forwarded-for entry (never the first,
-- which the client controls). Salted and hashed; the raw address is never stored.
create function public._throttle_key()
returns bytea
language plpgsql
stable
set search_path = ''
as $$
declare
  h json;
  cf text;
  parts text[];
  src text;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then
    h := null;
  end;
  cf := nullif(btrim(coalesce(h ->> 'cf-connecting-ip', '')), '');
  parts := string_to_array(coalesce(h ->> 'x-forwarded-for', ''), ',');
  src := coalesce(cf, nullif(btrim(parts[array_length(parts, 1)]), ''), 'unknown');
  return extensions.digest((select salt from public.public_link_config) || convert_to(left(src, 100), 'utf8'), 'sha256');
end;
$$;

create function public._throttle_blocked(p_key bytea)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lim record;
  w timestamptz;
  f int;
  g int;
begin
  select * into lim from public._throttle_limits();
  w := date_bin(lim.win, now(), timestamptz '2000-01-01');
  select failures into f from public.public_link_attempts where source_key = p_key and window_start = w;
  if coalesce(f, 0) >= lim.per_source then
    return true;
  end if;
  -- Global breaker: when overall failures spike, anyone who has already failed in this window is held back.
  select failures into g from public.public_link_attempts where source_key = '\x00'::bytea and window_start = w;
  return coalesce(g, 0) >= lim.global_limit and coalesce(f, 0) >= 1;
end;
$$;
revoke execute on function public._throttle_blocked(bytea) from public, anon, authenticated;

create function public._throttle_record_failure(p_key bytea)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lim record;
  w timestamptz;
begin
  select * into lim from public._throttle_limits();
  w := date_bin(lim.win, now(), timestamptz '2000-01-01');
  insert into public.public_link_attempts (source_key, window_start, failures)
  values (p_key, w, 1), ('\x00'::bytea, w, 1)
  on conflict (source_key, window_start) do update set failures = public.public_link_attempts.failures + 1;
  if random() < 0.01 then
    delete from public.public_link_attempts where window_start < now() - interval '1 day';
  end if;
end;
$$;
revoke execute on function public._throttle_record_failure(bytea) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Link state (BR-2 precedence): invalid > superseded > cancelled > decided > revoked > expired > valid
-- ---------------------------------------------------------------------------
create function public._link_state(p_status text, p_revoked timestamptz, p_expires timestamptz, p_version_no int, p_max_no int)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'draft' then 'invalid'
    when p_status = 'superseded' then 'superseded'
    when p_status = 'cancelled' then 'cancelled'
    when p_status in ('approved', 'declined', 'clarification_requested') then 'decided'
    when p_revoked is not null then 'revoked'
    when p_expires <= now() then 'expired'
    when p_version_no <> p_max_no then 'superseded'
    else 'valid'
  end
$$;
revoke execute on function public._link_state(text, timestamptz, timestamptz, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PUBLIC RPC: get_public_proposal (anon). Returns the explicit BR-1 projection only.
-- ---------------------------------------------------------------------------
create function public.get_public_proposal(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k bytea := public._throttle_key();
  r record;
  st text;
  d public.client_decisions;
  proposal jsonb;
  fname text;
begin
  if public._throttle_blocked(k) then
    return jsonb_build_object('state', 'rate_limited');
  end if;
  if p_token is null or char_length(p_token) <> 43 or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    perform public._throttle_record_failure(k);
    return jsonb_build_object('state', 'invalid');
  end if;

  select l.expires_at, l.revoked_at, v.id as version_id, v.version_no, v.status,
         (select max(x.version_no) from public.change_order_versions x where x.change_order_id = v.change_order_id) as max_no,
         v.title, v.description, v.price_impact, v.currency, v.time_impact_value, v.time_impact_unit,
         v.proposed_deadline, v.assumptions, v.exclusions, v.client_terms, v.sent_at,
         p.title as project_title, p.client_name, pr.display_name
    into r
    from public.approval_links l
    join public.change_order_versions v on v.id = l.version_id
    join public.change_orders co on co.id = v.change_order_id
    join public.projects p on p.id = co.project_id
    left join public.profiles pr on pr.id = p.owner_id
   where l.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    perform public._throttle_record_failure(k);
    return jsonb_build_object('state', 'invalid');
  end if;

  st := public._link_state(r.status, r.revoked_at, r.expires_at, r.version_no, r.max_no);
  fname := nullif(btrim(coalesce(r.display_name, '')), '');

  if st not in ('valid', 'decided') then
    -- Expired / revoked / replaced / cancelled: reveal only whom to contact.
    return jsonb_build_object('state', st, 'freelancer_name', fname);
  end if;

  proposal := jsonb_build_object(
    'project_title', r.project_title,
    'client_name', r.client_name,
    'freelancer_name', fname,
    'version_no', r.version_no,
    'sent_at', r.sent_at,
    'expires_at', r.expires_at,
    'title', r.title,
    'description', r.description,
    'price_impact', r.price_impact,
    'currency', r.currency,
    'time_impact_value', r.time_impact_value,
    'time_impact_unit', r.time_impact_unit,
    'proposed_deadline', r.proposed_deadline,
    'assumptions', r.assumptions,
    'exclusions', r.exclusions,
    'client_terms', r.client_terms);

  if st = 'decided' then
    select * into d from public.client_decisions where version_id = r.version_id;
    return jsonb_build_object('state', 'decided', 'proposal', proposal,
                              'decision', jsonb_build_object('decision', d.decision, 'decided_at', d.decided_at));
  end if;
  return jsonb_build_object('state', 'valid', 'proposal', proposal);
end;
$$;
revoke execute on function public.get_public_proposal(text) from public, anon, authenticated;
grant execute on function public.get_public_proposal(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- PUBLIC RPC: submit_public_decision (anon). Atomic, idempotent, one decision per version.
-- Lock order: change order -> version (same as send/cancel/issue: deadlock-free).
-- ---------------------------------------------------------------------------
create function public.submit_public_decision(p_token text, p_decision text, p_comment text, p_idempotency_key uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k bytea := public._throttle_key();
  ids record;
  co public.change_orders;
  ver public.change_order_versions;
  lnk public.approval_links;
  cd public.client_decisions;
  mx int;
  st text;
  v_comment text;
  v_label text;
begin
  if public._throttle_blocked(k) then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  if p_decision is null or p_decision not in ('approved', 'declined', 'clarification_requested')
     or p_idempotency_key is null or (v_comment is not null and char_length(v_comment) > 2000) then
    return jsonb_build_object('error', 'validation');
  end if;

  if p_token is null or char_length(p_token) <> 43 or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    perform public._throttle_record_failure(k);
    return jsonb_build_object('error', 'invalid');
  end if;

  select l.id as link_id, v.id as version_id, v.change_order_id as co_id
    into ids
    from public.approval_links l
    join public.change_order_versions v on v.id = l.version_id
   where l.token_hash = extensions.digest(p_token, 'sha256');
  if not found then
    perform public._throttle_record_failure(k);
    return jsonb_build_object('error', 'invalid');
  end if;

  -- Serialise with every other writer of this proposal, then re-read under the locks.
  select * into co from public.change_orders where id = ids.co_id for update;
  select * into ver from public.change_order_versions where id = ids.version_id for update;
  select * into lnk from public.approval_links where id = ids.link_id;
  select max(version_no) into mx from public.change_order_versions where change_order_id = co.id;

  -- Idempotent retry: the same key returns the original result, whatever the state is now.
  select * into cd from public.client_decisions where link_id = lnk.id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('result', 'already_recorded', 'decision', cd.decision, 'decided_at', cd.decided_at);
  end if;

  st := public._link_state(ver.status, lnk.revoked_at, lnk.expires_at, ver.version_no, mx);
  if st <> 'valid' then
    return jsonb_build_object('error', st);
  end if;

  begin
    insert into public.client_decisions (version_id, link_id, decision, comment, idempotency_key)
    values (ver.id, lnk.id, p_decision, v_comment, p_idempotency_key)
    returning * into cd;
  exception when unique_violation then
    return jsonb_build_object('error', 'decided');
  end;

  update public.change_order_versions set status = p_decision where id = ver.id;

  v_label := case p_decision
               when 'approved' then 'approved'
               when 'declined' then 'declined'
               else 'asked for clarification on' end;
  -- The comment text is deliberately NOT copied into the history event (data minimisation, spec C-2).
  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary, metadata)
  values (co.project_id, 'client', null, 'change_order.' || p_decision, 'change_order', co.id, ver.version_no,
          'Client ' || v_label || ' version ' || ver.version_no,
          jsonb_build_object('has_comment', v_comment is not null));

  return jsonb_build_object('result', 'recorded', 'decision', cd.decision, 'decided_at', cd.decided_at);
end;
$$;
revoke execute on function public.submit_public_decision(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_public_decision(text, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- OWNER RPC: issue_approval_link (also "reissue"): revokes any active link, returns the raw token ONCE.
-- ---------------------------------------------------------------------------
create function public.issue_approval_link(p_version_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ver public.change_order_versions;
  co public.change_orders;
  v_token text;
  v_exp timestamptz := clock_timestamp() + interval '30 days';
  v_revoked int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into ver from public.change_order_versions where id = p_version_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  co := public._lock_change_order(ver.change_order_id, true);
  select * into ver from public.change_order_versions where id = p_version_id for update;
  if ver.status <> 'pending' then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;

  update public.approval_links set revoked_at = clock_timestamp() where version_id = ver.id and revoked_at is null;
  get diagnostics v_revoked = row_count;

  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.approval_links (version_id, token_hash, expires_at)
  values (ver.id, extensions.digest(v_token, 'sha256'), v_exp);

  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary)
  values (co.project_id, 'freelancer', auth.uid(), 'change_order.link_issued', 'change_order', co.id, ver.version_no,
          case when v_revoked > 0 then 'New approval link issued for version ' || ver.version_no || '; the previous link was revoked'
               else 'Approval link issued for version ' || ver.version_no end);

  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end;
$$;
revoke execute on function public.issue_approval_link(uuid) from public, anon, authenticated;
grant execute on function public.issue_approval_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- OWNER RPC: revoke_approval_link (allowed on any project status: it is a safety action)
-- ---------------------------------------------------------------------------
create function public.revoke_approval_link(p_version_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ver public.change_order_versions;
  co public.change_orders;
  v_revoked int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into ver from public.change_order_versions where id = p_version_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  co := public._lock_change_order(ver.change_order_id, false);
  update public.approval_links set revoked_at = clock_timestamp() where version_id = p_version_id and revoked_at is null;
  get diagnostics v_revoked = row_count;
  if v_revoked > 0 then
    insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary)
    values (co.project_id, 'freelancer', auth.uid(), 'change_order.link_revoked', 'change_order', co.id, ver.version_no,
            'Approval link for version ' || ver.version_no || ' revoked');
  end if;
  return v_revoked > 0;
end;
$$;
revoke execute on function public.revoke_approval_link(uuid) from public, anon, authenticated;
grant execute on function public.revoke_approval_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Phase 4 functions, redefined (same signatures and return types) to revoke links atomically.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_change_order_version(p_version_id uuid)
returns public.change_order_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.change_order_versions;
  co public.change_orders;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into v from public.change_order_versions where id = p_version_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  co := public._lock_change_order(v.change_order_id, true);
  select * into v from public.change_order_versions where id = p_version_id for update;
  if v.status <> 'pending' then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;
  update public.change_order_versions set status = 'cancelled' where id = v.id returning * into v;
  update public.approval_links set revoked_at = clock_timestamp() where version_id = v.id and revoked_at is null;
  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary)
  values (co.project_id, 'freelancer', auth.uid(), 'change_order.cancelled', 'change_order', co.id, v.version_no,
          'Version ' || v.version_no || ' cancelled before the client decided');
  return v;
end;
$$;

create or replace function public.send_change_order_version(p_version_id uuid)
returns public.change_order_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.change_order_versions;
  co public.change_orders;
  s record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into v from public.change_order_versions where id = p_version_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  co := public._lock_change_order(v.change_order_id, true);
  select * into v from public.change_order_versions where id = p_version_id for update;

  if v.status <> 'draft' then
    raise exception 'not_draft' using errcode = 'P0001';
  end if;
  if btrim(v.title) = '' or btrim(v.description) = '' then
    raise exception 'missing_content' using errcode = 'P0001';
  end if;
  if (v.time_impact_value is null) <> (v.time_impact_unit is null) then
    raise exception 'invalid_time_impact' using errcode = 'P0001';
  end if;
  if not (v.price_impact > 0 or coalesce(v.time_impact_value, 0) > 0) then
    raise exception 'invalid_impact' using errcode = 'P0001';
  end if;
  if v.proposed_deadline is not null and v.proposed_deadline < current_date - 1 then
    raise exception 'deadline_in_past' using errcode = 'P0001';
  end if;

  for s in
    update public.change_order_versions set status = 'superseded'
     where change_order_id = co.id and status = 'pending'
    returning id, version_no
  loop
    update public.approval_links set revoked_at = clock_timestamp() where version_id = s.id and revoked_at is null;
    insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary)
    values (co.project_id, 'freelancer', auth.uid(), 'change_order.superseded', 'change_order', co.id, s.version_no,
            'Version ' || s.version_no || ' superseded by version ' || v.version_no);
  end loop;

  update public.change_order_versions set status = 'pending', sent_at = clock_timestamp()
   where id = v.id returning * into v;

  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary, metadata)
  values (co.project_id, 'freelancer', auth.uid(), 'change_order.sent', 'change_order', co.id, v.version_no,
          'Version ' || v.version_no || ' sent',
          jsonb_build_object('price_impact', v.price_impact, 'currency', v.currency,
                             'time_impact_value', v.time_impact_value, 'time_impact_unit', v.time_impact_unit));
  return v;
end;
$$;
