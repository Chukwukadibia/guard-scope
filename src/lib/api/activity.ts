import { supabase } from '../supabase';
import { toApiError } from './errors';

export type ActivityEvent = {
  id: string;
  /** Server-assigned insert order; the history's ordering key (ISS-015). */
  seq: number;
  event_type: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  metadata: Record<string, unknown>;
  actor_type: 'freelancer' | 'client' | 'system';
  created_at: string;
};

/**
 * Append-only history for one entity (REQ-003), oldest first. Read-only for clients.
 * Ordered by `seq` (assigned at insert, after the row lock), not `created_at` alone (ISS-015).
 */
export async function listEntityEvents(
  entityType: string,
  entityId: string,
): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from('activity_events')
    .select(
      'id, seq, event_type, entity_type, entity_id, summary, metadata, actor_type, created_at',
    )
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('seq', { ascending: true })
    .limit(200);
  if (error) throw toApiError(error);
  return (data ?? []) as ActivityEvent[];
}
