-- Phase 2 (projects & original scope). ARCHITECTURE.md §3.1, §3.2, §4.1, §5.1. Approved: HA-004.

-- ---------------------------------------------------------------------------
-- Helper: transaction-local bypass used ONLY by delete_my_account() (ARCHITECTURE §3.2)
-- ---------------------------------------------------------------------------
create function public.is_account_deletion()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('guardscope.account_deletion', true), '') = 'on' $$;

revoke execute on function public.is_account_deletion() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200 and char_length(title) <= 200),
  client_name text not null check (char_length(btrim(client_name)) between 1 and 200 and char_length(client_name) <= 200),
  client_contact text check (client_contact is null or char_length(client_contact) <= 320),
  description text check (description is null or char_length(description) <= 5000),
  agreed_price numeric(14, 2) check (agreed_price is null or agreed_price >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  start_date date,
  deadline date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint projects_deadline_after_start check (deadline is null or start_date is null or deadline >= start_date)
);

create index projects_owner_status_idx on public.projects (owner_id, status);

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select on public.projects to authenticated;
grant insert (title, client_name, client_contact, description, agreed_price, currency, start_date, deadline)
  on public.projects to authenticated;
grant update (title, client_name, client_contact, description, agreed_price, currency, start_date, deadline, status)
  on public.projects to authenticated;

create policy projects_select_own on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy projects_insert_own on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy projects_update_own on public.projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create function public.projects_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status = 'archived' and old.status <> 'archived' then
      new.archived_at := now();
    elsif new.status <> 'archived' then
      new.archived_at := null;
    end if;
  else
    new.archived_at := case when new.status = 'archived' then now() else null end;
  end if;
  return new;
end;
$$;
revoke execute on function public.projects_before_write() from public, anon, authenticated;

create trigger projects_before_write
  before insert or update on public.projects
  for each row execute function public.projects_before_write();

-- ---------------------------------------------------------------------------
-- scope_versions
-- ---------------------------------------------------------------------------
create table public.scope_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version_no int not null check (version_no > 0),
  summary text check (summary is null or char_length(summary) <= 5000),
  revision_allowance_type text not null default 'not_specified'
    check (revision_allowance_type in ('none', 'number', 'not_specified')),
  revision_allowance_count int check (revision_allowance_count is null or revision_allowance_count >= 0),
  notes text check (notes is null or char_length(notes) <= 5000),
  -- commercial terms snapshotted from the project at confirmation (SCOPE-003/004)
  agreed_price numeric(14, 2) check (agreed_price is null or agreed_price >= 0),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  deadline date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  is_original_baseline boolean not null default false,
  constraint scope_versions_project_version_uq unique (project_id, version_no),
  constraint scope_versions_allowance_count check ((revision_allowance_type = 'number') = (revision_allowance_count is not null)),
  constraint scope_versions_baseline_confirmed check (not is_original_baseline or confirmed_at is not null),
  constraint scope_versions_confirmed_currency check (confirmed_at is null or currency is not null)
);

create unique index scope_versions_one_baseline_uq on public.scope_versions (project_id) where is_original_baseline;
create unique index scope_versions_one_draft_uq on public.scope_versions (project_id) where confirmed_at is null;

alter table public.scope_versions enable row level security;
revoke all on public.scope_versions from anon, authenticated;
grant select on public.scope_versions to authenticated;
grant update (summary, revision_allowance_type, revision_allowance_count, notes) on public.scope_versions to authenticated;

create policy scope_versions_select_own on public.scope_versions for select to authenticated
  using (exists (select 1 from public.projects p where p.id = scope_versions.project_id and p.owner_id = (select auth.uid())));
create policy scope_versions_update_draft_own on public.scope_versions for update to authenticated
  using (
    confirmed_at is null
    and exists (select 1 from public.projects p
                where p.id = scope_versions.project_id and p.owner_id = (select auth.uid()) and p.status <> 'archived'))
  with check (
    confirmed_at is null
    and exists (select 1 from public.projects p
                where p.id = scope_versions.project_id and p.owner_id = (select auth.uid()) and p.status <> 'archived'));

-- Immutability of confirmed versions (defence in depth; applies to every role, incl. definer functions)
create function public.scope_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_account_deletion() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.confirmed_at is not null then
    raise exception 'scope_version_immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;
revoke execute on function public.scope_versions_guard() from public, anon, authenticated;

create trigger scope_versions_guard
  before update or delete on public.scope_versions
  for each row execute function public.scope_versions_guard();

-- Every new project gets an empty draft (BR-2)
create function public.create_initial_scope_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.scope_versions (project_id, version_no, created_by)
  values (new.id, 1, new.owner_id);
  return new;
