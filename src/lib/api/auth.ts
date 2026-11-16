import { supabase } from '../supabase';
import { ApiError, toApiError } from './errors';

const appUrl = () => (import.meta.env.VITE_APP_URL as string | undefined) ?? window.location.origin;

/**
 * True only when the request never got an HTTP response (offline, DNS, CORS, aborted fetch).
 * supabase-js also raises AuthRetryableFetchError for real 5xx responses (status 500-530), e.g.
 * GoTrue's 500 when the confirmation/recovery email cannot be sent. Those happen only for addresses
 * that would receive an email, so they must stay on the neutral path (AC-11 / BR-5).
 */
function isTransportFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  const gotResponse = typeof status === 'number' && status > 0;
  return !gotResponse && toApiError(error).code === 'network';
}

/**
 * Registers a user. Never reveals whether the email already exists (BR-5 / AC-11):
 * an existing address returns the same "check your email" outcome as a new one.
 */
export async function signUp(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${appUrl()}/sign-in?confirmed=1` },
  });
  if (error) {
    // Only errors that cannot depend on whether the address is registered are surfaced:
    // - transport failures: no request reached the server;
    // - weak_password: GoTrue checks password strength before it looks the user up.
    // Everything else (user_already_exists, email_address_not_authorized, SMTP failures and the
    // email-send rate limit, which GoTrue applies only when it would actually send a mail) gets the
    // uniform outcome. Trade-off required by AC-11: a genuinely rate-limited user sees the neutral
    // "check your email" message instead of a rate-limit hint.
    if (isTransportFailure(error)) throw new ApiError('network');
    if (toApiError(error).code === 'weak_password') throw new ApiError('weak_password');
    return { needsConfirmation: true };
  }
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toApiError(error);
}

export async function signOut(): Promise<void> {
  // 'local': ends this browser's session (revoked server-side) without signing out the user's other
  // devices. Other tabs in this browser follow via onAuthStateChange (shared storage).
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error && toApiError(error).code !== 'not_authenticated') throw toApiError(error);
}

/** Always resolves the same way for registered and unregistered emails (no enumeration). */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/reset-password`,
  });
  // Only transport failures are surfaced. Any server answer, including 429
  // over_email_send_rate_limit (sent only for registered addresses) and 5xx SMTP failures, resolves
  // like success. Trade-off required by AC-11: a genuinely rate-limited user sees the neutral
  // "if an account exists..." message instead of a rate-limit hint.
  if (error && isTransportFailure(error)) throw new ApiError('network');
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw toApiError(error);
}

export { ApiError };
