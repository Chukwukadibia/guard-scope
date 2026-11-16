import { supabase } from '../supabase';
import { toApiError } from './errors';
import { assertProjectId } from './projects';

export type ScopeItemKind = 'deliverable' | 'exclusion' | 'assumption';
export type RevisionAllowanceType = 'none' | 'number' | 'not_specified';

export type ScopeItem = {
  id: string;
  scope_version_id: string;
  kind: ScopeItemKind;
  description: string;
  sort_order: number;
};

export type ScopeVersion = {
  id: string;
  project_id: string;
  version_no: number;
  summary: string | null;
  revision_allowance_type: RevisionAllowanceType;
  revision_allowance_count: number | null;
  notes: string | null;
  agreed_price: string | null;
  currency: string | null;
  deadline: string | null;
  confirmed_at: string | null;
  is_original_baseline: boolean;
  created_at: string;
  updated_at: string;
  scope_items: ScopeItem[];
};

const columns =
  'id, project_id, version_no, summary, revision_allowance_type, revision_allowance_count, notes, agreed_price, currency, deadline, confirmed_at, is_original_baseline, created_at, updated_at, scope_items(id, scope_version_id, kind, description, sort_order)';

export type ProjectScope = {
  baseline: ScopeVersion | null;
  /** Latest confirmed version (may equal the baseline). */
  current: ScopeVersion | null;
  draft: ScopeVersion | null;
  versions: ScopeVersion[];
};

function sortItems(v: ScopeVersion): ScopeVersion {
  return {
    ...v,
    scope_items: [...v.scope_items].sort(
      (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
    ),
  };
}

export async function getProjectScope(projectId: string): Promise<ProjectScope> {
  assertProjectId(projectId);
  const { data, error } = await supabase
    .from('scope_versions')
    .select(columns)
    .eq('project_id', projectId)
    .order('version_no', { ascending: true });
  if (error) throw toApiError(error);
  const versions = ((data ?? []) as ScopeVersion[]).map(sortItems);
  const confirmed = versions.filter((v) => v.confirmed_at);
  return {
    versions,
    baseline: versions.find((v) => v.is_original_baseline) ?? null,
    current: confirmed.at(-1) ?? null,
    draft: versions.find((v) => !v.confirmed_at) ?? null,
  };
}

export async function updateDraft(
  versionId: string,
  input: Partial<
    Pick<ScopeVersion, 'summary' | 'revision_allowance_type' | 'revision_allowance_count' | 'notes'>
  >,
): Promise<void> {
  const { data, error } = await supabase
    .from('scope_versions')
    .update(input)
    .eq('id', versionId)
    .select('id');
  if (error) throw toApiError(error);
  if (!data || data.length === 0)
    throw toApiError({ code: 'P0001', message: 'scope_version_immutable' });
}

export async function addScopeItem(
  versionId: string,
  kind: ScopeItemKind,
  description: string,
  sortOrder: number,
): Promise<ScopeItem> {
  const { data, error } = await supabase
    .from('scope_items')
    .insert({ scope_version_id: versionId, kind, description, sort_order: sortOrder })
    .select('id, scope_version_id, kind, description, sort_order')
    .single();
  if (error) throw toApiError(error);
  return data as ScopeItem;
}

export async function updateScopeItem(
  id: string,
  input: { description?: string; sort_order?: number },
): Promise<void> {
  const { data, error } = await supabase
    .from('scope_items')
    .update(input)
    .eq('id', id)
    .select('id');
  if (error) throw toApiError(error);
  if (!data || data.length === 0)
    throw toApiError({ code: 'P0001', message: 'scope_version_immutable' });
}

export async function deleteScopeItem(id: string): Promise<void> {
  const { data, error } = await supabase.from('scope_items').delete().eq('id', id).select('id');
  if (error) throw toApiError(error);
  if (!data || data.length === 0)
    throw toApiError({ code: 'P0001', message: 'scope_version_immutable' });
}

export async function confirmScope(versionId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_scope', { p_version_id: versionId });
  if (error) throw toApiError(error);
}
