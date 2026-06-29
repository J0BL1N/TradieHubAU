import { supabase } from './supabase';

export interface TimelineEvent {
  event_id: string;
  event_type: string;
  event_label: string;
  event_description: string | null;
  occurred_at: string;
  actor_role: string | null;
  actor_user_id: string | null;
  amount: number | null;
  status: string | null;
  source_table: string;
  source_id: string | null;
  metadata: any | null;
}

/**
 * Fetch the read-only evidence timeline for a job.
 */
export async function fetchJobEvidenceTimeline(jobId: string) {
  const { data, error } = await supabase.rpc('get_job_evidence_timeline', {
    p_job_id: jobId
  });

  return { data: (data as TimelineEvent[]) ?? [], error };
}
