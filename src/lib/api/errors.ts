/** Stable, UI-safe error codes (ARCHITECTURE.md §4.1, §5.4). Raw backend messages are never shown. */
export type ApiErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'rate_limited'
  | 'not_authenticated'
  | 'validation'
  | 'not_found'
  | 'already_confirmed'
  | 'empty_scope'
  | 'project_archived'
  | 'scope_locked'
  | 'invalid_classification'
  | 'request_not_additional'
  | 'change_order_exists'
  | 'project_not_active'
  | 'not_draft'
  | 'not_pending'
  | 'draft_exists'
  | 'missing_content'
  | 'invalid_impact'
  | 'invalid_time_impact'
  | 'deadline_in_past'
  | 'proposal_locked'
  | 'network'
  | 'unknown';

export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode) {
    super(code);
    this.name = 'ApiError';
  }
}

type BackendError = {
  code?: string;
  error_code?: string;
  status?: number;
  name?: string;
  message?: string;
};

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return new ApiError('network');
  const e = (err ?? {}) as BackendError;
  const code = e.code ?? e.error_code ?? '';
  if (e.name === 'AuthRetryableFetchError' || err instanceof TypeError)
    return new ApiError('network');
  if (code === 'invalid_credentials') return new ApiError('invalid_credentials');
  if (code === 'email_not_confirmed') return new ApiError('email_not_confirmed');
  if (code === 'weak_password') return new ApiError('weak_password');
  if (code.startsWith('over_') || e.status === 429) return new ApiError('rate_limited');
  if (code === 'session_not_found' || code === 'PGRST301' || e.status === 401) {
    return new ApiError('not_authenticated');
  }
  // Database functions/triggers raise P0001 with a stable code as the whole message
  // (supabase/migrations/*_projects_scope.sql). Anything else under P0001 stays 'unknown'.
  if (code === 'P0001') {
    return new ApiError(p0001Codes.get((e.message ?? '').trim()) ?? 'unknown');
  }
  // PGRST116: .single() matched no rows. 42501: RLS / permission denied. Both are shown as
  // "not found" so a resource owned by someone else is indistinguishable from a missing one.
  if (code === 'PGRST116' || code === '42501') return new ApiError('not_found');
  if (code === '23514' || code === '22001' || code === '23502' || code === 'validation_failed')
    return new ApiError('validation');
  return new ApiError('unknown');
}

const p0001Codes = new Map<string, ApiErrorCode>([
  ['not_found', 'not_found'],
  ['already_confirmed', 'already_confirmed'],
  ['empty_scope', 'empty_scope'],
  ['project_archived', 'project_archived'],
  ['scope_version_immutable', 'scope_locked'],
  ['not_authenticated', 'not_authenticated'],
  ['invalid_classification', 'invalid_classification'],
  ['request_not_additional', 'request_not_additional'],
  ['change_order_exists', 'change_order_exists'],
  ['project_not_active', 'project_not_active'],
  ['not_draft', 'not_draft'],
  ['not_pending', 'not_pending'],
  ['draft_exists', 'draft_exists'],
  ['missing_content', 'missing_content'],
  ['invalid_impact', 'invalid_impact'],
  ['invalid_time_impact', 'invalid_time_impact'],
  ['deadline_in_past', 'deadline_in_past'],
  ['change_order_version_immutable', 'proposal_locked'],
  ['invalid_transition', 'proposal_locked'],
]);

export const errorMessages: Record<ApiErrorCode, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Check your email to confirm your account, then sign in.',
  weak_password: 'Choose a stronger password (at least 8 characters).',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  not_authenticated: 'Your session has ended. Please sign in again.',
  validation: 'Some details are not valid. Please check the highlighted fields.',
  not_found: "We couldn't find that. It may have been removed, or you may not have access.",
  already_confirmed:
    'This scope was already confirmed. Refresh the page to see the latest version.',
  empty_scope: 'Add at least one deliverable before confirming the scope.',
  project_archived: 'This project is archived. Reopen it to make changes.',
  scope_locked: 'Confirmed scope cannot be changed. Edit the draft instead.',
  invalid_classification: 'Choose one of the listed classifications.',
  request_not_additional: 'Only requests you marked as Additional can become a change proposal.',
  change_order_exists: 'This request already has a change proposal. Open it to make a new version.',
  project_not_active:
    'Change proposals can only be changed while the project is active. Reopen the project first.',
  not_draft:
    'This version was already sent, so it can no longer be changed. Refresh to see the latest state.',
  not_pending: 'Only a sent proposal that is still waiting for the client can be cancelled.',
  draft_exists: 'There is already a draft version. Edit or discard it first.',
  missing_content: 'Add a title and a description before sending.',
  invalid_impact: 'Enter a price impact above 0, a time impact above 0, or both.',
  invalid_time_impact: 'Enter both a time amount and a unit, or leave both empty.',
  deadline_in_past: "The proposed deadline can't be in the past.",
  proposal_locked: 'A sent proposal cannot be changed. Create a new version instead.',
  network: "Can't reach GuardScope. Check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
};
