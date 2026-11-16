import { supabase } from '../supabase';
import { ApiError, toApiError } from './errors';

const appUrl = () => (import.meta.env.VITE_APP_URL as string | undefined) ?? window.location.origin;

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
    const e = toApiError(error);
    if (e.code === 'weak_password' || e.code === 'rate_limited' || e.code === 'network') throw e;
    // user_already_exists, email_address_not_authorized, etc. -> uniform outcome
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
  if (error) {
    const e = toApiError(error);
    if (e.code === 'rate_limited' || e.code === 'network') throw e;
  }
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw toApiError(error);
}

export { ApiError };
