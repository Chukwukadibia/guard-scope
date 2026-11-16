import { supabase } from '../supabase';
import { ApiError, toApiError } from './errors';

/**
 * AUTH-004. Re-checks the password (client-side safeguard, spec C-3), then deletes the account and all
 * its data server-side (delete_my_account). The caller then signs out deliberately via AuthProvider, so the
 * UI shows "account deleted" rather than "session ended".
 */
export async function deleteMyAccount(email: string, password: string): Promise<void> {
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    const e = toApiError(authError);
    throw e.code === 'invalid_credentials' ? new ApiError('invalid_credentials') : e;
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw toApiError(error);
}
