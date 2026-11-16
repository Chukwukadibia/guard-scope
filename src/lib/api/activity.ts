import { supabase } from '../supabase';
import { toApiError } from './errors';

export type ActivityEvent = {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  metadata: Record<string, unknown>;
  actor_type: 'freelancer' | 'client' | 'system';
  created_at: string;
};

/** Append-only history for one entity (REQ-003). Read-only for clients. */
export async function listEntityEvents(
  entityType: string,
  entityId: string,
): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from('activity_events')
    .select('id, event_type, entity_type, entity_id, summary, metadata, actor_type, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw toApiError(error);
  return (data ?? []) as ActivityEvent[];
}
