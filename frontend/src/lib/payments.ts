import { supabase } from './supabase';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  job_id: string;
  payer_id: string;
  payee_id: string;
  amount: number; // in cents
  currency: string;
  stripe_payment_intent_id: string | null;
  status: 'pending' | 'held' | 'held_in_escrow' | 'released' | 'refunded' | 'failed';
  platform_fee: number; // in cents
  created_at: string;
  updated_at: string;
}

export interface PaymentLedger {
  id: string;
  payment_id: string;
  transaction_type: 'charge' | 'payout' | 'refund' | 'fee';
  amount_cents: number;
  stripe_transaction_id: string | null;
  created_at: string;
}

export interface Variation {
  id: string;
  job_id: string;
  application_id: string;
  requested_by: string;
  description: string;
  amount_cents: number;
  status: 'pending' | 'approved_awaiting_payment' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  actioned_at: string | null;
  rejection_reason: string | null;
}

export interface JobCompletionProof {
  id: string;
  job_id: string;
  tradie_id: string;
  description: string;
  attachments: string[];
  created_at: string;
  auto_release_at: string;
}

export interface JobIssue {
  id: string;
  job_id: string;
  proof_id: string | null;
  raised_by: string;
  description: string;
  attachments?: string[];
  status: 'open' | 'resolved_payout' | 'resolved_refund' | 'resolved_split';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  admin_notes: string | null;
}

// ─── RPC Operations ──────────────────────────────────────────────────────────

/**
 * Customer accepts a quote for a job, declining others and creating a pending payment.
 */
export async function acceptQuote(jobId: string, applicationId: string) {
  const { data, error } = await supabase.rpc('accept_quote', {
    p_job_id: jobId,
    p_application_id: applicationId
  });
  return { data, error };
}

/**
 * Tradie submits completion proof for a job, moving job status to completed_pending_review.
 */
export async function submitCompletionProof(jobId: string, description: string, attachments: string[]) {
  const { data, error } = await supabase.rpc('submit_completion_proof', {
    p_job_id: jobId,
    p_description: description,
    p_attachments: attachments
  });
  return { data, error };
}

/**
 * Customer raises a dispute/issue within the 7-day review window.
 */
export async function raiseJobIssue(jobId: string, description: string, attachments: string[] = []) {
  const { data, error } = await supabase.rpc('raise_job_issue', {
    p_job_id: jobId,
    p_description: description,
    p_attachments: attachments
  });
  return { data, error };
}

/**
 * Customer approves completion early, releasing payout immediately.
 */
export async function approveJobCompletion(jobId: string) {
  const { data, error } = await supabase.rpc('approve_job_completion', {
    p_job_id: jobId
  });
  return { data, error };
}

/**
 * Tradie submits a variation request (extra work/materials) for customer approval.
 */
export async function submitVariationRequest(jobId: string, description: string, amountCents: number) {
  const { data, error } = await supabase.rpc('submit_variation_request', {
    p_job_id: jobId,
    p_description: description,
    p_amount_cents: amountCents
  });
  return { data, error };
}

/**
 * Customer approves a pending variation.
 */
export async function approveVariation(variationId: string) {
  const { data, error } = await supabase.rpc('approve_variation', {
    p_variation_id: variationId
  });
  return { data, error };
}

/**
 * Customer rejects a pending variation.
 */
export async function rejectVariation(variationId: string, reason: string) {
  const { data, error } = await supabase.rpc('reject_variation', {
    p_variation_id: variationId,
    p_reason: reason
  });
  return { data, error };
}

/**
 * Mock payments: Calls the database RPC to simulate a funding capture event on an approved variation.
 */
export async function simulateVariationFunding(variationId: string) {
  const { data, error } = await supabase.rpc('simulate_variation_funding', {
    p_variation_id: variationId
  });
  return { data, error };
}

/**
 * Admin resolves a disputed job with a split percentage (0% to 100%).
 */
export async function resolveDispute(jobId: string, resolution: string, splitPercentage: number) {
  const { data, error } = await supabase.rpc('resolve_dispute', {
    p_job_id: jobId,
    p_resolution: resolution,
    p_split_percentage: splitPercentage
  });
  return { data, error };
}

// ─── Query Operations ────────────────────────────────────────────────────────

/**
 * Fetches the payment record associated with a job.
 */
export async function getPaymentForJob(jobId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  return { data: data as Payment | null, error };
}

/**
 * Fetches all variations submitted for a job.
 */
export async function getVariationsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('variations')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  return { data: (data as Variation[]) || [], error };
}

/**
 * Fetches all completion proofs submitted for a job.
 */
export async function getCompletionProofsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('job_completion_proofs')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  return { data: (data as JobCompletionProof[]) || [], error };
}

/**
 * Fetches all issues raised for a job.
 */
export async function getIssuesForJob(jobId: string) {
  const { data, error } = await supabase
    .from('job_issues')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  return { data: (data as JobIssue[]) || [], error };
}

// ─── Simulation Helpers ──────────────────────────────────────────────────────

/**
 * Mock payments: Calls the database RPC to update payment status to 'held' and job status to 'payment_held'.
 */
export async function simulatePaymentFunding(jobId: string) {
  const { data, error } = await supabase.rpc('simulate_payment_funding', {
    p_job_id: jobId
  });
  return { data, error };
}

/**
 * Fetches all ledger transaction entries associated with a payment record.
 */
export async function getLedgerForPayment(paymentId: string) {
  const { data, error } = await supabase
    .from('payment_ledger')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true });
  return { data: (data as PaymentLedger[]) || [], error };
}

/**
 * Admin Panel Dispute Query: Gets all jobs in disputed status with related dispute/payment details.
 */
export async function getDisputedJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select(`
      *,
      customer:users!customer_id(id, display_name, email),
      payments!inner(amount, platform_fee, payee:users!payee_id(id, display_name, email)),
      job_issues!job_issues_job_id_fkey(id, description, status, attachments, created_at)
    `)
    .eq('status', 'disputed');

  return { data: data || [], error };
}