end;
$$;
revoke execute on function public.create_initial_scope_draft() from public, anon, authenticated;

create trigger projects_create_initial_scope_draft
  after insert on public.projects
  for each row execute function public.create_initial_scope_draft();

-- ---------------------------------------------------------------------------
-- scope_items
-- ---------------------------------------------------------------------------
create table public.scope_items (
  id uuid primary key default gen_random_uuid(),
  scope_version_id uuid not null references public.scope_versions (id) on delete cascade,
  kind text not null check (kind in ('deliverable', 'exclusion', 'assumption')),
  description text not null check (char_length(btrim(description)) between 1 and 1000 and char_length(description) <= 1000),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index scope_items_version_idx on public.scope_items (scope_version_id, kind, sort_order);

alter table public.scope_items enable row level security;
revoke all on public.scope_items from anon, authenticated;
grant select, delete on public.scope_items to authenticated;
grant insert (scope_version_id, kind, description, sort_order) on public.scope_items to authenticated;
grant update (description, sort_order) on public.scope_items to authenticated;

create policy scope_items_select_own on public.scope_items for select to authenticated
  using (exists (
    select 1 from public.scope_versions v join public.projects p on p.id = v.project_id
    where v.id = scope_items.scope_version_id and p.owner_id = (select auth.uid())));

create policy scope_items_write_draft_own on public.scope_items for all to authenticated
  using (exists (
    select 1 from public.scope_versions v join public.projects p on p.id = v.project_id
    where v.id = scope_items.scope_version_id and v.confirmed_at is null
      and p.owner_id = (select auth.uid()) and p.status <> 'archived'))
  with check (exists (
    select 1 from public.scope_versions v join public.projects p on p.id = v.project_id
    where v.id = scope_items.scope_version_id and v.confirmed_at is null
      and p.owner_id = (select auth.uid()) and p.status <> 'archived'));

create function public.scope_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.scope_version_id else new.scope_version_id end;
begin
  if public.is_account_deletion() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.scope_versions v where v.id = v_id and v.confirmed_at is not null)
     or (tg_op = 'UPDATE' and exists (select 1 from public.scope_versions v
                                      where v.id = old.scope_version_id and v.confirmed_at is not null)) then
    raise exception 'scope_version_immutable' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.scope_items_guard() from public, anon, authenticated;

create trigger scope_items_guard
  before insert or update or delete on public.scope_items
  for each row execute function public.scope_items_guard();

-- ---------------------------------------------------------------------------
-- RPC: confirm_scope (SCOPE-003/004/005)
-- ---------------------------------------------------------------------------
create function public.confirm_scope(p_version_id uuid)
returns public.scope_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.scope_versions;
  p public.projects;
  v_has_baseline boolean;
  v_next_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v from public.scope_versions where id = p_version_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select * into p from public.projects where id = v.project_id for update;
  if p.owner_id is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0001';   -- no existence leak
  end if;
  if v.confirmed_at is not null then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;
  if p.status = 'archived' then
    raise exception 'project_archived' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.scope_items i where i.scope_version_id = v.id and i.kind = 'deliverable') then
    raise exception 'empty_scope' using errcode = 'P0001';
  end if;

  select exists (select 1 from public.scope_versions where project_id = p.id and is_original_baseline)
    into v_has_baseline;

  update public.scope_versions
     set confirmed_at = now(),
         is_original_baseline = not v_has_baseline,
         agreed_price = p.agreed_price,
         currency = p.currency,
         deadline = p.deadline
   where id = v.id
  returning * into v;

  insert into public.scope_versions (project_id, version_no, summary, revision_allowance_type,
                                     revision_allowance_count, notes, created_by)
  values (p.id, v.version_no + 1, v.summary, v.revision_allowance_type,
          v.revision_allowance_count, v.notes, auth.uid())
  returning id into v_next_id;

  insert into public.scope_items (scope_version_id, kind, description, sort_order)
  select v_next_id, i.kind, i.description, i.sort_order
    from public.scope_items i where i.scope_version_id = v.id;

  return v;
end;
$$;
revoke execute on function public.confirm_scope(uuid) from public, anon, authenticated;
grant execute on function public.confirm_scope(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: delete_my_account (AUTH-004; OD-10 as applied in HA-004)
-- ---------------------------------------------------------------------------
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  perform set_config('guardscope.account_deletion', 'on', true);  -- transaction-local
  -- Cascades: auth.users -> profiles -> projects -> scope_versions -> scope_items (and auth sessions/identities)
  delete from auth.users where id = v_uid;
  perform set_config('guardscope.account_deletion', 'off', true);
end;
$$;
revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
