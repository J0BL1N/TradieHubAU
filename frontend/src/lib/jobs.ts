import { supabase } from './supabase';
import { getPublicProfilesByIds } from './users';

export interface Customer {
  id: string;
  display_name: string;
  avatar_url: string | null;
  suburb: string | null;
  state: string | null;
  email?: string;
  phone?: string;
}

export interface Job {
  id: string;
  customer_id: string;
  title: string;
  description: string;
  categories: string[];
  location: string;
  state: string;
  budget_min: number | null;
  budget_max: number | null;
  timeline: string | null;
  urgency: 'urgent' | 'week' | 'flexible' | null;
  type: 'one-off' | 'contract' | 'ongoing' | null;
  status: 'open' | 'accepted' | 'payment_held' | 'completed_pending_review' | 'disputed' | 'completed' | 'cancelled';
  quotes_count: number;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  applications?: any[];
}

export interface GetJobsFilters {
  state?: string;
  categories?: string[];
  urgency?: string;
  status?: string;
  search?: string;
}

/** Attach public customer profiles without requiring a PostgREST relationship to the view. */
export async function hydrateJobsWithPublicCustomers<T extends { customer_id: string }>(jobs: T[]) {
  const { data: profiles, error } = await getPublicProfilesByIds(
    jobs.map(job => job.customer_id)
  );

  if (error) {
    return { data: [] as Array<T & { customer?: Customer }>, error };
  }

  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const hydratedJobs = jobs.map(job => {
    const profile = profilesById.get(job.customer_id);
    return {
      ...job,
      customer: profile ? {
        id: profile.id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        suburb: profile.suburb,
        state: profile.state,
      } : undefined,
    };
  });

  return { data: hydratedJobs, error: null };
}

/**
 * Fetch all open jobs with optional filters from Supabase
 */
export async function fetchJobs(filters: GetJobsFilters = {}) {
  try {
    let query = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply state filter if not 'all'
    if (filters.state && filters.state !== 'all') {
      query = query.eq('state', filters.state);
    }

    // Apply urgency filter
    if (filters.urgency) {
      query = query.eq('urgency', filters.urgency);
    }

    // Apply status filter (default to 'open')
    if (filters.status) {
      query = query.eq('status', filters.status);
    } else {
      query = query.eq('status', 'open');
    }

    // Apply category search (overlaps array check)
    if (filters.categories && filters.categories.length > 0) {
      query = query.overlaps('categories', filters.categories);
    }

    // Apply title query
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const { data: hydratedJobs, error: profilesError } = await hydrateJobsWithPublicCustomers(data || []);
    if (profilesError) throw profilesError;

    return { data: hydratedJobs as Job[], error: null };
  } catch (error: any) {
    console.error('❌ fetchJobs error:', error.message);
    return { data: [], error };
  }
}
