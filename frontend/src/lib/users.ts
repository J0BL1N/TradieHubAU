import { supabase } from './supabase';

const PUBLIC_PROFILE_SELECT = [
  'id',
  'role',
  'display_name',
  'avatar_url',
  'suburb',
  'state',
  'trades',
  'abn',
  'license_number',
  'verified',
  'identity_verified',
  'tradie_verified',
  'show_location',
  'business_name',
  'bio',
  'years_experience',
  'service_areas',
  'website_url',
  'created_at',
  'updated_at',
].join(', ');

export interface PublicProfile {
  id: string;
  role: 'customer' | 'tradie' | 'dual';
  display_name: string;
  avatar_url: string | null;
  suburb: string | null;
  state: string | null;
  trades: string[] | null;
  abn: string | null;
  license_number: string | null;
  verified: boolean;
  identity_verified: boolean;
  tradie_verified: boolean;
  show_location: boolean;
  business_name: string | null;
  bio: string | null;
  years_experience: number | null;
  service_areas: string[] | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'customer' | 'tradie' | 'dual';
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  trades: string[] | null;
  abn: string | null;
  license_number: string | null;
  verified: boolean;
  identity_verified: boolean;
  tradie_verified: boolean;
  is_admin: boolean;
  show_location: boolean;
  address_rule: 'never' | 'afterAccepted' | 'afterJobStarts';
  business_name: string | null;
  bio: string | null;
  years_experience: number | null;
  service_areas: string[] | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
}

export interface VerificationRecord {
  id: string;
  user_id: string;
  document_type: 'license' | 'passport' | 'other' | string;
  document_url: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  user?: {
    display_name: string;
    email: string;
    role: 'customer' | 'tradie' | 'dual';
    abn: string | null;
    license_number: string | null;
    trades: string[] | null;
    verified: boolean;
    identity_verified: boolean;
    tradie_verified: boolean;
  };
}

export interface SearchTradiesFilters {
  state?: string;
  trades?: string[];
  verified?: boolean;
  search?: string;
}

export interface SearchCustomersFilters {
  state?: string;
  search?: string;
}

/**
 * Fetch all tradies matching filters
 */
export async function fetchTradies(filters: SearchTradiesFilters = {}) {
  try {
    let query = supabase
      .from('public_profiles')
      .select(PUBLIC_PROFILE_SELECT)
      .in('role', ['tradie', 'dual'])
      .order('created_at', { ascending: false });

    if (filters.state && filters.state !== 'all') {
      query = query.eq('state', filters.state);
    }

    if (filters.verified) {
      query = query.eq('tradie_verified', true);
    }

    if (filters.trades && filters.trades.length > 0) {
      query = query.overlaps('trades', filters.trades);
    }

    if (filters.search) {
      query = query.ilike('display_name', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { data: (data as unknown as UserProfile[]) || [], error: null };
  } catch (error: any) {
    console.error('❌ fetchTradies error:', error.message);
    return { data: [], error };
  }
}

/**
 * Fetch all customers matching filters
 */
export async function fetchCustomers(filters: SearchCustomersFilters = {}) {
  try {
    let query = supabase
      .from('public_profiles')
      .select(PUBLIC_PROFILE_SELECT)
      .in('role', ['customer', 'dual'])
      .order('created_at', { ascending: false });

    if (filters.state && filters.state !== 'all') {
      query = query.eq('state', filters.state);
    }

    if (filters.search) {
      query = query.ilike('display_name', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { data: (data as unknown as UserProfile[]) || [], error: null };
  } catch (error: any) {
    console.error('❌ fetchCustomers error:', error.message);
    return { data: [], error };
  }
}

/**
 * Fetch a user profile by ID
 */
export async function getUserProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return { data: data as UserProfile | null, error: null };
  } catch (error: any) {
    console.error('❌ getUserProfile error:', error.message);
    return { data: null, error };
  }
}

/**
 * Fetch safe public profiles in one request without relying on view relationships
 * that PostgREST cannot infer for embedded resource joins.
 */
export async function getPublicProfilesByIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { data: [] as PublicProfile[], error: null };
  }

  const { data, error } = await supabase
    .from('public_profiles')
    .select(PUBLIC_PROFILE_SELECT)
    .in('id', uniqueIds);

  return { data: (data as unknown as PublicProfile[]) || [], error };
}

