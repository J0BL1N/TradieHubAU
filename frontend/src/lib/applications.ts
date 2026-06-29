import { supabase } from './supabase';
import { getPublicProfilesByIds } from './users';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuoteLineItem {
  id: string;
  application_id: string;
  tradie_id: string;
  job_id: string;
  label: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  line_type: 'labour' | 'materials' | 'callout' | 'disposal' | 'other';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteLineItemPayload {
  label: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  line_type?: 'labour' | 'materials' | 'callout' | 'disposal' | 'other';
}

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
  tradie?: {
    id: string;
    display_name: string;
    abn: string | null;
    license_number: string | null;
    tradie_verified: boolean;
    identity_verified: boolean;
  } | null;
}

export interface SubmitApplicationPayload {
  job_id: string;
  customer_id: string;
  message: string;
  estimate?: number | null;
  availability?: string | null;
  line_items?: QuoteLineItemPayload[];
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

/**
 * Submit a new application for a job along with its itemised quote line items.
 * tradie_id is always derived server-side from auth.uid() via RLS.
 */
export async function submitApplication(payload: SubmitApplicationPayload) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };
  if (payload.customer_id === user.id) {
    return { data: null, error: new Error("You can't quote on your own job.") };
  }

  // 1. Insert application
  const { data: appData, error: appError } = await supabase
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

  if (appError || !appData) {
    return { data: null, error: appError || new Error('Failed to create application') };
  }

  // 2. Insert line items if present
  if (payload.line_items && payload.line_items.length > 0) {
    const lineItemsPayload = payload.line_items.map((item, index) => ({
      application_id: appData.id,
      tradie_id: user.id,
      job_id: payload.job_id,
      label: item.label,
      description: item.description || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_type: item.line_type || 'labour',
      sort_order: index,
    }));

    const { error: itemsError } = await supabase
      .from('quote_line_items')
      .insert(lineItemsPayload);

    if (itemsError) {
      // Rollback application if line items fail to protect integrity
      await supabase.from('applications').delete().eq('id', appData.id);
      return { data: null, error: itemsError };
    }
  }

  return { data: appData, error: null };
}

/**
 * Bulk create quote line items for an application.
 */
export async function createQuoteLineItems(
  applicationId: string,
  tradieId: string,
  jobId: string,
  items: QuoteLineItemPayload[]
) {
  const payload = items.map((item, index) => ({
    application_id: applicationId,
    tradie_id: tradieId,
    job_id: jobId,
    label: item.label,
    description: item.description || null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_type: item.line_type || 'labour',
    sort_order: index,
  }));

  const { data, error } = await supabase
    .from('quote_line_items')
    .insert(payload)
    .select('*');

  return { data, error };
}

/**
 * Fetch all quote line items for a list of application IDs.
 */
export async function fetchQuoteLineItemsByApplicationIds(applicationIds: string[]) {
  if (applicationIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from('quote_line_items')
    .select('*')
    .in('application_id', applicationIds)
    .order('sort_order', { ascending: true });

  return { data: data ?? [], error };
}

/**
 * Helper to group quote line items by application ID.
 */
export function groupQuoteLineItemsByApplication(items: QuoteLineItem[]) {
  const groups = new Map<string, QuoteLineItem[]>();
  for (const item of items) {
    if (!groups.has(item.application_id)) {
      groups.set(item.application_id, []);
    }
    groups.get(item.application_id)!.push(item);
  }
  return groups;
}

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
    .select('*, job:jobs(id, title, location, suburb, state, region, status)')
    .order('created_at', { ascending: false });

  return { data: data ?? [], error };
}

/**
 * Get all applications/quotes submitted for a job (typically called by the job owner/customer).
 */
export async function getApplicationsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error || !data) return { data: [], error };

  const { data: profiles, error: profilesError } = await getPublicProfilesByIds(
    data.map(application => application.tradie_id)
  );
  if (profilesError) return { data: [], error: profilesError };

  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const applications = data.map(application => {
    const profile = profilesById.get(application.tradie_id);
    return {
      ...application,
      tradie: profile ? {
        id: profile.id,
        display_name: profile.display_name,
        abn: profile.abn,
        license_number: profile.license_number,
        tradie_verified: profile.tradie_verified,
        identity_verified: profile.identity_verified,
      } : null,
    };
  });

  return { data: applications, error: null };
}

