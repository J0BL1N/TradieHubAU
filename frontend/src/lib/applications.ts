import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Application {
  id: string;
  job_id: string;
  tradie_id: string;
  customer_id: string;
  estimate: number | null;
  availability: string | null;
  message: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  created_at: string;
  updated_at: string;
}

export interface SubmitApplicationPayload {
  job_id: string;
  customer_id: string;
  message: string;
  estimate?: number | null;
  availability?: string | null;
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

/**
 * Submit a new application for a job.
 * tradie_id is always derived server-side from auth.uid() via RLS.
 */
export async function submitApplication(payload: SubmitApplicationPayload) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };

  const { data, error } = await supabase
    .from('applications')
    .insert({
      job_id: payload.job_id,
      tradie_id: user.id,
      customer_id: payload.customer_id,
      message: payload.message,
      estimate: payload.estimate ?? null,
      availability: payload.availability ?? null,
      status: 'pending',
    })
    .select('*')
    .maybeSingle();

  return { data, error };
}

/**
 * Check whether the authenticated user has already applied for a given job.
 * Returns the existing application or null.
 */
export async function getMyApplicationForJob(jobId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: null };

  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('job_id', jobId)
    .eq('tradie_id', user.id)
    .maybeSingle();

  return { data: data as Application | null, error };
}

/**
 * Withdraw (soft-delete) the authenticated user's application for a job.
 */
export async function withdrawApplication(applicationId: string) {
  const { data, error } = await supabase
    .from('applications')
    .update({ status: 'withdrawn' })
    .eq('id', applicationId)
    .select('*')
    .maybeSingle();

  return { data, error };
}

/**
 * Get all applications the authenticated tradie has submitted.
 */
export async function getMyApplications() {
  const { data, error } = await supabase
    .from('applications')
    .select('*, job:jobs(id, title, location, status)')
    .order('created_at', { ascending: false });

  return { data: data ?? [], error };
}

/**
 * Get all applications/quotes submitted for a job (typically called by the job owner/customer).
 */
export async function getApplicationsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('applications')
    .select('*, tradie:users!tradie_id(id, display_name, email, phone, abn, license_number)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  return { data: data ?? [], error };
}

