-- D-2 / ISS-015: history order must follow the order in which changes were applied.
--
-- Cause: activity_events.created_at defaulted to now(), the *transaction start* time.
-- classify_request serialises on SELECT ... FOR UPDATE, so a transaction that waited for the lock
-- wrote an earlier timestamp than the one that held it, and readers ordering by created_at showed
-- an order of changes that never happened.
--
-- Fix:
--   * created_at defaults to clock_timestamp(): the time the row is actually inserted (after the lock).
--   * seq: a monotonically increasing identity assigned at insert time. It is the ordering key for
--     readers (clocks can step backwards or tie; a sequence cannot). Clients cannot write it
--     (no insert/update grants on activity_events; GENERATED ALWAYS rejects explicit values).
--
-- All event writers (requests_after_insert_event, revision_usages_event, classify_request) rely on
-- column defaults, so they need no change.

alter table public.activity_events alter column created_at set default clock_timestamp();

-- Backfill existing rows in their best-known order (created_at, then id for a stable tie-break).
-- The append-only guard would reject (or, under the deletion flag, silently skip) these updates,
-- so it is disabled for this backfill only, inside this migration's transaction.
alter table public.activity_events add column seq bigint;
alter table public.activity_events disable trigger activity_events_guard;
update public.activity_events e
   set seq = o.rn
  from (select id, row_number() over (order by created_at, id) as rn from public.activity_events) o
 where o.id = e.id;
alter table public.activity_events enable trigger activity_events_guard;

alter table public.activity_events alter column seq set not null;
alter table public.activity_events alter column seq add generated always as identity;
select setval(pg_get_serial_sequence('public.activity_events', 'seq'),
              coalesce((select max(seq) from public.activity_events), 0) + 1, false);

create unique index activity_events_seq_key on public.activity_events (seq);

-- Readers order by seq.
drop index public.activity_events_entity_idx;
create index activity_events_entity_idx on public.activity_events (entity_type, entity_id, seq);
drop index public.activity_events_project_idx;
create index activity_events_project_idx on public.activity_events (project_id, seq desc);
