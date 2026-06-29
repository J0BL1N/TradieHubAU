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

export interface EarlyReleaseLineCap {
  accepted_quote_line_item_id: string;
  line_total: number;
  used: number;
  remaining: number;
}

export interface EarlyReleaseCapSummary {
  job_id: string;
  application_id: string;
  contract_total: number;
  job_cap: number;
  job_used: number;
  job_remaining: number;
  cap_source: 'accepted_quote_line_items' | 'legacy_application_estimate' | 'unavailable';
  requires_quote_line_link: boolean;
  can_request: boolean;
  unavailable_reason: string | null;
  line_caps: EarlyReleaseLineCap[];
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

/**
 * Customer/admin review of a pending early release request.
 */
export async function reviewEarlyReleaseRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewNote?: string
) {
  const { data, error } = await supabase
    .rpc('review_early_release_request', {
      p_request_id: requestId,
      p_decision: decision,
      p_review_note: reviewNote?.trim() || null
    });

  return { data: data as EarlyReleaseRequest | null, error };
}

/**
 * Fetch the DB-authoritative early release cap summary for a job.
 * The RPC is permission-checked and only returns data to the contracted tradie,
 * job customer, admins, or service role.
 */
export async function fetchEarlyReleaseCapSummaryForJob(jobId: string) {
  const { data, error } = await supabase
    .rpc('get_early_release_cap_summary', { p_job_id: jobId })
    .maybeSingle();

  return { data: data as EarlyReleaseCapSummary | null, error };
}
