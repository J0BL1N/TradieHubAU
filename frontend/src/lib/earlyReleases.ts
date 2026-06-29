import { supabase } from './supabase';

export interface EarlyReleaseRequest {
  id: string;
  job_id: string;
  application_id: string;
  tradie_id: string;
  customer_id: string;
  accepted_quote_line_item_id: string | null;
  
  request_type: 'materials' | 'fuel' | 'mobilisation' | 'permit' | 'equipment' | 'other';
  title: string;
  description: string | null;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  
  created_at: string;
  updated_at: string;
}

export interface EarlyReleaseRequestPayload {
  job_id: string;
  application_id: string;
  tradie_id: string;
  customer_id: string;
  accepted_quote_line_item_id: string | null;
  request_type: 'materials' | 'fuel' | 'mobilisation' | 'permit' | 'equipment' | 'other';
  title: string;
  description?: string;
  amount: number;
}

/**
 * Fetch all early release requests for a specific job.
 */
export async function fetchEarlyReleaseRequestsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('early_release_requests')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  return { data: (data as EarlyReleaseRequest[]) ?? [], error };
}

/**
 * Create a new early release request.
 */
export async function createEarlyReleaseRequest(payload: EarlyReleaseRequestPayload) {
  const { data, error } = await supabase
    .from('early_release_requests')
    .insert([payload])
    .select('*')
    .single();

  return { data: data as EarlyReleaseRequest | null, error };
}

/**
 * Cancel a pending early release request.
 */
export async function cancelEarlyReleaseRequest(requestId: string) {
  const { data, error } = await supabase
    .from('early_release_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .select('*')
    .single();

  return { data: data as EarlyReleaseRequest | null, error };
}
