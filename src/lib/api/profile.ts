import { supabase } from '../supabase';
import { ApiError, toApiError } from './errors';
import { validateProfileInput } from '../domain/profile';

export type Profile = {
  id: string;
  display_name: string | null;
  default_currency: string | null;
  created_at: string;
  updated_at: string;
};

const columns = 'id, display_name, default_currency, created_at, updated_at';

export async function getMyProfile(): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new ApiError('not_authenticated');
  const { data, error } = await supabase
    .from('profiles')
    .select(columns)
    .eq('id', auth.user.id)
    .single();
  if (error) throw toApiError(error);
  return data as Profile;
}

export async function updateMyProfile(input: {
  display_name?: string | null;
  default_currency?: string | null;
}): Promise<Profile> {
  if (Object.keys(validateProfileInput(input)).length > 0) throw new ApiError('validation');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new ApiError('not_authenticated');
  const { data, error } = await supabase
    .from('profiles')
    .update(input)
    .eq('id', auth.user.id)
    .select(columns)
    .single();
  if (error) throw toApiError(error);
  return data as Profile;
}
