import { supabase } from '../supabase';
import { ApiError, toApiError } from './errors';

export type ProjectStatus = 'active' | 'completed' | 'archived';

export type Project = {
  id: string;
  title: string;
  client_name: string;
  client_contact: string | null;
  description: string | null;
  agreed_price: string | null; // numeric as string (exact)
  currency: string;
  start_date: string | null;
  deadline: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ProjectInput = {
  title: string;
  client_name: string;
  client_contact: string | null;
  description: string | null;
  agreed_price: string | null;
  currency: string;
  start_date: string | null;
  deadline: string | null;
};

const columns =
  'id, title, client_name, client_contact, description, agreed_price, currency, start_date, deadline, status, created_at, updated_at, archived_at';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids come from the URL. A malformed id would make PostgREST answer 22P02 (invalid uuid), so it is
 * rejected here as "not found", the same as a missing or someone else's project (§6, no leak).
 */
export function assertProjectId(id: string): void {
  if (!uuidPattern.test(id)) throw new ApiError('not_found');
}

export async function listProjects(statuses: ProjectStatus[]): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(columns)
    .in('status', statuses)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw toApiError(error);
  return (data ?? []) as Project[];
}

export async function countActiveProjects(): Promise<number> {
  const { count, error } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  if (error) throw toApiError(error);
  return count ?? 0;
}

export async function getProject(id: string): Promise<Project> {
  assertProjectId(id);
  const { data, error } = await supabase
    .from('projects')
    .select(columns)
    .eq('id', id)
    .maybeSingle();
  if (error) throw toApiError(error);
  if (!data) throw toApiError({ code: 'PGRST116' });
  return data as Project;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const { data, error } = await supabase.from('projects').insert(input).select(columns).single();
  if (error) throw toApiError(error);
  return data as Project;
}

export async function updateProject(
  id: string,
  input: Partial<ProjectInput> & { status?: ProjectStatus },
): Promise<Project> {
  assertProjectId(id);
  const { data, error } = await supabase
    .from('projects')
    .update(input)
    .eq('id', id)
    .select(columns)
    .maybeSingle();
  if (error) throw toApiError(error);
  if (!data) throw toApiError({ code: 'PGRST116' });
  return data as Project;
}
