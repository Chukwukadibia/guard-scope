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
  network: "Can't reach GuardScope. Check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
};
