-- Migration: 029_harden_proof_dispute_inserts.sql
-- Description: Resolve Medium Issue M-01.
-- Drop direct client INSERT policies on job_completion_proofs and job_issues so that
-- both tables can only be written through the validated SECURITY DEFINER RPCs
-- (submit_completion_proof, raise_job_issue). Add duplicate-prevention constraints
-- and update the proof-submission RPC with an explicit idempotency guard.

-- ============================================================================
-- 1. Drop direct client INSERT policy on job_completion_proofs
--    The only valid insertion path is the submit_completion_proof() SECURITY DEFINER RPC,
--    which enforces: caller is the payee, job is payment_held, transitions job state.
-- ============================================================================
DROP POLICY IF EXISTS "Tradies upload completion proofs for own jobs" ON public.job_completion_proofs;

-- ============================================================================
-- 2. Drop direct client INSERT policy on job_issues
--    The only valid insertion path is the raise_job_issue() SECURITY DEFINER RPC,
--    which enforces: caller is the customer, job is completed_pending_review, transitions job state.
-- ============================================================================
DROP POLICY IF EXISTS "Customers raise issues for own jobs" ON public.job_issues;

-- ============================================================================
-- 3. Add UNIQUE constraint on job_completion_proofs(job_id)
--    A job may only have one active completion proof. The RPC inserts exactly one;
--    this constraint prevents duplicate proof rows even if the RPC were called twice.
-- ============================================================================
ALTER TABLE public.job_completion_proofs
  ADD CONSTRAINT uq_proof_per_job UNIQUE (job_id);

-- ============================================================================
-- 4. Add partial unique index on job_issues(job_id) WHERE status = 'open'
--    Prevents a second open dispute being raised for the same job.
--    Resolved issues (status != 'open') are preserved for audit.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_issue_per_job
  ON public.job_issues (job_id)
  WHERE status = 'open';

-- ============================================================================
-- 5. Update submit_completion_proof RPC with explicit duplicate guard
--    Although the UNIQUE constraint will reject the INSERT on conflict, an explicit
--    check produces a cleaner error message for the frontend caller.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_completion_proof(
  p_job_id      uuid,
  p_description text,
  p_attachments text[]
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tradie_id  uuid;
  v_job_status text;
  v_proof_id   uuid;
BEGIN
  -- Verify caller is the assigned tradie (payee) and job is in the funded/held state
  SELECT j.status, p.payee_id
  INTO   v_job_status, v_tradie_id
  FROM   public.jobs j
  JOIN   public.payments p ON p.job_id = j.id
  WHERE  j.id = p_job_id;

  IF v_tradie_id IS NULL THEN
    RAISE EXCEPTION 'No active contract/payment record found for this job.';
  END IF;
  IF v_tradie_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned contractor can submit completion proof.';
  END IF;
  IF v_job_status <> 'payment_held' THEN
    RAISE EXCEPTION 'Job is not in progress / funded. Current status: %', v_job_status;
  END IF;

  -- Idempotency guard: reject if a proof already exists for this job
  IF EXISTS (SELECT 1 FROM public.job_completion_proofs WHERE job_id = p_job_id) THEN
    RAISE EXCEPTION 'A completion proof has already been submitted for this job.';
  END IF;

  -- Insert completion proof with 72-hour auto-release window
  INSERT INTO public.job_completion_proofs (job_id, tradie_id, description, attachments, auto_release_at)
  VALUES (p_job_id, v_tradie_id, p_description, COALESCE(p_attachments, '{}'), now() + interval '72 hours')
  RETURNING id INTO v_proof_id;

  -- Transition job to review phase
  UPDATE public.jobs
  SET status = 'completed_pending_review', updated_at = now()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.submit_completion_proof(uuid, text, text[]) IS
  'SECURITY DEFINER RPC: validates payee identity, payment_held state, and prevents duplicate proofs. This is the only permitted insertion path for job_completion_proofs.';

-- ============================================================================
-- 6. Confirm raise_job_issue already has adequate guards (no redefinition needed)
--    Current definition (migration 018) enforces:
--      - caller is the job customer
--      - job status is completed_pending_review
--      - transitions job to disputed
--    The partial unique index (step 4) provides the duplicate-open-issue guard.
--    No further RPC change is required.
-- ============================================================================

-- ============================================================================
-- 7. Explanatory comments
-- ============================================================================
COMMENT ON TABLE public.job_completion_proofs IS
  'Completion proofs submitted by tradies. INSERT is RPC-only via submit_completion_proof(); direct client inserts are blocked. One proof per job enforced by unique constraint.';

COMMENT ON TABLE public.job_issues IS
  'Disputes raised by customers during the completion review window. INSERT is RPC-only via raise_job_issue(); direct client inserts are blocked. At most one open issue per job enforced by partial unique index.';
