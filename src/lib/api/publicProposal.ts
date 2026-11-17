import { supabase } from '../supabase';
import { ApiError, toApiError } from './errors';
import type { ClientDecision, UnavailableState } from '../domain/publicLink';
import type { TimeUnit } from '../domain/changeOrder';

export type PublicProposal = {
  project_title: string;
  client_name: string;
  freelancer_name: string | null;
  version_no: number;
  sent_at: string;
  expires_at: string;
  title: string;
  description: string | null;
  price_impact: string | number;
  currency: string;
  time_impact_value: string | number | null;
  time_impact_unit: TimeUnit | null;
  proposed_deadline: string | null;
  assumptions: string | null;
  exclusions: string | null;
  client_terms: string | null;
};

export type RecordedDecision = { decision: ClientDecision; decided_at: string };

export type PublicProposalResult =
  | { state: 'valid'; proposal: PublicProposal }
  | { state: 'decided'; proposal: PublicProposal; decision: RecordedDecision }
  | { state: UnavailableState; freelancer_name?: string | null };

export type SubmitError = UnavailableState | 'decided' | 'validation';
export type SubmitResult =
  | { result: 'recorded' | 'already_recorded'; decision: ClientDecision; decided_at: string }
  | { error: SubmitError };

const states = new Set([
  'valid',
  'decided',
  'invalid',
  'expired',
  'revoked',
  'superseded',
  'cancelled',
  'rate_limited',
]);
const submitErrors = new Set([
  'invalid',
  'expired',
  'revoked',
  'superseded',
  'cancelled',
  'decided',
  'rate_limited',
  'validation',
]);

/**
 * Transport and server failures throw ApiError ('network' / 'unknown' / 'rate_limited'); they are never
 * mapped to a link state, so a flaky connection cannot be mistaken for an invalid link. The token only
 * travels in the POST body of supabase.rpc and is never logged.
 */
export async function getPublicProposal(token: string): Promise<PublicProposalResult> {
  const { data, error } = await supabase.rpc('get_public_proposal', { p_token: token });
  if (error) throw toApiError(error);
  const r = data as { state?: unknown } | null;
  if (!r || typeof r.state !== 'string' || !states.has(r.state)) throw new ApiError('unknown');
  return r as PublicProposalResult;
}

export async function submitPublicDecision(
  token: string,
  decision: ClientDecision,
  comment: string,
  idempotencyKey: string,
): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('submit_public_decision', {
    p_token: token,
    p_decision: decision,
    p_comment: comment.trim() === '' ? null : comment,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw toApiError(error);
  const r = data as { result?: unknown; error?: unknown } | null;
  if (r && (r.result === 'recorded' || r.result === 'already_recorded')) {
    return r as SubmitResult;
  }
  if (r && typeof r.error === 'string' && submitErrors.has(r.error)) return r as SubmitResult;
  throw new ApiError('unknown');
}
