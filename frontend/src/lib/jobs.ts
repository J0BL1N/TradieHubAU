import { supabase } from './supabase';

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

/**
 * Fetch all open jobs with optional filters from Supabase
 */
export async function fetchJobs(filters: GetJobsFilters = {}) {
  try {
    let query = supabase
      .from('jobs')
      .select(`
        *,
        customer:public_profiles!customer_id(id, display_name, avatar_url, suburb, state)
      `)
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

    return { data: (data as Job[]) || [], error: null };
  } catch (error: any) {
    console.error('❌ fetchJobs error:', error.message);
    return { data: [], error };
  }
}
