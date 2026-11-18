-- Forward fix for 20261117100000_client_approval (Tester chunk A findings F-1, F-2, F-3).
-- F-1: a draft revision must not supersede a pending version: max version_no counts only sent (non-draft) versions.
-- F-3: a pending, not-latest version reports 'superseded' before 'revoked'/'expired' (BR-2).
-- F-2: comments of only tabs/newlines/other whitespace normalise to null (whitespace-class trim).

create or replace function public._link_state(p_status text, p_revoked timestamptz, p_expires timestamptz, p_version_no int, p_max_no int)
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
    when p_version_no <> p_max_no then 'superseded'
    when p_revoked is not null then 'revoked'
    when p_expires <= now() then 'expired'
    else 'valid'
  end
$$;
revoke execute on function public._link_state(text, timestamptz, timestamptz, int, int) from public, anon, authenticated;

create or replace function public.get_public_proposal(p_token text)
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
         (select max(x.version_no) from public.change_order_versions x where x.change_order_id = v.change_order_id and x.status <> 'draft') as max_no,
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
