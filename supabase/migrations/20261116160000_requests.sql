-- Phase 3 (request capture & classification). ARCHITECTURE.md §3.1 (requests, activity_events,
-- revision_usages), §4.1 (classify_request), §5.1. Approved: HA-005.

-- ---------------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200 and char_length(title) <= 200),
  description text check (description is null or char_length(description) <= 5000),
  source_channel text check (source_channel is null or source_channel in ('whatsapp', 'email', 'call', 'meeting', 'other')),
  received_on date not null default current_date,
  classification text not null default 'unclassified'
    check (classification in ('unclassified', 'included', 'additional', 'needs_clarification')),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index requests_project_received_idx on public.requests (project_id, received_on desc, created_at desc);

alter table public.requests enable row level security;
revoke all on public.requests from anon, authenticated;
grant select on public.requests to authenticated;
grant insert (project_id, title, description, source_channel, received_on, internal_notes) on public.requests to authenticated;
grant update (title, description, source_channel, received_on, internal_notes) on public.requests to authenticated;

create policy requests_select_own on public.requests for select to authenticated
  using (exists (select 1 from public.projects p where p.id = requests.project_id and p.owner_id = (select auth.uid())));
create policy requests_insert_own on public.requests for insert to authenticated
  with check (exists (select 1 from public.projects p
                      where p.id = requests.project_id and p.owner_id = (select auth.uid()) and p.status <> 'archived'));
create policy requests_update_own on public.requests for update to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = requests.project_id and p.owner_id = (select auth.uid()) and p.status <> 'archived'))
  with check (exists (select 1 from public.projects p
                      where p.id = requests.project_id and p.owner_id = (select auth.uid()) and p.status <> 'archived'));

-- Received date may not be in the future (BR-5). One day of tolerance for time zones ahead of UTC.
create function public.requests_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.received_on > current_date + 1 then
    raise exception 'received_on_in_future' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_before_write() from public, anon, authenticated;

create trigger requests_before_write
  before insert or update on public.requests
  for each row execute function public.requests_before_write();

-- ---------------------------------------------------------------------------
-- activity_events (append-only; HIST-001..003)
-- ---------------------------------------------------------------------------
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_type text not null check (actor_type in ('freelancer', 'client', 'system')),
  actor_id uuid,
  event_type text not null check (char_length(event_type) between 1 and 64),
  entity_type text not null check (char_length(entity_type) between 1 and 32),
  entity_id uuid not null,
  entity_version int,
  summary text not null check (char_length(summary) <= 300),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 2048),
  created_at timestamptz not null default now()
);

create index activity_events_project_idx on public.activity_events (project_id, created_at desc);
create index activity_events_entity_idx on public.activity_events (entity_type, entity_id, created_at);

alter table public.activity_events enable row level security;
revoke all on public.activity_events from anon, authenticated;
grant select on public.activity_events to authenticated;

create policy activity_events_select_own on public.activity_events for select to authenticated
  using (exists (select 1 from public.projects p where p.id = activity_events.project_id and p.owner_id = (select auth.uid())));

create function public.activity_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('guardscope.account_deletion', true), '') = 'on' then
    return old;
  end if;
  raise exception 'activity_event_immutable' using errcode = 'P0001';
end;
$$;
revoke execute on function public.activity_events_guard() from public, anon, authenticated;

create trigger activity_events_guard
  before update or delete on public.activity_events
  for each row execute function public.activity_events_guard();

-- Request created -> event
create function public.requests_after_insert_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, summary)
  values (new.project_id, 'freelancer', auth.uid(), 'request.created', 'request', new.id,
          'Request recorded: ' || left(new.title, 200));
  return new;
end;
$$;
revoke execute on function public.requests_after_insert_event() from public, anon, authenticated;

create trigger requests_after_insert_event
  after insert on public.requests
  for each row execute function public.requests_after_insert_event();

