import { supabase } from '../supabase';
import { toApiError } from './errors';
import { assertProjectId } from './projects';
import type { ProposalStatus, TimeUnit } from '../domain/changeOrder';
import type { ClientDecision } from '../domain/publicLink';

export type ProposalVersion = {
  id: string;
  change_order_id: string;
  version_no: number;
  title: string;
  description: string;
  price_impact: string | number; // PostgREST returns numeric as a JSON number
  currency: string;
  time_impact_value: string | number | null;
  time_impact_unit: TimeUnit | null;
  proposed_deadline: string | null;
  assumptions: string | null;
  exclusions: string | null;
  client_terms: string | null;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  status_changed_at: string;
};

export type ChangeOrder = {
  id: string;
  project_id: string;
  request_id: string;
  created_at: string;
  request: { id: string; title: string } | null;
  versions: ProposalVersion[]; // ascending by version_no
};

export type ProposalInput = {
  title: string;
  description: string;
  price_impact: string;
  currency: string;
  time_impact_value: string | null;
  time_impact_unit: TimeUnit | null;
  proposed_deadline: string | null;
  assumptions: string | null;
  exclusions: string | null;
  client_terms: string | null;
};

const versionColumns =
  'id, change_order_id, version_no, title, description, price_impact, currency, time_impact_value, time_impact_unit, proposed_deadline, assumptions, exclusions, client_terms, status, created_at, updated_at, sent_at, status_changed_at';
const columns = `id, project_id, request_id, created_at, request:requests(id, title), versions:change_order_versions(${versionColumns})`;

function normalise(row: unknown): ChangeOrder {
  const co = row as ChangeOrder;
  return { ...co, versions: [...(co.versions ?? [])].sort((a, b) => a.version_no - b.version_no) };
}

export const latestVersion = (co: ChangeOrder): ProposalVersion | undefined => co.versions.at(-1);

export async function listChangeOrders(projectId: string): Promise<ChangeOrder[]> {
  assertProjectId(projectId);
  const { data, error } = await supabase
    .from('change_orders')
    .select(columns)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw toApiError(error);
  return (data ?? []).map(normalise);
}

export async function getChangeOrder(
  projectId: string,
  changeOrderId: string,
): Promise<ChangeOrder> {
  assertProjectId(projectId);
  assertProjectId(changeOrderId);
  const { data, error } = await supabase
    .from('change_orders')
    .select(columns)
    .eq('id', changeOrderId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw toApiError(error);
  if (!data) throw toApiError({ code: 'PGRST116' });
  return normalise(data);
}

export async function findChangeOrderForRequest(
  requestId: string,
): Promise<{ id: string; versions: { version_no: number; status: ProposalStatus }[] } | null> {
  assertProjectId(requestId);
  const { data, error } = await supabase
    .from('change_orders')
    .select('id, versions:change_order_versions(version_no, status)')
    .eq('request_id', requestId)
    .maybeSingle();
  if (error) throw toApiError(error);
  if (!data) return null;
  const versions = [
    ...((data as { versions: { version_no: number; status: ProposalStatus }[] }).versions ?? []),
  ].sort((a, b) => a.version_no - b.version_no);
  return { id: (data as { id: string }).id, versions };
}

export async function createChangeOrder(requestId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_change_order', { p_request_id: requestId });
  if (error) throw toApiError(error);
  return data as string;
}

export async function saveProposalDraft(
  versionId: string,
  input: ProposalInput,
): Promise<ProposalVersion> {
  const { data, error } = await supabase
    .from('change_order_versions')
    .update(input)
    .eq('id', versionId)
    .select(versionColumns)
    .maybeSingle();
  if (error) throw toApiError(error);
  if (!data) throw toApiError({ code: 'P0001', message: 'not_draft' });
  return data as ProposalVersion;
}

export async function sendProposalVersion(versionId: string): Promise<void> {
  const { error } = await supabase.rpc('send_change_order_version', { p_version_id: versionId });
  if (error) throw toApiError(error);
}

export async function cancelProposalVersion(versionId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_change_order_version', { p_version_id: versionId });
  if (error) throw toApiError(error);
}

export async function newProposalVersion(changeOrderId: string): Promise<string> {
  const { data, error } = await supabase.rpc('new_change_order_version', {
    p_change_order_id: changeOrderId,
  });
  if (error) throw toApiError(error);
  return data as string;
}

/** Returns true if the whole (never-sent) proposal was removed. */
export async function discardProposalDraft(versionId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('discard_change_order_draft', {
    p_version_id: versionId,
  });
  if (error) throw toApiError(error);
  return Boolean(data);
}

export type ApprovalLink = {
  id: string;
  version_id: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type ClientDecisionRow = {
  id: string;
  version_id: string;
  decision: ClientDecision;
  comment: string | null;
  decided_at: string;
};

/** The raw token is returned once by the database and is not retrievable afterwards. */
export async function issueApprovalLink(
  versionId: string,
): Promise<{ token: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc('issue_approval_link', { p_version_id: versionId });
  if (error) throw toApiError(error);
  const r = data as { token?: unknown; expires_at?: unknown } | null;
  if (!r || typeof r.token !== 'string' || typeof r.expires_at !== 'string') throw toApiError({});
  return { token: r.token, expiresAt: r.expires_at };
}

export async function revokeApprovalLink(versionId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('revoke_approval_link', { p_version_id: versionId });
  if (error) throw toApiError(error);
  return Boolean(data);
}

/** Never selects token_hash (column grants forbid it). */
export async function listApprovalLinks(versionIds: string[]): Promise<ApprovalLink[]> {
  if (versionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('approval_links')
    .select('id, version_id, expires_at, revoked_at, created_at')
    .in('version_id', versionIds)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw toApiError(error);
  return (data ?? []) as ApprovalLink[];
}

export async function listClientDecisions(versionIds: string[]): Promise<ClientDecisionRow[]> {
  if (versionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('client_decisions')
    .select('id, version_id, decision, comment, decided_at')
    .in('version_id', versionIds)
    .limit(500);
  if (error) throw toApiError(error);
  return (data ?? []) as ClientDecisionRow[];
}
