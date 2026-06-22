-- Migration: 011_variation_funding_safety.sql
-- Description: Decouple variation approval from immediate funding, create simulation funding RPC, and base payouts on ledger charge totals.

-- ============================================================================
-- 1. Update Variations Status Constraint
-- ============================================================================

ALTER TABLE public.variations DROP CONSTRAINT IF EXISTS variations_status_check;
ALTER TABLE public.variations ADD CONSTRAINT variations_status_check
  CHECK (status IN ('pending', 'approved_awaiting_payment', 'approved', 'rejected'));

-- ============================================================================
-- 2. Refactor approve_variation RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_variation(p_variation_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_id uuid;
  v_status text;
BEGIN
  -- Find variation and get job info
  SELECT v.job_id, v.status, j.customer_id
  INTO v_job_id, v_status, v_customer_id
  FROM public.variations v
  JOIN public.jobs j ON j.id = v.job_id
  WHERE v.id = p_variation_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Variation not found.';
  END IF;
  IF v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can approve variations.';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Variation is already actioned.';
  END IF;

  -- Update variation status to approved_awaiting_payment (not fully approved/funded yet)
  UPDATE public.variations
  SET status = 'approved_awaiting_payment', actioned_at = now()
  WHERE id = p_variation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Create simulate_variation_funding RPC (Webhook / Payment Capture Emulator)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.simulate_variation_funding(p_variation_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_id uuid;
  v_amount_cents integer;
  v_status text;
  v_payment_id uuid;
BEGIN
  -- Find variation and associated details
  SELECT v.job_id, v.amount_cents, v.status, j.customer_id, p.id
  INTO v_job_id, v_amount_cents, v_status, v_customer_id, v_payment_id
  FROM public.variations v
  JOIN public.jobs j ON j.id = v.job_id
  JOIN public.payments p ON p.job_id = v.job_id
  WHERE v.id = p_variation_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Variation not found.';
  END IF;
  IF v_status <> 'approved_awaiting_payment' THEN
    RAISE EXCEPTION 'Variation must be approved by the customer and awaiting payment.';
  END IF;
  IF v_customer_id <> auth.uid() AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the job owner or an administrator can fund this variation.';
  END IF;

  -- Update variation status to fully approved/funded
  UPDATE public.variations
  SET status = 'approved', updated_at = now()
  WHERE id = p_variation_id;

  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- Update payments table amount and recalculated platform fee
  UPDATE public.payments
  SET 
    amount = amount + v_amount_cents,
    platform_fee = calculate_platform_fee(amount + v_amount_cents),
    updated_at = now()
  WHERE id = v_payment_id;

  -- Record variation charge in ledger
  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'charge', v_amount_cents);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Harden payout calculations (limit to actual ledger charges sum)
-- ============================================================================

-- Refactor approve_job_completion
CREATE OR REPLACE FUNCTION public.approve_job_completion(p_job_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_payment_id uuid;
  v_total_funded integer;
  v_fee_cents integer;
BEGIN
  -- Verify caller is the customer
  SELECT status, customer_id INTO v_job_status, v_customer_id
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;
  IF v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can approve completion.';
  END IF;
  IF v_job_status NOT IN ('payment_held', 'completed_pending_review', 'disputed') THEN
    RAISE EXCEPTION 'Job is not in a state that can be marked as completed.';
  END IF;

  -- Get payment ID
  SELECT id INTO v_payment_id FROM public.payments WHERE job_id = p_job_id;
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;

  -- Calculate total actually funded money from charge ledger entries
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_total_funded
  FROM public.payment_ledger
  WHERE payment_id = v_payment_id AND transaction_type = 'charge';

  IF v_total_funded <= 0 THEN
    RAISE EXCEPTION 'Cannot complete job: No funded payments exist in ledger.';
  END IF;

  -- Recalculate fee dynamically based on actual captured funding
  v_fee_cents := calculate_platform_fee(v_total_funded);

  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- Release the payment (lock amount and platform fee to actual funded values)
  UPDATE public.payments
  SET 
    status = 'released', 
    amount = v_total_funded,
    platform_fee = v_fee_cents,
    updated_at = now()
  WHERE id = v_payment_id;

  -- Record payout to tradie in ledger (funded amount minus platform fee)
  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'payout', v_total_funded - v_fee_cents);

  -- Record platform fee in ledger
  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'fee', v_fee_cents);

  -- Update job status to completed
  UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;

  -- Close any open issues
  UPDATE public.job_issues
  SET status = 'resolved_payout', resolved_at = now(), resolved_by = auth.uid(), admin_notes = 'Approved by customer'
  WHERE job_id = p_job_id AND status = 'open';
