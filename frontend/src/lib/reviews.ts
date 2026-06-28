import { supabase } from './supabase';

export interface PublicTradieReview {
  id: string;
  rating: number;
  text: string | null;
  submitted_at: string;
  reviewer_display_name: string | null;
  reviewer_avatar_url: string | null;
  job_title: string | null;
  job_categories: string[] | null;
  job_suburb: string | null;
  job_state: string | null;
}

export interface ReviewSummary {
  tradie_id: string;
  average_rating: number;
  review_count: number;
}

export interface MyReview {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  text: string | null;
  submitted_at: string;
  unlocked: boolean;
}

export async function fetchPublicTradieReviews(tradieId: string) {
  const { data, error } = await supabase.rpc('list_public_tradie_reviews', {
    p_tradie_id: tradieId,
  });

  return { data: (data as PublicTradieReview[]) || [], error };
}

export async function fetchPublicTradieReviewSummaries(tradieIds: string[]) {
  const ids = [...new Set(tradieIds.filter(Boolean))];
  if (ids.length === 0) return { data: [] as ReviewSummary[], error: null };

  const { data, error } = await supabase.rpc('list_public_tradie_review_summaries', {
    p_tradie_ids: ids,
  });

  return { data: (data as ReviewSummary[]) || [], error };
}

export async function getMyTradieReviewForJob(jobId: string, tradieId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null as MyReview | null, error: null };

  const { data, error } = await supabase
    .from('reviews')
    .select('id, job_id, reviewer_id, reviewee_id, rating, text, submitted_at, unlocked')
    .eq('job_id', jobId)
    .eq('reviewer_id', user.id)
    .eq('reviewee_id', tradieId)
    .maybeSingle();

  return { data: data as MyReview | null, error };
}

export async function submitTradieReview(payload: {
  jobId: string;
  tradieId: string;
  rating: number;
  text: string;
}) {
  const { data, error } = await supabase.rpc('submit_tradie_review', {
    p_job_id: payload.jobId,
    p_tradie_id: payload.tradieId,
    p_rating: payload.rating,
    p_text: payload.text.trim() || null,
  });

  return { data: data as MyReview | null, error };
}
