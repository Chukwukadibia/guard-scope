-- SEC-5-1 follow-up: bounded rows AND no unlimited source.
-- Migration 103000 stopped creating per-source rows once the global breaker (1000) opened, which also removed the
-- per-source cap for fresh sources. New design, tunables in _throttle_limits():
--   global failures < breaker (1000):   per-source rows as originally: 20 per source per window, then blocked.
--   breaker <= global < hard cap (5000): rows still recorded; sources that already failed are held back (original design).
--   global >= hard cap:                  no new per-source rows; _throttle_blocked is true for EVERY source until the
--                                        window ends, so the miss path is fully closed and rows stay near the cap per window.
-- Availability trade-off (lockdown): at the hard cap even a source with a valid token gets rate_limited for the rest of
-- the window (max 10 minutes), because the block is checked before the token lookup. See SEC-5-2 (pending decision on lookup order).

drop function public._throttle_limits();
create function public._throttle_limits(out per_source int, out global_limit int, out win interval, out hard_cap int)
language sql
immutable
set search_path = ''
as $$ select 20, 1000, interval '10 minutes', 5000 $$;
revoke execute on function public._throttle_limits() from public, anon, authenticated;

create or replace function public._throttle_blocked(p_key bytea)
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
  select failures into g from public.public_link_attempts where source_key = '\x00'::bytea and window_start = w;
  if coalesce(g, 0) >= lim.hard_cap then
    return true;
  end if;
  select failures into f from public.public_link_attempts where source_key = p_key and window_start = w;
  if coalesce(f, 0) >= lim.per_source then
    return true;
  end if;
  return coalesce(g, 0) >= lim.global_limit and coalesce(f, 0) >= 1;
end;
$$;
revoke execute on function public._throttle_blocked(bytea) from public, anon, authenticated;

create or replace function public._throttle_record_failure(p_key bytea)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lim record;
  w timestamptz;
  g int;
begin
  select * into lim from public._throttle_limits();
  w := date_bin(lim.win, now(), timestamptz '2000-01-01');
  select failures into g from public.public_link_attempts where source_key = '\x00'::bytea and window_start = w;
  if coalesce(g, 0) >= lim.hard_cap then
    -- Lockdown: count globally only, never create rows.
    update public.public_link_attempts set failures = failures + 1 where source_key = '\x00'::bytea and window_start = w;
  else
    insert into public.public_link_attempts (source_key, window_start, failures)
    values (p_key, w, 1), ('\x00'::bytea, w, 1)
    on conflict (source_key, window_start) do update set failures = public.public_link_attempts.failures + 1;
  end if;
  -- Deterministic, bounded cleanup via the window_start index; can never fail the failure record.
  begin
    delete from public.public_link_attempts
     where ctid in (select ctid from public.public_link_attempts
                     where window_start < now() - interval '1 day'
                     order by window_start limit 50);
  exception when others then
    null;
  end;
end;
$$;
revoke execute on function public._throttle_record_failure(bytea) from public, anon, authenticated;
