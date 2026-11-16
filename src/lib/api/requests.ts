import { supabase } from '../supabase';
import { toApiError } from './errors';
import { assertProjectId } from './projects';
import type { Classification, SourceChannel } from '../domain/request';

export type ClientRequest = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  source_channel: SourceChannel | null;
  received_on: string;
  classification: Classification;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RequestInput = {
  title: string;
  description: string | null;
  source_channel: SourceChannel | null;
  received_on: string;
  internal_notes: string | null;
};

const columns =
  'id, project_id, title, description, source_channel, received_on, classification, internal_notes, created_at, updated_at';

/** List rows never carry private notes (data minimisation, AC-5); the detail view loads them. */
export type RequestListItem = Omit<ClientRequest, 'internal_notes'>;
const listColumns =
  'id, project_id, title, description, source_channel, received_on, classification, created_at, updated_at';

export async function listRequests(projectId: string): Promise<RequestListItem[]> {
  assertProjectId(projectId);
  const { data, error } = await supabase
    .from('requests')
    .select(listColumns)
    .eq('project_id', projectId)
    .order('received_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw toApiError(error);
  return (data ?? []) as RequestListItem[];
}

export async function getRequest(projectId: string, requestId: string): Promise<ClientRequest> {
  assertProjectId(projectId);
  assertProjectId(requestId);
  const { data, error } = await supabase
    .from('requests')
    .select(columns)
    .eq('id', requestId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw toApiError(error);
  if (!data) throw toApiError({ code: 'PGRST116' });
  return data as ClientRequest;
}

export async function createRequest(
  projectId: string,
  input: RequestInput,
): Promise<ClientRequest> {
  assertProjectId(projectId);
  const { data, error } = await supabase
    .from('requests')
    .insert({ project_id: projectId, ...input })
    .select(columns)
    .single();
  if (error) throw toApiError(error);
  return data as ClientRequest;
}

export async function updateRequest(
  requestId: string,
  input: RequestInput,
): Promise<ClientRequest> {
  assertProjectId(requestId);
  const { data, error } = await supabase
    .from('requests')
    .update(input)
    .eq('id', requestId)
    .select(columns)
    .maybeSingle();
  if (error) throw toApiError(error);
  if (!data) throw toApiError({ code: 'P0001', message: 'project_archived' });
  return data as ClientRequest;
}

export async function classifyRequest(
  requestId: string,
  classification: Exclude<Classification, 'unclassified'>,
) {
  const { data, error } = await supabase.rpc('classify_request', {
    p_request_id: requestId,
    p_classification: classification,
  });
  if (error) throw toApiError(error);
  return data as ClientRequest;
}
