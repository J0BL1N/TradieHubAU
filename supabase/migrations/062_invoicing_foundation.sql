-- Migration: 062_invoicing_foundation.sql
-- Description: Add job_invoices table, automatic generation on payment release, RLS, and backfill.

-- 1. Create Invoices Table
CREATE TABLE IF NOT EXISTS public.job_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  payee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_type text NOT NULL CHECK (invoice_type IN ('customer_receipt', 'tradie_payout_statement')),
  invoice_number text UNIQUE NOT NULL,
  amount_cents integer NOT NULL,
  platform_fee_cents integer DEFAULT 0,
  payout_amount_cents integer NOT NULL,
  issued_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.job_invoices ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY "Customers view own receipts" ON public.job_invoices
  FOR SELECT USING (
    auth.uid() = payer_id AND invoice_type = 'customer_receipt'
  );

CREATE POLICY "Tradies view own statements" ON public.job_invoices
  FOR SELECT USING (
    auth.uid() = payee_id AND invoice_type = 'tradie_payout_statement'
  );

CREATE POLICY "Admins view all invoices" ON public.job_invoices
  FOR SELECT TO authenticated USING (
    public.is_admin(auth.uid())
  );

-- 4. Generator function (Idempotent)
CREATE OR REPLACE FUNCTION public.generate_job_invoices(p_job_id uuid)
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

-- Revoke general execution privileges
REVOKE ALL ON FUNCTION public.generate_job_invoices(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_job_invoices(uuid) TO service_role;

-- 5. Trigger after update on payments
CREATE OR REPLACE FUNCTION public.trg_generate_invoices_on_payment_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'released' AND (OLD.status IS NULL OR OLD.status != 'released') THEN
    PERFORM public.generate_job_invoices(NEW.job_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_generate_invoices_on_payment_release
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_generate_invoices_on_payment_release();

-- 6. Backfill existing completed & released jobs
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
    PERFORM public.generate_job_invoices(v_job_id);
  END LOOP;
END;
$$;