-- ---------------------------------------------------------------------------
-- revision_usages (PRD §7.2; DEC-006)
-- ---------------------------------------------------------------------------
create table public.revision_usages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  request_id uuid references public.requests (id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid default auth.uid(),
  recorded_at timestamptz not null default now()
);

create index revision_usages_project_idx on public.revision_usages (project_id, recorded_at);

alter table public.revision_usages enable row level security;
revoke all on public.revision_usages from anon, authenticated;
grant select, delete on public.revision_usages to authenticated;
grant insert (project_id, request_id, note) on public.revision_usages to authenticated;

create policy revision_usages_select_own on public.revision_usages for select to authenticated
  using (exists (select 1 from public.projects p where p.id = revision_usages.project_id and p.owner_id = (select auth.uid())));
create policy revision_usages_insert_own on public.revision_usages for insert to authenticated
  with check (
    exists (select 1 from public.projects p
            where p.id = revision_usages.project_id and p.owner_id = (select auth.uid()) and p.status <> 'archived')
    -- C-3: only once a scope is confirmed
    and exists (select 1 from public.scope_versions v
                where v.project_id = revision_usages.project_id and v.confirmed_at is not null)
    -- BR-4: linked request must belong to the same project
    and (revision_usages.request_id is null
         or exists (select 1 from public.requests r
                    where r.id = revision_usages.request_id and r.project_id = revision_usages.project_id)));
create policy revision_usages_delete_own on public.revision_usages for delete to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = revision_usages.project_id and p.owner_id = (select auth.uid()) and p.status <> 'archived'));

create function public.revision_usages_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('guardscope.account_deletion', true), '') = 'on' then
    return null;  -- project is being removed with the account; don't log into it
  end if;
  if tg_op = 'INSERT' then
    insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, summary, metadata)
    values (new.project_id, 'freelancer', auth.uid(), 'revision.recorded', 'revision_usage', new.id,
            'Revision recorded as used', jsonb_build_object('request_id', new.request_id));
  else
    insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, summary, metadata)
    values (old.project_id, 'freelancer', auth.uid(), 'revision.undone', 'revision_usage', old.id,
            'Recorded revision undone', jsonb_build_object('request_id', old.request_id));
  end if;
  return null;
end;
$$;
revoke execute on function public.revision_usages_event() from public, anon, authenticated;

create trigger revision_usages_event
  after insert or delete on public.revision_usages
  for each row execute function public.revision_usages_event();

-- ---------------------------------------------------------------------------
-- RPC: classify_request (REQ-002/003; BR-2)
-- ---------------------------------------------------------------------------
create function public.classify_request(p_request_id uuid, p_classification text)
returns public.requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests;
  p public.projects;
  v_from text;
  v_label text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_classification is null or p_classification not in ('included', 'additional', 'needs_clarification') then
    raise exception 'invalid_classification' using errcode = 'P0001';
  end if;

  select * into r from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into p from public.projects where id = r.project_id;
  if p.owner_id is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p.status = 'archived' then
    raise exception 'project_archived' using errcode = 'P0001';
  end if;
  if r.classification = p_classification then
    return r;  -- no-op: no duplicate history entry
  end if;

  v_from := r.classification;
  update public.requests set classification = p_classification, updated_at = now()
   where id = r.id returning * into r;

  v_label := case p_classification
               when 'included' then 'Included'
               when 'additional' then 'Additional'
               else 'Needs clarification' end;
  insert into public.activity_events (project_id, actor_type, actor_id, event_type, entity_type, entity_id, summary, metadata)
  values (r.project_id, 'freelancer', auth.uid(), 'request.classified', 'request', r.id,
          'Marked "' || left(r.title, 150) || '" as ' || v_label,
          jsonb_build_object('from', v_from, 'to', p_classification));
  return r;
end;
$$;
revoke execute on function public.classify_request(uuid, text) from public, anon, authenticated;
grant execute on function public.classify_request(uuid, text) to authenticated;
