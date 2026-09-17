import { Profile, UserRole } from '../types';
import { getSupabase } from './supabase';

/**
 * Fetch all personnel from Supabase (realtime, no localStorage)
 */
export async function fetchAllPersonnel(): Promise<Profile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching personnel:', error);
    return [];
  }
  return (data || []) as Profile[];
}

/**
 * Fetch personnel by role from Supabase (realtime, no localStorage)
 */
export async function fetchPersonnelByRole(role: UserRole): Promise<Profile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', role)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching personnel by role:', error);
    return [];
  }
  return (data || []) as Profile[];
}

/**
 * Save a new personnel record to Supabase (realtime, no localStorage)
 */
export async function savePersonnel(personnel: Profile): Promise<Profile | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: personnel.id || undefined,
      auth_user_id: personnel.auth_user_id || personnel.id,
      email: personnel.email,
      full_name: personnel.full_name,
      role: personnel.role,
      staff_id: personnel.staff_id,
      phone: personnel.phone,
      status: personnel.status || 'active',
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('Error saving personnel:', error);
    return null;
  }
  return data as Profile;
}

/**
 * Update a personnel record in Supabase (realtime, no localStorage)
 */
export async function updatePersonnel(identifier: string, updates: Partial<Profile>): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .or(`id.eq.${identifier},email.eq.${identifier},staff_id.eq.${identifier}`);

  if (error) {
    console.error('Error updating personnel:', error);
    return false;
  }
  return true;
}

/**
 * Delete a personnel record from Supabase (realtime, no localStorage)
 */
export async function removePersonnel(identifier: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('profiles')
    .delete()
    .or(`id.eq.${identifier},email.eq.${identifier},staff_id.eq.${identifier}`);

  if (error) {
    console.error('Error removing personnel:', error);
    return false;
  }
  return true;
}

/**
 * Merge profiles - now just returns DB profiles since there's no local cache.
 * Kept for API compatibility with existing components.
 */
export function mergeProfiles(
  dbProfiles: Profile[] = [],
  _cachedProfiles: Profile[] = [],
  roleFilter?: UserRole
): Profile[] {
  if (roleFilter) {
    return dbProfiles.filter((p) => p.role === roleFilter);
  }
  return dbProfiles;
}
