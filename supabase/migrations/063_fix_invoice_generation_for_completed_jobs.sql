-- Migration: 063_fix_invoice_generation_for_completed_jobs.sql
-- Description: Implement ensure_job_invoices function, dual triggers on jobs/payments, secure get_my_job_invoice RPC, and backfill.

-- 1. Create or update ensure_job_invoices function
CREATE OR REPLACE FUNCTION public.ensure_job_invoices(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_short_id text;
  v_receipt_num text;
  v_payout_num text;
BEGIN
  -- Load job and verify eligibility
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  IF v_job.status != 'completed' THEN
    RETURN;
  END IF;

  -- Load payment and verify eligibility
  SELECT * INTO v_payment FROM public.payments WHERE job_id = p_job_id LIMIT 1;
  IF v_payment.id IS NULL OR v_payment.status != 'released' THEN
    RETURN;
  END IF;

  -- Check for open disputes/issues
  IF EXISTS (
    SELECT 1 FROM public.job_issues
    WHERE job_id = p_job_id AND status = 'open'
  ) THEN
    RETURN;
  END IF;

  -- Generate deterministic short ID (first 8 chars of job UUID)
  v_short_id := substring(p_job_id::text from 1 for 8);
  v_receipt_num := 'THAU-' || v_short_id || '-REC';
  v_payout_num := 'THAU-' || v_short_id || '-PAY';

  -- Insert Customer Receipt
  INSERT INTO public.job_invoices (
    job_id, payer_id, payee_id, payment_id, invoice_type, invoice_number, 
    amount_cents, platform_fee_cents, payout_amount_cents
  )
  VALUES (
    p_job_id, v_job.customer_id, v_payment.payee_id, v_payment.id, 'customer_receipt', v_receipt_num,
    v_payment.amount, v_payment.platform_fee, (v_payment.amount - v_payment.platform_fee)
  )
  ON CONFLICT (invoice_number) DO NOTHING;

  -- Insert Tradie Payout Statement
  INSERT INTO public.job_invoices (
    job_id, payer_id, payee_id, payment_id, invoice_type, invoice_number, 
    amount_cents, platform_fee_cents, payout_amount_cents
  )
  VALUES (
    p_job_id, v_job.customer_id, v_payment.payee_id, v_payment.id, 'tradie_payout_statement', v_payout_num,
    v_payment.amount, v_payment.platform_fee, (v_payment.amount - v_payment.platform_fee)
  )
  ON CONFLICT (invoice_number) DO NOTHING;
END;
$$;

-- Revoke general execution privileges on the ensure function
REVOKE ALL ON FUNCTION public.ensure_job_invoices(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_job_invoices(uuid) TO service_role;

-- 2. Drop legacy trigger and create updated trigger on payments
DROP TRIGGER IF EXISTS trg_generate_invoices_on_payment_release ON public.payments;

CREATE OR REPLACE FUNCTION public.trg_generate_invoices_on_payment_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'released' AND (OLD.status IS NULL OR OLD.status != 'released') THEN
    PERFORM public.ensure_job_invoices(NEW.job_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_invoices_on_payment_release
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_generate_invoices_on_payment_release();

-- 3. Create trigger on jobs table to handle job completion
DROP TRIGGER IF EXISTS trg_ensure_invoices_on_job_completed ON public.jobs;

CREATE OR REPLACE FUNCTION public.trg_ensure_invoices_on_job_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM public.ensure_job_invoices(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_invoices_on_job_completed
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ensure_invoices_on_job_completed();

-- 4. Create secure RPC for fetching a user's job invoice details safely
CREATE OR REPLACE FUNCTION public.get_my_job_invoice(p_job_id uuid, p_invoice_type text)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  payer_id uuid,
  payee_id uuid,
  payment_id uuid,
  invoice_type text,
  invoice_number text,
  amount_cents integer,
  platform_fee_cents integer,
  payout_amount_cents integer,
  issued_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current_user uuid;
  v_is_admin boolean;
BEGIN
  v_current_user := auth.uid();
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  v_is_admin := public.is_admin(v_current_user);

  -- Perform idempotent generation check on the fly to auto-heal
  PERFORM public.ensure_job_invoices(p_job_id);

  RETURN QUERY
  SELECT 
    ji.id,
    ji.job_id,
    ji.payer_id,
    ji.payee_id,
    ji.payment_id,
    ji.invoice_type,
    ji.invoice_number,
    ji.amount_cents,
    ji.platform_fee_cents,
    ji.payout_amount_cents,
    ji.issued_at,
    ji.created_at,
    ji.updated_at
  FROM public.job_invoices ji
  WHERE ji.job_id = p_job_id
    AND ji.invoice_type = p_invoice_type
    AND (
      v_is_admin
      OR (ji.payer_id = v_current_user AND p_invoice_type = 'customer_receipt')
      OR (ji.payee_id = v_current_user AND p_invoice_type = 'tradie_payout_statement')
    );
END;
$$;

-- Secure execute permissions on the RPC
REVOKE ALL ON FUNCTION public.get_my_job_invoice(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_job_invoice(uuid, text) TO authenticated;

-- 5. Backfill missing invoice rows for all existing completed & released jobs
DO $$
DECLARE
  v_job_id uuid;
BEGIN
  FOR v_job_id IN
    SELECT j.id
    FROM public.jobs j
    JOIN public.payments p ON p.job_id = j.id
    WHERE j.status = 'completed'
      AND p.status = 'released'
  LOOP
    PERFORM public.ensure_job_invoices(v_job_id);
  END LOOP;
END;
$$;
