-- Forward fix for 20261116130000: the guard triggers run as the invoking role, which (correctly) has no
-- EXECUTE on internal helpers. Inline the transaction-local flag check and drop the helper.

create or replace function public.scope_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('guardscope.account_deletion', true), '') = 'on' then
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

create or replace function public.scope_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.scope_version_id else new.scope_version_id end;
begin
  if coalesce(current_setting('guardscope.account_deletion', true), '') = 'on' then
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

drop function public.is_account_deletion();
