-- Migration: 009_quote_and_payment_lifecycle.sql
-- Description: Implement quote acceptance, variations, completion proofs, disputes, platform fees, payment ledger, and associated RLS policies.

-- ============================================================================
-- 1. Hardening existing tables check constraints
-- ============================================================================

-- Alter public.jobs table status check
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('open', 'accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed', 'cancelled'));

-- Alter public.payments table status check
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'held', 'released', 'refunded', 'failed'));

-- Add UNIQUE constraint on public.payments.job_id to enforce 1-to-1 relationship
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_job_id_key;
ALTER TABLE public.payments ADD CONSTRAINT payments_job_id_key UNIQUE (job_id);

-- Hardening Trigger for payments: support app.authorized_payment_update override
CREATE OR REPLACE FUNCTION public.protect_payment_fields()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If this is an authorized system update (e.g. from an RPC), bypass all checks
  IF current_setting('app.authorized_payment_update', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only restrict if the query comes from the client API (auth.uid() is not null)
  IF auth.uid() IS NOT NULL THEN
    IF NOT is_admin(auth.uid()) THEN
      -- Payer is allowed to update payment status/intent, but cannot change core details
      IF NEW.amount IS DISTINCT FROM OLD.amount THEN
        RAISE EXCEPTION 'Cannot modify payment amount.';
      END IF;
      IF NEW.payer_id IS DISTINCT FROM OLD.payer_id THEN
        RAISE EXCEPTION 'Cannot modify payment payer.';
      END IF;
      IF NEW.payee_id IS DISTINCT FROM OLD.payee_id THEN
        RAISE EXCEPTION 'Cannot modify payment payee.';
      END IF;
      IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
        RAISE EXCEPTION 'Cannot modify payment job ID.';
      END IF;
      IF NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION 'Cannot modify payment currency.';
      END IF;
      
      -- Payee (tradie) shouldn't be able to update status to "released" or "refunded" on their own
      IF auth.uid() = OLD.payee_id AND auth.uid() <> OLD.payer_id THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          RAISE EXCEPTION 'Payee cannot change payment status.';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Create new lifecycle tables
-- ============================================================================

-- TABLE: public.variations
-- Tracks extra work or material costs requested by tradies
CREATE TABLE IF NOT EXISTS public.variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, -- positive for extra cost, negative for discount
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actioned_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_variations_job_id ON public.variations(job_id);
CREATE INDEX IF NOT EXISTS idx_variations_status ON public.variations(status);

-- TABLE: public.job_completion_proofs
-- Tracks work completion submissions by tradies
CREATE TABLE IF NOT EXISTS public.job_completion_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tradie_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  attachments TEXT[], -- Array of URLs to files in a private bucket
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  auto_release_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proofs_job_id ON public.job_completion_proofs(job_id);

-- TABLE: public.job_issues
-- Tracks customer disputes raised during the 7-day window
CREATE TABLE IF NOT EXISTS public.job_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  proof_id UUID REFERENCES public.job_completion_proofs(id) ON DELETE SET NULL,
  raised_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_payout', 'resolved_refund', 'resolved_split')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  admin_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_issues_job_id ON public.job_issues(job_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON public.job_issues(status);

-- TABLE: public.payment_ledger
-- Financial ledger tracking deposits, payouts, fees, and refunds
CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('charge', 'payout', 'refund', 'fee')),
  amount_cents INTEGER NOT NULL,
  stripe_transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_payment_id ON public.payment_ledger(payment_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON public.payment_ledger(transaction_type);

-- ============================================================================
-- 3. Trigger helpers for new tables
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_variations_updated_at ON public.variations;
CREATE TRIGGER update_variations_updated_at
  BEFORE UPDATE ON public.variations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. Calculate Platform Fee function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_platform_fee(amount_cents INTEGER)
RETURNS INTEGER
AS $$
BEGIN
  -- 5% for jobs from $1–$500 (amount_cents <= 50000)
  -- 4% for jobs from $501–$2,000 (50000 < amount_cents <= 200000)
  -- 3% for jobs over $2,000 (amount_cents > 200000)
  IF amount_cents <= 50000 THEN
    RETURN ROUND(amount_cents * 0.05)::INTEGER;
  ELSIF amount_cents <= 200000 THEN
    RETURN ROUND(amount_cents * 0.04)::INTEGER;
  ELSE
    RETURN ROUND(amount_cents * 0.03)::INTEGER;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 5. Secure State Transition RPCs
-- ============================================================================

-- RPC: Accept Quote
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
  v_payment_id uuid;
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

  -- Insert/Upsert payment record
  INSERT INTO public.payments (job_id, payer_id, payee_id, amount, platform_fee, status)
  VALUES (p_job_id, v_customer_id, v_tradie_id, v_amount_cents, v_fee_cents, 'pending')
  ON CONFLICT (job_id) DO UPDATE 
  SET amount = EXCLUDED.amount, platform_fee = EXCLUDED.platform_fee, status = 'pending'
  RETURNING id INTO v_payment_id;

  -- Record initial deposit charge as pending in ledger
  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'charge', v_amount_cents);

