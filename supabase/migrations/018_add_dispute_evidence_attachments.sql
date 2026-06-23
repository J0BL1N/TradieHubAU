-- Migration: 018_add_dispute_evidence_attachments.sql
-- Description: Add attachments text[] column to job_issues, update raise_job_issue RPC, and create storage security policies for dispute evidence.

-- 1. Add attachments column to public.job_issues if not exists
ALTER TABLE public.job_issues ADD COLUMN IF NOT EXISTS attachments text[] NOT NULL DEFAULT '{}';

-- 2. Redefine raise_job_issue RPC to accept attachments parameter
CREATE OR REPLACE FUNCTION public.raise_job_issue(
  p_job_id uuid,
  p_description text,
  p_attachments text[] DEFAULT '{}'
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_proof_id uuid;
BEGIN
  -- Verify job status and caller is the customer
  SELECT status, customer_id INTO v_job_status, v_customer_id
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;
  IF v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can raise an issue.';
  END IF;
  IF v_job_status <> 'completed_pending_review' THEN
    RAISE EXCEPTION 'Job is not in review phase.';
  END IF;

  -- Find the latest completion proof ID
  SELECT id INTO v_proof_id FROM public.job_completion_proofs
  WHERE job_id = p_job_id
  ORDER BY created_at DESC LIMIT 1;

  -- Insert job issue with attachments
  INSERT INTO public.job_issues (job_id, proof_id, raised_by, description, attachments, status)
  VALUES (p_job_id, v_proof_id, auth.uid(), p_description, p_attachments, 'open');

  -- Update job status to disputed
  UPDATE public.jobs SET status = 'disputed', updated_at = now() WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Storage bucket insert policy for customers uploading dispute evidence
DROP POLICY IF EXISTS "Allow customers to upload dispute evidence" ON storage.objects;
CREATE POLICY "Allow customers to upload dispute evidence" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'completion_proofs'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1) = 'disputes'
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE customer_id = auth.uid()
        AND id::text = split_part(name, '/', 2)
    )
  );

-- 4. Storage bucket select policy separating jobs/ and disputes/
DROP POLICY IF EXISTS "Allow job participants to view completion proofs" ON storage.objects;
CREATE POLICY "Allow job participants to view completion proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'completion_proofs'
    AND auth.role() = 'authenticated'
    AND (
      -- For tradie completion proofs (under jobs/)
      (
        split_part(name, '/', 1) = 'jobs'
        AND EXISTS (
          SELECT 1 FROM public.payments p
          JOIN public.jobs j ON j.id = p.job_id
          WHERE p.job_id::text = split_part(name, '/', 2)
            AND (p.payee_id = auth.uid() OR j.customer_id = auth.uid())
        )
      )
      -- For customer dispute evidence (under disputes/)
      OR (
        split_part(name, '/', 1) = 'disputes'
        AND EXISTS (
          SELECT 1 FROM public.jobs j
          WHERE j.id::text = split_part(name, '/', 2)
            AND j.customer_id = auth.uid()
        )
      )
      OR is_admin(auth.uid())
    )
  );
