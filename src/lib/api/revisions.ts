import { supabase } from '../supabase';
import { toApiError } from './errors';
import { assertProjectId } from './projects';

export type RevisionUsage = {
  id: string;
  project_id: string;
  request_id: string | null;
  note: string | null;
  recorded_at: string;
};

const columns = 'id, project_id, request_id, note, recorded_at';

export async function listRevisionUsages(projectId: string): Promise<RevisionUsage[]> {
  assertProjectId(projectId);
  const { data, error } = await supabase
    .from('revision_usages')
    .select(columns)
    .eq('project_id', projectId)
    .order('recorded_at', { ascending: true });
  if (error) throw toApiError(error);
  return (data ?? []) as RevisionUsage[];
}

export async function recordRevisionUsage(
  projectId: string,
  requestId: string | null,
  note: string | null,
) {
  assertProjectId(projectId);
  const { error } = await supabase
    .from('revision_usages')
    .insert({ project_id: projectId, request_id: requestId, note });
  if (error) throw toApiError(error);
}

export async function undoRevisionUsage(id: string) {
  const { data, error } = await supabase.from('revision_usages').delete().eq('id', id).select('id');
  if (error) throw toApiError(error);
  if (!data || data.length === 0) throw toApiError({ code: 'P0001', message: 'project_archived' });
}