END;
$$ LANGUAGE plpgsql;

-- RPC: Submit Completion Proof
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
  -- Get job status and verify caller is the assigned tradie
  SELECT status, payee_id INTO v_job_status, v_tradie_id
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

-- RPC: Raise Job Issue
CREATE OR REPLACE FUNCTION public.raise_job_issue(p_job_id uuid, p_description text)
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

  -- Insert job issue
  INSERT INTO public.job_issues (job_id, proof_id, raised_by, description, status)
  VALUES (p_job_id, v_proof_id, auth.uid(), p_description, 'open');

  -- Update job status to disputed
  UPDATE public.jobs SET status = 'disputed', updated_at = now() WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: Approve Job Completion
CREATE OR REPLACE FUNCTION public.approve_job_completion(p_job_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_payment_id uuid;
  v_amount_cents integer;
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

  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- Release the payment
  UPDATE public.payments
  SET status = 'released', updated_at = now()
  WHERE job_id = p_job_id
  RETURNING id, amount, platform_fee INTO v_payment_id, v_amount_cents, v_fee_cents;

  -- Record payout to tradie in ledger (amount minus platform fee)
  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'payout', v_amount_cents - v_fee_cents);

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

-- RPC: Submit Variation Request
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
  -- Get job status and verify caller is payee
  SELECT status, payee_id INTO v_job_status, v_tradie_id
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

-- RPC: Approve Variation
CREATE OR REPLACE FUNCTION public.approve_variation(p_variation_id uuid)
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
  -- Find variation and get job info
  SELECT v.job_id, v.amount_cents, v.status, j.customer_id
  INTO v_job_id, v_amount_cents, v_status, v_customer_id
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

  -- Update variation status to approved
  UPDATE public.variations
  SET status = 'approved', actioned_at = now()
  WHERE id = p_variation_id;

  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- Update payments table amount and recalculated platform fee
  UPDATE public.payments
  SET 
    amount = amount + v_amount_cents,
    platform_fee = calculate_platform_fee(amount + v_amount_cents),
    updated_at = now()
  WHERE job_id = v_job_id
  RETURNING id INTO v_payment_id;

  -- Record variation charge in ledger
  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'charge', v_amount_cents);

END;
$$ LANGUAGE plpgsql;

-- RPC: Reject Variation
CREATE OR REPLACE FUNCTION public.reject_variation(p_variation_id uuid, p_reason text)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_status text;
BEGIN
  -- Find variation and get job owner
  SELECT v.status, j.customer_id
  INTO v_status, v_customer_id
  FROM public.variations v
  JOIN public.jobs j ON j.id = v.job_id
  WHERE v.id = p_variation_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Variation not found.';
  END IF;
  IF v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can reject variations.';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Variation is already actioned.';
  END IF;

  -- Update variation status to rejected
  UPDATE public.variations
  SET 
    status = 'rejected', 
    actioned_at = now(),
    rejection_reason = p_reason
  WHERE id = p_variation_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: Resolve Dispute (Admin Only)
CREATE OR REPLACE FUNCTION public.resolve_dispute(p_job_id uuid, p_resolution text, p_split_percentage integer)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payer_id uuid;
  v_payee_id uuid;
  v_total_amount integer;
  v_platform_fee integer;
  v_payment_id uuid;
  v_split_payout integer;
  v_split_fee integer;
  v_split_refund integer;
BEGIN
  -- Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can resolve disputes.';
  END IF;

  -- Get payment info
  SELECT id, payer_id, payee_id, amount, platform_fee
  INTO v_payment_id, v_payer_id, v_payee_id, v_total_amount, v_platform_fee
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

  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- Update job and payment status based on split
  IF p_split_percentage = 100 THEN
    -- Full payout to tradie
    UPDATE public.payments SET status = 'released', updated_at = now() WHERE job_id = p_job_id;
    UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;
    
    -- Record full payout and full fee in ledger
    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'payout', v_total_amount - v_platform_fee);
    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'fee', v_platform_fee);
    
  ELSIF p_split_percentage = 0 THEN
    -- Full refund to customer
    UPDATE public.payments SET status = 'refunded', updated_at = now() WHERE job_id = p_job_id;
    UPDATE public.jobs SET status = 'cancelled', updated_at = now() WHERE id = p_job_id;
    
    -- Record full refund in ledger (no platform fee collected)
    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'refund', v_total_amount);
    
  ELSE
    -- Split payout
    UPDATE public.payments 
    SET status = 'released', updated_at = now()
    WHERE job_id = p_job_id;

    UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;

    -- Calculate split payouts and fees
    v_split_payout := ROUND((v_total_amount - v_platform_fee) * (p_split_percentage / 100.0))::integer;
    v_split_fee := ROUND(v_platform_fee * (p_split_percentage / 100.0))::integer;
    v_split_refund := v_total_amount - (v_split_payout + v_split_fee);

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

