-- SEC-5-1 / SEC-5-8 hardening (independent security review, phase 5).
-- SEC-5-1: throttle keyed on the IPv6 /64, supporting index, bounded deterministic cleanup, no new per-source
--          rows once the global breaker is open.
-- SEC-5-8: raw-length check on the client comment before the trim regex.

create index public_link_attempts_window_start_idx on public.public_link_attempts (window_start);

-- Source key: cf-connecting-ip else the LAST x-forwarded-for entry. IPv4 keeps the full address; IPv6 collapses to
-- its /64 prefix; IPv4-mapped IPv6 (::ffff:a.b.c.d) is treated as that IPv4 address. Anything that is not a valid
-- address falls back to the trimmed raw text (as before). Never raises.
create or replace function public._throttle_key()
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
  ip inet;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then
    h := null;
  end;
  begin
    cf := nullif(btrim(coalesce(h ->> 'cf-connecting-ip', '')), '');
    parts := string_to_array(coalesce(h ->> 'x-forwarded-for', ''), ',');
    src := coalesce(cf, nullif(btrim(parts[array_length(parts, 1)]), ''), 'unknown');
  exception when others then
    src := 'unknown';
  end;
  begin
    ip := left(src, 100)::inet;
    if family(ip) = 6 then
      if ip << inet '::ffff:0.0.0.0/96' then
        src := host(inet '0.0.0.0' + (host(ip)::inet - inet '::ffff:0.0.0.0'));
      else
        src := text(network(set_masklen(ip, 64)));
      end if;
    else
      src := host(ip);
    end if;
  exception when others then
    null; -- not an address: keep the raw text
  end;
  return extensions.digest((select salt from public.public_link_config) || convert_to(left(src, 100), 'utf8'), 'sha256');
end;
$$;
revoke execute on function public._throttle_key() from public, anon, authenticated;

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
  if coalesce(g, 0) >= lim.global_limit then
    -- Breaker open: count in the global row; only sources that already have a row this window are counted
    -- individually. No new per-source rows, so growth is bounded under attack.
    update public.public_link_attempts set failures = failures + 1
     where window_start = w and source_key in (p_key, '\x00'::bytea);
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

create or replace function public.submit_public_decision(p_token text, p_decision text, p_comment text, p_idempotency_key uuid)
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

  -- SEC-5-8: cheap raw-length bound BEFORE the whitespace-trim regex, so the work per call is bounded.
  -- 8000 raw characters is generous (the real rule is 2000 characters after trimming).
  if p_comment is not null and char_length(p_comment) > 8000 then
    return jsonb_build_object('error', 'validation');
  end if;

  v_comment := nullif(regexp_replace(coalesce(p_comment, ''), '^\s+|\s+$', '', 'g'), '');
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
  select max(version_no) into mx from public.change_order_versions where change_order_id = co.id and status <> 'draft';

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
