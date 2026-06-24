-- Migration: 026_block_completion_approval_during_disputes.sql
-- Description: Resolve High Issue H-04 by allowing customer completion approval
-- only from completed_pending_review and reserving disputed jobs for admin resolution.

CREATE OR REPLACE FUNCTION public.approve_job_completion(p_job_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_payment_id uuid;
  v_payment_status text;
  v_total_funded integer;
  v_fee_cents integer;
BEGIN
  -- Lock the job so approval and dispute creation cannot pass their state checks
  -- concurrently and then overwrite each other's lifecycle transition.
  SELECT j.status, j.customer_id
  INTO v_job_status, v_customer_id
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;
  IF auth.uid() IS NULL OR v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can approve completion.';
  END IF;
  IF v_job_status = 'disputed' THEN
    RAISE EXCEPTION 'Disputed jobs must be resolved by an administrator.';
  END IF;
  IF v_job_status <> 'completed_pending_review' THEN
    RAISE EXCEPTION 'Job must be awaiting completion review before it can be approved.';
  END IF;

  -- Fail closed if an issue row exists despite an inconsistent job status.
  IF EXISTS (
    SELECT 1
    FROM public.job_issues ji
    WHERE ji.job_id = p_job_id
      AND ji.status = 'open'
  ) THEN
    RAISE EXCEPTION 'This job has an active dispute and requires administrator resolution.';
  END IF;

  -- Lock and validate the corresponding funded payment before settlement.
  SELECT p.id, p.status
  INTO v_payment_id, v_payment_status
  FROM public.payments p
  WHERE p.job_id = p_job_id
  FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;
  IF v_payment_status <> 'held' THEN
    RAISE EXCEPTION 'Payment must be held before completion can be approved.';
  END IF;

  -- Refuse to create duplicate settlement entries if stored state is inconsistent.
  IF EXISTS (
    SELECT 1
    FROM public.payment_ledger pl
    WHERE pl.payment_id = v_payment_id
      AND pl.transaction_type IN ('payout', 'refund', 'fee')
  ) THEN
    RAISE EXCEPTION 'Payment has already been settled.';
  END IF;

  SELECT COALESCE(SUM(pl.amount_cents), 0)
  INTO v_total_funded
  FROM public.payment_ledger pl
  WHERE pl.payment_id = v_payment_id
    AND pl.transaction_type = 'charge';

  IF v_total_funded <= 0 THEN
    RAISE EXCEPTION 'Cannot complete job: No funded payments exist in ledger.';
  END IF;

  v_fee_cents := calculate_platform_fee(v_total_funded);

  -- Authorize the payment trigger update inside this validated RPC transaction.
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  UPDATE public.payments
  SET
    status = 'released',
    amount = v_total_funded,
    platform_fee = v_fee_cents,
    updated_at = now()
  WHERE id = v_payment_id
    AND status = 'held';

  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'payout', v_total_funded - v_fee_cents);

  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'fee', v_fee_cents);

  UPDATE public.jobs
  SET status = 'completed', updated_at = now()
  WHERE id = p_job_id
    AND status = 'completed_pending_review';
END;
$$ LANGUAGE plpgsql;

-- Serialize dispute creation against completion approval using the same job-row lock.
-- All existing ownership, review-state, evidence, and status-transition behavior remains.
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
  SELECT j.status, j.customer_id
  INTO v_job_status, v_customer_id
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;
  IF auth.uid() IS NULL OR v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can raise an issue.';
  END IF;
  IF v_job_status <> 'completed_pending_review' THEN
    RAISE EXCEPTION 'Job is not in review phase.';
  END IF;

  SELECT jcp.id
  INTO v_proof_id
  FROM public.job_completion_proofs jcp
  WHERE jcp.job_id = p_job_id
  ORDER BY jcp.created_at DESC
  LIMIT 1;

  INSERT INTO public.job_issues (
    job_id,
    proof_id,
    raised_by,
    description,
    attachments,
    status
  )
  VALUES (
    p_job_id,
    v_proof_id,
    auth.uid(),
    p_description,
    p_attachments,
    'open'
  );

  UPDATE public.jobs
  SET status = 'disputed', updated_at = now()
  WHERE id = p_job_id
    AND status = 'completed_pending_review';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.approve_job_completion(uuid) IS
  'Allows the authenticated job owner to approve only completed_pending_review work with a held, unsettled payment. Disputed jobs require admin resolution.';

COMMENT ON FUNCTION public.raise_job_issue(uuid, text, text[]) IS
  'Creates a customer dispute from completed_pending_review while serializing against concurrent completion approval.';

-- Migration 009 created a two-argument overload before migration 018 added the
-- attachments argument. Keep that legacy signature safe and compatible by routing
-- it through the locked three-argument implementation.
CREATE OR REPLACE FUNCTION public.raise_job_issue(
  p_job_id uuid,
  p_description text
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.raise_job_issue(p_job_id, p_description, ARRAY[]::text[]);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.raise_job_issue(uuid, text) IS
  'Compatibility wrapper that creates a dispute without attachments through the serialized three-argument implementation.';