/**
 * Fetch only fields intended for another user's public profile.
 * Database RLS must remain the authoritative privacy boundary.
 */
export async function getPublicUserProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('public_profiles')
      .select(PUBLIC_PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return { data: data as unknown as UserProfile | null, error: null };
  } catch (error: any) {
    console.error('❌ getPublicUserProfile error:', error.message);
    return { data: null, error };
  }
}

/**
 * Update user profile details
 */
export async function updateUserProfile(userId: string, updates: Partial<UserProfile>) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return { data: data as UserProfile | null, error: null };
  } catch (error: any) {
    console.error('❌ updateUserProfile error:', error.message);
    return { data: null, error };
  }
}

/**
 * Fetch verification records needed for the admin approval queue.
 * Includes approved records so a tradie case stays visible until final whitelisting.
 */
export async function getPendingVerifications() {
  try {
    const { data, error } = await supabase
      .from('verifications')
      .select(`
        *,
        user:users!user_id(display_name, email, role, abn, license_number, trades, verified, identity_verified, tradie_verified)
      `)
      .in('status', ['pending', 'approved'])
      .order('submitted_at', { ascending: true });

    if (error) throw error;
    return { data: (data as VerificationRecord[]) || [], error: null };
  } catch (error: any) {
    console.error('❌ getPendingVerifications error:', error.message);
    return { data: [], error };
  }
}

/**
 * Submit a document for verification
 */
export async function submitVerification(payload: {
  user_id: string;
  document_type: string;
  document_url: string;
}) {
  try {
    const { data, error } = await supabase
      .from('verifications')
      .insert({
        user_id: payload.user_id,
        document_type: payload.document_type,
        document_url: payload.document_url,
        status: 'pending',
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ submitVerification error:', error.message);
    return { data: null, error };
  }
}



/**
 * Approve an identity verification document
 */
export async function approveIdentityVerification(verificationId: string) {
  try {
    const { data, error } = await supabase
      .rpc('approve_identity_verification', { v_id: verificationId });

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ approveIdentityVerification error:', error.message);
    return { data: null, error };
  }
}

/**
 * Whitelist a tradie's profile atomically
 */
export async function approveTradieProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .rpc('approve_tradie_profile', { target_user_id: userId });

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ approveTradieProfile error:', error.message);
    return { data: null, error };
  }
}

/**
 * Approve a verification document's status only (without role upgrades or whitelisting)
 */
export async function approveDocumentOnly(verificationId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('verifications')
      .update({
        status: 'approved',
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', verificationId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ approveDocumentOnly error:', error.message);
    return { data: null, error };
  }
}

/**
 * Reject a verification record
 */
export async function rejectVerification(verificationId: string, notes: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('verifications')
      .update({
        status: 'rejected',
        admin_notes: notes,
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', verificationId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ rejectVerification error:', error.message);
    return { data: null, error };
  }
}

/**
 * Suspend a user's whitelisted tradie status (admin only)
 */
export async function suspendTradieProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .rpc('suspend_tradie_profile', { target_user_id: userId });

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ suspendTradieProfile error:', error.message);
    return { data: null, error };
  }
}

/**
 * Revoke a user's verified identity status (admin only)
 */
export async function suspendIdentityVerification(userId: string) {
  try {
    const { data, error } = await supabase
      .rpc('suspend_identity_verification', { target_user_id: userId });

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('❌ suspendIdentityVerification error:', error.message);
    return { data: null, error };
  }
}