END;
$$ LANGUAGE plpgsql;


-- Refactor resolve_dispute
CREATE OR REPLACE FUNCTION public.resolve_dispute(p_job_id uuid, p_resolution text, p_split_percentage integer)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payer_id uuid;
  v_payee_id uuid;
  v_payment_id uuid;
  v_total_funded integer;
  v_platform_fee integer;
  v_split_payout integer;
  v_split_fee integer;
  v_split_refund integer;
BEGIN
  -- Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can resolve disputes.';
  END IF;

  -- Get payment info
  SELECT id, payer_id, payee_id
  INTO v_payment_id, v_payer_id, v_payee_id
  FROM public.payments
  WHERE job_id = p_job_id;

  IF v_payer_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;

  -- Verify job is in disputed status
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND status = 'disputed') THEN
    RAISE EXCEPTION 'Job is not in disputed status.';
  END IF;

  -- Check split percentage boundaries
  IF p_split_percentage < 0 OR p_split_percentage > 100 THEN
    RAISE EXCEPTION 'Split percentage must be between 0 and 100.';
  END IF;

  -- Calculate total actually funded money from charge ledger entries
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_total_funded
  FROM public.payment_ledger
  WHERE payment_id = v_payment_id AND transaction_type = 'charge';

  IF v_total_funded <= 0 THEN
    RAISE EXCEPTION 'Cannot resolve dispute: No funded payments exist in ledger.';
  END IF;

  -- Recalculate fee dynamically based on actual captured funding
  v_platform_fee := calculate_platform_fee(v_total_funded);

  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- Update job and payment status based on split (saving final actual amounts)
  IF p_split_percentage = 100 THEN
    -- Full payout to tradie
    UPDATE public.payments 
    SET 
      status = 'released', 
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now() 
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;
    
    -- Record full payout and full fee in ledger
    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'payout', v_total_funded - v_platform_fee);
    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'fee', v_platform_fee);
    
  ELSIF p_split_percentage = 0 THEN
    -- Full refund to customer
    UPDATE public.payments 
    SET 
      status = 'refunded', 
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now() 
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'cancelled', updated_at = now() WHERE id = p_job_id;
    
    -- Record full refund in ledger (no platform fee collected)
    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'refund', v_total_funded);
    
  ELSE
    -- Split payout
    UPDATE public.payments 
    SET 
      status = 'released', 
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now()
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;

    -- Calculate split payouts and fees
    v_split_payout := ROUND((v_total_funded - v_platform_fee) * (p_split_percentage / 100.0))::integer;
    v_split_fee := ROUND(v_platform_fee * (p_split_percentage / 100.0))::integer;
    v_split_refund := v_total_funded - (v_split_payout + v_split_fee);

    -- Record split payouts to tradie
    IF v_split_payout > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'payout', v_split_payout);
    END IF;

    -- Record split platform fee
    IF v_split_fee > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'fee', v_split_fee);
    END IF;

    -- Record split refund to customer
    IF v_split_refund > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'refund', v_split_refund);
    END IF;
  END IF;

  -- Update job issue to resolved
  UPDATE public.job_issues
  SET 
    status = CASE 
      WHEN p_split_percentage = 100 THEN 'resolved_payout'::text
      WHEN p_split_percentage = 0 THEN 'resolved_refund'::text
      ELSE 'resolved_split'::text
    END,
    resolved_at = now(),
    resolved_by = auth.uid(),
    admin_notes = p_resolution || ' (Split: ' || p_split_percentage::text || '% to tradie)'
  WHERE job_id = p_job_id AND status = 'open';
END;
$$ LANGUAGE plpgsql;
