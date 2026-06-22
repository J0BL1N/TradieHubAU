-- Migration: 010_payment_funding_ledger_fix.sql
-- Description: Correct logic inversion where charges were logged upon quote acceptance rather than actual funding capture.

-- 1. Re-define public.accept_quote without ledger insertion
CREATE OR REPLACE FUNCTION public.accept_quote(p_job_id uuid, p_application_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_tradie_id uuid;
  v_estimate numeric;
  v_amount_cents integer;
  v_fee_cents integer;
BEGIN
  -- Verify caller owns the job
  SELECT customer_id INTO v_customer_id FROM public.jobs WHERE id = p_job_id;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;
  IF v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can accept a quote.';
  END IF;

  -- Verify application exists and belongs to the job
  SELECT tradie_id, estimate INTO v_tradie_id, v_estimate FROM public.applications 
  WHERE id = p_application_id AND job_id = p_job_id;
  IF v_tradie_id IS NULL THEN
    RAISE EXCEPTION 'Quote not found for this job.';
  END IF;

  -- Check constraint: Ensure estimate is not null and positive
  IF v_estimate IS NULL OR v_estimate <= 0 THEN
    RAISE EXCEPTION 'Cannot accept a quote without a valid, positive estimate.';
  END IF;

  -- Check if job is in open state
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND status <> 'open') THEN
    RAISE EXCEPTION 'Job is not open for quotes.';
  END IF;

  -- Update target application to accepted
  UPDATE public.applications SET status = 'accepted', updated_at = now() WHERE id = p_application_id;
  
  -- Decline all other pending applications for this job
  UPDATE public.applications SET status = 'declined', updated_at = now() 
  WHERE job_id = p_job_id AND id <> p_application_id AND status = 'pending';

  -- Update job status to accepted
  UPDATE public.jobs SET status = 'accepted', updated_at = now() WHERE id = p_job_id;

  -- Calculate fee (convert numeric estimate to cents)
  v_amount_cents := (v_estimate * 100)::integer;
  v_fee_cents := calculate_platform_fee(v_amount_cents);

  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- Insert/Upsert payment record (no ledger entry at this stage)
  INSERT INTO public.payments (job_id, payer_id, payee_id, amount, platform_fee, status)
  VALUES (p_job_id, v_customer_id, v_tradie_id, v_amount_cents, v_fee_cents, 'pending')
  ON CONFLICT (job_id) DO UPDATE 
  SET amount = EXCLUDED.amount, platform_fee = EXCLUDED.platform_fee, status = 'pending';

END;
$$ LANGUAGE plpgsql;

-- 2. Re-define public.simulate_payment_funding with ledger insertion
CREATE OR REPLACE FUNCTION public.simulate_payment_funding(p_job_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_amount_cents integer;
BEGIN
  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- 1. Update payments status to held and retrieve details
  UPDATE public.payments
  SET status = 'held', updated_at = now()
  WHERE job_id = p_job_id
  RETURNING id, amount INTO v_payment_id, v_amount_cents;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;

  -- 2. Record the actual deposit/funding charge inside the transaction ledger
  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'charge', v_amount_cents);

  -- 3. Update jobs status to payment_held
  UPDATE public.jobs
  SET status = 'payment_held', updated_at = now()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;
