-- Migration: 017_change_review_timer_to_72_hours.sql
-- Description: Update review clock timer from 7 days to 72 hours.

CREATE OR REPLACE FUNCTION public.submit_completion_proof(p_job_id uuid, p_description text, p_attachments text[])
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tradie_id uuid;
  v_job_status text;
  v_proof_id uuid;
BEGIN
  -- Get job status and verify caller is the assigned tradie (qualified status to j.status)
  SELECT j.status, p.payee_id INTO v_job_status, v_tradie_id
  FROM public.jobs j
  JOIN public.payments p ON p.job_id = j.id
  WHERE j.id = p_job_id;

  IF v_tradie_id IS NULL THEN
    RAISE EXCEPTION 'No active contract/payment record found for this job.';
  END IF;
  IF v_tradie_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned tradie can submit completion proof.';
  END IF;
  IF v_job_status <> 'payment_held' THEN
    RAISE EXCEPTION 'Job is not in progress / paid.';
  END IF;

  -- Insert completion proof with 72 hours review window
  INSERT INTO public.job_completion_proofs (job_id, tradie_id, description, attachments, auto_release_at)
  VALUES (p_job_id, v_tradie_id, p_description, p_attachments, now() + interval '72 hours')
  RETURNING id INTO v_proof_id;

  -- Update job status to completed_pending_review
  UPDATE public.jobs SET status = 'completed_pending_review', updated_at = now() WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;
