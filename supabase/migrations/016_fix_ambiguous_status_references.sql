-- Migration: 016_fix_ambiguous_status_references.sql
-- Description: Fix ambiguous status column references in submit_completion_proof and submit_variation_request RPCs, and create storage bucket for completion proofs.

-- 1. Create storage bucket 'completion_proofs' if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'completion_proofs',
  'completion_proofs',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Redefine submit_completion_proof to qualify jobs.status
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

  -- Insert completion proof
  INSERT INTO public.job_completion_proofs (job_id, tradie_id, description, attachments, auto_release_at)
  VALUES (p_job_id, v_tradie_id, p_description, p_attachments, now() + interval '7 days')
  RETURNING id INTO v_proof_id;

  -- Update job status to completed_pending_review
  UPDATE public.jobs SET status = 'completed_pending_review', updated_at = now() WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Redefine submit_variation_request to qualify jobs.status
CREATE OR REPLACE FUNCTION public.submit_variation_request(p_job_id uuid, p_description text, p_amount_cents integer)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tradie_id uuid;
  v_job_status text;
  v_app_id uuid;
BEGIN
  -- Get job status and verify caller is payee (qualified status to j.status)
  SELECT j.status, p.payee_id INTO v_job_status, v_tradie_id
  FROM public.jobs j
  JOIN public.payments p ON p.job_id = j.id
  WHERE j.id = p_job_id;

  IF v_tradie_id IS NULL THEN
    RAISE EXCEPTION 'No active contract found for this job.';
  END IF;
  IF v_tradie_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned tradie can request a variation.';
  END IF;
  IF v_job_status NOT IN ('payment_held', 'completed_pending_review') THEN
    RAISE EXCEPTION 'Variations can only be requested for jobs currently in progress.';
  END IF;

  -- Get accepted application_id
  SELECT id INTO v_app_id FROM public.applications
  WHERE job_id = p_job_id AND tradie_id = auth.uid() AND status = 'accepted';

  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'No accepted application found.';
  END IF;

  -- Insert variation request
  INSERT INTO public.variations (job_id, application_id, requested_by, description, amount_cents, status)
  VALUES (p_job_id, v_app_id, auth.uid(), p_description, p_amount_cents, 'pending');
END;
$$ LANGUAGE plpgsql;
