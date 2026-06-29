import { supabase } from './supabase';

export type VariationLineType = 'labour' | 'materials' | 'callout' | 'disposal' | 'equipment' | 'permit' | 'other';
export type VariationRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface VariationLineItem {
  id: string;
  variation_request_id: string;
  job_id: string;
  application_id: string;
  tradie_id: string;
  customer_id: string;
  label: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  line_type: VariationLineType;
  sort_order: number;
  created_at: string;
}

export interface VariationRequest {
  id: string;
  job_id: string;
  application_id: string;
  tradie_id: string;
  customer_id: string;
  title: string;
  reason: string | null;
  status: VariationRequestStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  line_items?: VariationLineItem[];
}

export interface VariationLineItemPayload {
  label: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  line_type: VariationLineType;
}

export interface VariationRequestPayload {
  job_id: string;
  title: string;
  reason?: string | null;
  line_items: VariationLineItemPayload[];
}

export async function fetchVariationRequestsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('job_variation_requests')
    .select('*, line_items:job_variation_line_items(*)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .order('sort_order', { foreignTable: 'job_variation_line_items', ascending: true });

  return { data: (data as VariationRequest[]) ?? [], error };
}

export async function createVariationRequest(payload: VariationRequestPayload) {
  const { data, error } = await supabase
    .rpc('create_itemised_variation_request', {
      p_job_id: payload.job_id,
      p_title: payload.title,
      p_reason: payload.reason || null,
      p_line_items: payload.line_items
    });

  return { data: data as VariationRequest | null, error };
}

export async function cancelVariationRequest(requestId: string) {
  const { data, error } = await supabase
    .rpc('cancel_itemised_variation_request', {
      p_request_id: requestId
    });

  return { data: data as VariationRequest | null, error };
}
