import { supabase } from './supabase';
import { getPublicProfilesByIds } from './users';
import { formatJobLocation } from './auLocations';

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
  suburb: string | null;
  state: string;
  region: string | null;
  postcode: string | null;
  location_label: string | null;
  budget_min: number | null;
  budget_max: number | null;
  estimated_budget: number | null;
  budget_type: 'rough_estimate' | 'fixed_budget' | 'need_quotes' | null;
  workspace_image_count: number;
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

export interface JobDetailPayment {
  id: string;
  job_id: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  platform_fee: number;
  status: 'pending' | 'held' | 'held_in_escrow' | 'released' | 'refunded' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface JobDetailData {
  job: Job;
  payment: JobDetailPayment | null;
  tradie?: Customer;
  workspace_images: JobWorkspaceImage[];
}

export interface JobWorkspaceImage {
  id: string;
  job_id: string;
  owner_id: string;
  bucket_id: 'job_workspace_images';
  storage_path: string;
  file_name: string;
  mime_type: 'image/jpeg' | 'image/jpg' | 'image/png' | 'image/webp';
  file_size: number;
  created_at: string;
  signed_url?: string;
}

export interface GetJobsFilters {
  state?: string;
  categories?: string[];
  urgency?: string;
  status?: string;
  search?: string;
}

export function getPublicJobLocation(job: Pick<Job, 'suburb' | 'state' | 'location'>) {
  return formatJobLocation(job.suburb, job.state) || job.location;
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

export async function fetchJobById(jobId: string) {
  try {
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) throw jobError;
    if (!job) return { data: null as JobDetailData | null, error: null };

    const { data: hydratedJobs, error: profilesError } = await hydrateJobsWithPublicCustomers([job]);
    if (profilesError) throw profilesError;

    const hydratedJob = hydratedJobs[0] as Job;
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, job_id, payer_id, payee_id, amount, platform_fee, status, created_at, updated_at')
      .eq('job_id', jobId)
      .maybeSingle();

    if (paymentError) throw paymentError;

    let tradie: Customer | undefined;
    if (payment?.payee_id) {
      const { data: profiles, error: tradieError } = await getPublicProfilesByIds([payment.payee_id]);
      if (tradieError) throw tradieError;
      const profile = profiles[0];
      if (profile) {
        tradie = {
          id: profile.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          suburb: profile.suburb,
          state: profile.state,
        };
      }
    }

    const { data: workspaceImages } = await fetchJobWorkspaceImages(jobId);

    return {
      data: {
        job: hydratedJob,
        payment: (payment as JobDetailPayment | null) || null,
        tradie,
        workspace_images: workspaceImages,
      },
      error: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown job detail error';
    console.error('fetchJobById error:', message);
    return { data: null as JobDetailData | null, error };
  }
}

const workspaceSignedUrlTtlSeconds = 3600;
const workspaceAllowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const workspaceMaxImageSize = 5 * 1024 * 1024;

export function validateWorkspaceImage(file: File) {
  if (!workspaceAllowedImageTypes.includes(file.type)) {
    return 'Only JPG, PNG, and WebP workspace photos are supported.';
  }
  if (file.size > workspaceMaxImageSize) {
    return 'Each workspace photo must be 5MB or smaller.';
  }
  return null;
}

export async function uploadJobWorkspaceImages(jobId: string, ownerId: string, files: File[]) {
  const uploadedRows: JobWorkspaceImage[] = [];

  for (const file of files.slice(0, 5)) {
    const validationError = validateWorkspaceImage(file);
    if (validationError) return { data: uploadedRows, error: new Error(validationError) };

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const storagePath = `jobs/${jobId}/${ownerId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('job_workspace_images')
      .upload(storagePath, file, { contentType: file.type });

    if (uploadError) return { data: uploadedRows, error: uploadError };

    const { data, error } = await supabase
      .from('job_workspace_images')
      .insert({
        job_id: jobId,
        owner_id: ownerId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
      })
      .select('*')
      .maybeSingle();

    if (error) return { data: uploadedRows, error };
    if (data) uploadedRows.push(data as JobWorkspaceImage);
  }

  return { data: uploadedRows, error: null };
}

export async function fetchJobWorkspaceImages(jobId: string) {
  try {
    const { data, error } = await supabase
      .from('job_workspace_images')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const rows = (data || []) as JobWorkspaceImage[];
    const paths = rows.map(row => row.storage_path);
    if (paths.length === 0) return { data: [] as JobWorkspaceImage[], error: null };

    const { data: signed, error: signedError } = await supabase.storage
      .from('job_workspace_images')
      .createSignedUrls(paths, workspaceSignedUrlTtlSeconds);

    if (signedError) throw signedError;

    const signedByPath = new Map((signed || []).map(item => [item.path, item.signedUrl]));
    return {
      data: rows.map(row => ({
        ...row,
        signed_url: signedByPath.get(row.storage_path) || undefined,
      })),
      error: null,
    };
  } catch (error) {
    return { data: [] as JobWorkspaceImage[], error };
  }
}
