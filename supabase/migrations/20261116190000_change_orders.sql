-- Phase 4 (change-order proposal & versioning). ARCHITECTURE.md §3.1, §4.1, §4.3, §4.4 (OD-6 = HA-006).
-- Approved: HA-007. Client links and decisions are Phase 5.

-- ---------------------------------------------------------------------------
-- change_orders (one per request; C-1)
-- ---------------------------------------------------------------------------
create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint change_orders_request_uq unique (request_id)
);

create index change_orders_project_idx on public.change_orders (project_id, created_at desc);

alter table public.change_orders enable row level security;
revoke all on public.change_orders from anon, authenticated;
grant select on public.change_orders to authenticated;

create policy change_orders_select_own on public.change_orders for select to authenticated
  using (exists (select 1 from public.projects p where p.id = change_orders.project_id and p.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- change_order_versions
-- ---------------------------------------------------------------------------
create table public.change_order_versions (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.change_orders (id) on delete cascade,
  version_no int not null check (version_no > 0),
  title text not null check (char_length(btrim(title)) between 1 and 200 and char_length(title) <= 200),
  description text not null default '' check (char_length(description) <= 5000),
  price_impact numeric(14, 2) not null default 0 check (price_impact >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  time_impact_value numeric(8, 2) check (time_impact_value is null or time_impact_value >= 0),
  time_impact_unit text check (time_impact_unit is null or time_impact_unit in ('hours', 'days', 'weeks')),
  proposed_deadline date,
  assumptions text check (assumptions is null or char_length(assumptions) <= 5000),
  exclusions text check (exclusions is null or char_length(exclusions) <= 5000),
  client_terms text check (client_terms is null or char_length(client_terms) <= 5000),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'declined', 'clarification_requested', 'cancelled', 'superseded')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  status_changed_at timestamptz not null default now(),
  constraint change_order_versions_no_uq unique (change_order_id, version_no),
  constraint change_order_versions_time_pair check ((time_impact_value is null) = (time_impact_unit is null)),
  constraint change_order_versions_sent_consistency check ((status = 'draft') = (sent_at is null))
);

-- BR-3: at most one draft and one pending version per change order
create unique index change_order_versions_one_draft_uq on public.change_order_versions (change_order_id) where status = 'draft';
create unique index change_order_versions_one_pending_uq on public.change_order_versions (change_order_id) where status = 'pending';

alter table public.change_order_versions enable row level security;
revoke all on public.change_order_versions from anon, authenticated;
grant select on public.change_order_versions to authenticated;
grant update (title, description, price_impact, currency, time_impact_value, time_impact_unit, proposed_deadline,
              assumptions, exclusions, client_terms) on public.change_order_versions to authenticated;

create policy change_order_versions_select_own on public.change_order_versions for select to authenticated
  using (exists (select 1 from public.change_orders co join public.projects p on p.id = co.project_id
                 where co.id = change_order_versions.change_order_id and p.owner_id = (select auth.uid())));
create policy change_order_versions_update_draft_own on public.change_order_versions for update to authenticated
  using (status = 'draft'
         and exists (select 1 from public.change_orders co join public.projects p on p.id = co.project_id
                     where co.id = change_order_versions.change_order_id and p.owner_id = (select auth.uid()) and p.status = 'active'))
  with check (status = 'draft'
         and exists (select 1 from public.change_orders co join public.projects p on p.id = co.project_id
                     where co.id = change_order_versions.change_order_id and p.owner_id = (select auth.uid()) and p.status = 'active'));

-- Immutability after send + status transition matrix (BR-1, BR-2). Applies to every role.
create function public.change_order_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  if coalesce(current_setting('guardscope.account_deletion', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.sent_at is not null or old.status <> 'draft' then
      raise exception 'change_order_version_immutable' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.change_order_id is distinct from old.change_order_id or new.version_no is distinct from old.version_no
     or new.created_at is distinct from old.created_at then
    raise exception 'change_order_version_immutable' using errcode = 'P0001';
  end if;

  if old.sent_at is not null and (
       (new.title, new.description, new.price_impact, new.currency, new.time_impact_value, new.time_impact_unit,
        new.proposed_deadline, new.assumptions, new.exclusions, new.client_terms, new.sent_at)
       is distinct from
       (old.title, old.description, old.price_impact, old.currency, old.time_impact_value, old.time_impact_unit,
        old.proposed_deadline, old.assumptions, old.exclusions, old.client_terms, old.sent_at)) then
    raise exception 'change_order_version_immutable' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    v_allowed := (old.status = 'draft' and new.status = 'pending')
              or (old.status = 'pending' and new.status in ('approved', 'declined', 'clarification_requested', 'cancelled', 'superseded'));
    if not v_allowed then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    new.status_changed_at := clock_timestamp();
  elsif new.status_changed_at is distinct from old.status_changed_at then
    raise exception 'change_order_version_immutable' using errcode = 'P0001';
  end if;

  if old.status = 'draft' then
    new.updated_at := clock_timestamp();
  elsif new.updated_at is distinct from old.updated_at then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.change_order_versions_guard() from public, anon, authenticated;

create trigger change_order_versions_guard
  before update or delete on public.change_order_versions
  for each row execute function public.change_order_versions_guard();

-- ---------------------------------------------------------------------------
-- Helper used by RPCs: lock a change order and verify the caller owns an active project.
-- ---------------------------------------------------------------------------
create function public._lock_change_order(p_change_order_id uuid, p_require_active boolean)
returns public.change_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  co public.change_orders;
  p public.projects;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into co from public.change_orders where id = p_change_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into p from public.projects where id = co.project_id;
  if p.owner_id is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_require_active and p.status <> 'active' then
    raise exception 'project_not_active' using errcode = 'P0001';
  end if;
  return co;
end;
$$;
revoke execute on function public._lock_change_order(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create_change_order (CO-001, REQ-005)
-- ---------------------------------------------------------------------------
create function public.create_change_order(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests;
  p public.projects;
  v_co uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into r from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into p from public.projects where id = r.project_id;
  if p.owner_id is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p.status <> 'active' then
    raise exception 'project_not_active' using errcode = 'P0001';
  end if;
  if r.classification <> 'additional' then
    raise exception 'request_not_additional' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.change_orders where request_id = r.id) then
    raise exception 'change_order_exists' using errcode = 'P0001';
  end if;

  begin
    insert into public.change_orders (project_id, request_id, created_by)
    values (p.id, r.id, auth.uid())
    returning id into v_co;
  exception when unique_violation then
    raise exception 'change_order_exists' using errcode = 'P0001';
  end;

  -- BR-6: only title and description are copied; never internal notes.
  insert into public.change_order_versions (change_order_id, version_no, title, description, currency, created_by)
  values (v_co, 1, left(r.title, 200), coalesce(left(r.description, 5000), ''), p.currency, auth.uid());

  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary, metadata)
  values (p.id, 'freelancer', auth.uid(), 'change_order.created', 'change_order', v_co, 1,
          'Change proposal created from request "' || left(r.title, 150) || '"',
          jsonb_build_object('request_id', r.id));
  return v_co;
end;
$$;
revoke execute on function public.create_change_order(uuid) from public, anon, authenticated;
grant execute on function public.create_change_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: send_change_order_version (CO-003, CO-005, CO-006; BR-7)
-- ---------------------------------------------------------------------------
create function public.send_change_order_version(p_version_id uuid)
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
  -- One day of tolerance for time zones behind UTC (the UI enforces the user's local today).
  if v.proposed_deadline is not null and v.proposed_deadline < current_date - 1 then
    raise exception 'deadline_in_past' using errcode = 'P0001';
  end if;

  for s in
    update public.change_order_versions set status = 'superseded'
     where change_order_id = co.id and status = 'pending'
    returning version_no
  loop
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
revoke execute on function public.send_change_order_version(uuid) from public, anon, authenticated;
grant execute on function public.send_change_order_version(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: cancel_change_order_version (pending -> cancelled)
-- ---------------------------------------------------------------------------
create function public.cancel_change_order_version(p_version_id uuid)
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
  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary)
  values (co.project_id, 'freelancer', auth.uid(), 'change_order.cancelled', 'change_order', co.id, v.version_no,
          'Version ' || v.version_no || ' cancelled before the client decided');
  return v;
end;
$$;
revoke execute on function public.cancel_change_order_version(uuid) from public, anon, authenticated;
grant execute on function public.cancel_change_order_version(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: new_change_order_version (copy latest into a new draft; C-5)
-- ---------------------------------------------------------------------------
create function public.new_change_order_version(p_change_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  co public.change_orders;
  l public.change_order_versions;
  v_id uuid;
begin
  co := public._lock_change_order(p_change_order_id, true);
  if exists (select 1 from public.change_order_versions where change_order_id = co.id and status = 'draft') then
    raise exception 'draft_exists' using errcode = 'P0001';
  end if;
  select * into l from public.change_order_versions where change_order_id = co.id order by version_no desc limit 1;
  insert into public.change_order_versions (change_order_id, version_no, title, description, price_impact, currency,
                                            time_impact_value, time_impact_unit, proposed_deadline, assumptions,
                                            exclusions, client_terms, created_by)
  values (co.id, l.version_no + 1, l.title, l.description, l.price_impact, l.currency, l.time_impact_value,
          l.time_impact_unit, l.proposed_deadline, l.assumptions, l.exclusions, l.client_terms, auth.uid())
  returning id into v_id;
  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary)
  values (co.project_id, 'freelancer', auth.uid(), 'change_order.version_created', 'change_order', co.id, l.version_no + 1,
          'Draft version ' || (l.version_no + 1) || ' created from version ' || l.version_no);
  return v_id;
end;
$$;
revoke execute on function public.new_change_order_version(uuid) from public, anon, authenticated;
grant execute on function public.new_change_order_version(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: discard_change_order_draft (BR-4). Returns true if the whole proposal was removed.
-- ---------------------------------------------------------------------------
create function public.discard_change_order_draft(p_version_id uuid)
returns boolean
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
  if v.status <> 'draft' then
    raise exception 'not_draft' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.change_order_versions where change_order_id = co.id and id <> v.id) then
    delete from public.change_orders where id = co.id;   -- never sent: remove the whole proposal
    insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary)
    values (co.project_id, 'freelancer', auth.uid(), 'change_order.discarded', 'change_order', co.id, v.version_no,
            'Unsent change proposal discarded');
    return true;
  end if;

  delete from public.change_order_versions where id = v.id;
  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, entity_version, summary)
  values (co.project_id, 'freelancer', auth.uid(), 'change_order.draft_discarded', 'change_order', co.id, v.version_no,
          'Draft version ' || v.version_no || ' discarded');
  return false;
end;
$$;
revoke execute on function public.discard_change_order_draft(uuid) from public, anon, authenticated;
grant execute on function public.discard_change_order_draft(uuid) to authenticated;
