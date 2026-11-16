/** Stable, UI-safe error codes (ARCHITECTURE.md §4.1, §5.4). Raw backend messages are never shown. */
export type ApiErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'rate_limited'
  | 'not_authenticated'
  | 'validation'
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
  if (code === '23514' || code === '22001' || code === 'validation_failed')
    return new ApiError('validation');
  return new ApiError('unknown');
}

export const errorMessages: Record<ApiErrorCode, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Please confirm your email address first. Check your inbox for the link.',
  weak_password: 'Choose a stronger password (at least 8 characters).',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  not_authenticated: 'Your session has ended. Please sign in again.',
  validation: 'Some details are not valid. Please check the highlighted fields.',
  network: "Can't reach GuardScope. Check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
};