-- RPC: Simulate Payment Funding (DEV only)
CREATE OR REPLACE FUNCTION public.simulate_payment_funding(p_job_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- 1. Update payments status to held
  UPDATE public.payments
  SET status = 'held', updated_at = now()
  WHERE job_id = p_job_id;

  -- 2. Update jobs status to payment_held
  UPDATE public.jobs
  SET status = 'payment_held', updated_at = now()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Row Level Security (RLS) Policies
-- ============================================================================

-- Drop client-side direct update permissions on payments
DROP POLICY IF EXISTS "Payers can update own payments" ON public.payments;

-- Enable RLS on new tables
ALTER TABLE public.variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_completion_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;

-- variations RLS Policies
CREATE POLICY "Users view variations for own jobs" ON public.variations
  FOR SELECT USING (
    auth.uid() IN (
      SELECT customer_id FROM public.jobs WHERE id = job_id
      UNION
      SELECT tradie_id FROM public.applications WHERE id = application_id
    )
  );

CREATE POLICY "Tradies request variations for own jobs" ON public.variations
  FOR INSERT WITH CHECK (
    auth.uid() = requested_by
    AND EXISTS (
      SELECT 1 FROM public.payments
      WHERE job_id = public.variations.job_id
        AND payee_id = auth.uid()
    )
  );

CREATE POLICY "Customers update variations for own jobs" ON public.variations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE id = job_id AND customer_id = auth.uid()
    )
  );

-- job_completion_proofs RLS Policies
CREATE POLICY "Users view completion proofs for own jobs" ON public.job_completion_proofs
  FOR SELECT USING (
    auth.uid() IN (
      SELECT customer_id FROM public.jobs WHERE id = job_id
      UNION
      SELECT payee_id FROM public.payments WHERE job_id = job_id
    )
  );

CREATE POLICY "Tradies upload completion proofs for own jobs" ON public.job_completion_proofs
  FOR INSERT WITH CHECK (
    auth.uid() = tradie_id
    AND EXISTS (
      SELECT 1 FROM public.payments
      WHERE job_id = public.job_completion_proofs.job_id
        AND payee_id = auth.uid()
    )
  );

-- job_issues RLS Policies
CREATE POLICY "Users view issues for own jobs" ON public.job_issues
  FOR SELECT USING (
    auth.uid() IN (
      SELECT customer_id FROM public.jobs WHERE id = job_id
      UNION
      SELECT payee_id FROM public.payments WHERE job_id = job_id
    )
  );

CREATE POLICY "Customers raise issues for own jobs" ON public.job_issues
  FOR INSERT WITH CHECK (
    auth.uid() = raised_by
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE id = job_id AND customer_id = auth.uid()
    )
  );

-- payment_ledger RLS Policies
CREATE POLICY "Users view ledger entries for own payments" ON public.payment_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_id
        AND (p.payer_id = auth.uid() OR p.payee_id = auth.uid())
    )
  );

-- Admin override RLS Policies
CREATE POLICY "Admins view all variations" ON public.variations
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins view all completion proofs" ON public.job_completion_proofs
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins view all job issues" ON public.job_issues
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins update all job issues" ON public.job_issues
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Admins view all ledger entries" ON public.payment_ledger
  FOR SELECT USING (is_admin(auth.uid()));

-- ============================================================================
-- 7. Add Storage Bucket security policies for private 'completion_proofs' bucket
-- ============================================================================

-- Note: The 'completion_proofs' bucket will be created in Supabase storage.
-- We establish RLS policies on storage.objects to protect these uploads.

DROP POLICY IF EXISTS "Allow tradies to upload completion proofs" ON storage.objects;
CREATE POLICY "Allow tradies to upload completion proofs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'completion_proofs'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      -- Check if they are the contracted tradie on the job matching folder name: 'jobs/<job_id>/'
      SELECT 1 FROM public.payments
      WHERE payee_id = auth.uid()
        AND job_id::text = split_part(name, '/', 2)
    )
  );

DROP POLICY IF EXISTS "Allow job participants to view completion proofs" ON storage.objects;
CREATE POLICY "Allow job participants to view completion proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'completion_proofs'
    AND auth.role() = 'authenticated'
    AND (
      EXISTS (
        -- Job owner or payee (tradie) can select
        SELECT 1 FROM public.payments p
        JOIN public.jobs j ON j.id = p.job_id
        WHERE p.job_id::text = split_part(name, '/', 2)
          AND (p.payee_id = auth.uid() OR j.customer_id = auth.uid())
      )
      OR is_admin(auth.uid())
    )
  );
