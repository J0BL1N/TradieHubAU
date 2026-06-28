-- Migration: 054_allow_job_owner_payment_simulation.sql
-- Description: Allow job owners/customers to simulate payment and variation funding for their own jobs.

-- 1. Re-define public.simulate_payment_funding
CREATE OR REPLACE FUNCTION public.simulate_payment_funding(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_payment_id uuid;
  v_payment_status text;
  v_amount_cents integer;
  v_ledger_exists boolean;
BEGIN
  -- Fetch the job details first to verify customer ownership
  SELECT j.customer_id, j.status
  INTO v_customer_id, v_job_status
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- Authorization check: allow service role, admins, or the original job owner/customer
  IF COALESCE(auth.role(), '') <> 'service_role' 
     AND (auth.uid() IS NULL OR (NOT public.is_admin(auth.uid()) AND auth.uid() <> v_customer_id)) THEN
    RAISE EXCEPTION 'Only administrators or the job owner can run payment funding simulation.';
  END IF;

  SELECT p.id, p.status, p.amount
  INTO v_payment_id, v_payment_status, v_amount_cents
  FROM public.payments p
  WHERE p.job_id = p_job_id
  FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;

  IF v_job_status = 'payment_held' AND v_payment_status = 'held' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.payment_ledger pl
      WHERE pl.payment_id = v_payment_id
        AND pl.transaction_type = 'charge'
    )
    INTO v_ledger_exists;

    IF v_ledger_exists THEN
      RETURN;
    END IF;
  END IF;

  IF v_job_status <> 'accepted' THEN
    RAISE EXCEPTION 'Job status must be accepted to simulate payment funding.';
  END IF;

  IF v_payment_status <> 'pending' THEN
    RAISE EXCEPTION 'Payment status must be pending to simulate payment funding.';
  END IF;

  PERFORM set_config('app.authorized_payment_update', 'true', true);

  UPDATE public.payments
  SET status = 'held', updated_at = now()
  WHERE id = v_payment_id
    AND status = 'pending';

  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'charge', v_amount_cents);

  UPDATE public.jobs
  SET status = 'payment_held', updated_at = now()
  WHERE id = p_job_id
    AND status = 'accepted';

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    'payment_funded',
    'Protected payment funded - contract active.',
    jsonb_build_object('payment_id', v_payment_id)
  );
END;
$$;

-- 2. Re-define public.simulate_variation_funding
CREATE OR REPLACE FUNCTION public.simulate_variation_funding(p_variation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_id uuid;
  v_amount_cents integer;
  v_status text;
  v_payment_id uuid;
BEGIN
  -- Fetch variation details first to verify customer ownership
  SELECT v.job_id, v.amount_cents, v.status, j.customer_id, p.id
  INTO v_job_id, v_amount_cents, v_status, v_customer_id, v_payment_id
  FROM public.variations v
  JOIN public.jobs j ON j.id = v.job_id
  JOIN public.payments p ON p.job_id = v.job_id
  WHERE v.id = p_variation_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Variation not found.';
  END IF;

  -- Authorization check: allow service role, admins, or the original job owner/customer
  IF COALESCE(auth.role(), '') <> 'service_role' 
     AND (auth.uid() IS NULL OR (NOT public.is_admin(auth.uid()) AND auth.uid() <> v_customer_id)) THEN
    RAISE EXCEPTION 'Only administrators or the job owner can run variation funding simulation.';
  END IF;

  IF v_status <> 'approved_awaiting_payment' THEN
    RAISE EXCEPTION 'Variation must be approved by the customer and awaiting payment.';
  END IF;

  UPDATE public.variations
  SET status = 'approved', updated_at = now()
  WHERE id = p_variation_id;

  PERFORM set_config('app.authorized_payment_update', 'true', true);

  UPDATE public.payments
  SET
    amount = amount + v_amount_cents,
    platform_fee = public.calculate_platform_fee(amount + v_amount_cents),
    updated_at = now()
  WHERE id = v_payment_id;

  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'charge', v_amount_cents);
END;
$$;

-- 3. Grants and permissions for both functions
REVOKE ALL ON FUNCTION public.simulate_payment_funding(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.simulate_payment_funding(uuid) IS 'Allows administrators, the service_role, or the job owner to simulate funding a job payment during beta.';

REVOKE ALL ON FUNCTION public.simulate_variation_funding(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_variation_funding(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.simulate_variation_funding(uuid) IS 'Allows administrators, the service_role, or the job owner to simulate funding a variation payment during beta.';
