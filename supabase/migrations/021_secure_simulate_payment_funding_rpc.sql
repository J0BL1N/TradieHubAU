-- Migration: 021_secure_simulate_payment_funding_rpc.sql
-- Description: Resolve Critical Issue C-03 by securing public.simulate_payment_funding RPC. Enforces caller authentication, job ownership or admin privileges, state validation, transaction idempotency, and explicit execute permission grants.

-- 1. Re-define public.simulate_payment_funding RPC function with full security constraints
CREATE OR REPLACE FUNCTION public.simulate_payment_funding(p_job_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_payment_id uuid;
  v_payment_status text;
  v_amount_cents integer;
  v_ledger_exists boolean;
BEGIN
  -- A. Authentication check: Enforce authenticated session
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- B. Retrieve job status and customer ID
  SELECT customer_id, status INTO v_customer_id, v_job_status
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- C. Authorization check: Must be the job owner (customer) or a staff administrator
  IF v_customer_id <> auth.uid() AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the job owner or staff administrators can fund this job payment.';
  END IF;

  -- D. Retrieve payment details
  SELECT id, status, amount INTO v_payment_id, v_payment_status, v_amount_cents
  FROM public.payments
  WHERE job_id = p_job_id;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;

  -- E. Idempotency Guard: If the job and payment are already in the funded state, return safely
  -- This prevents double-funding and duplicate ledger charge entries on subsequent retries or lag.
  IF v_job_status = 'payment_held' AND v_payment_status = 'held' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payment_ledger
      WHERE payment_id = v_payment_id AND transaction_type = 'charge'
    ) INTO v_ledger_exists;
    
    IF v_ledger_exists THEN
      -- Already fully funded, return successfully (idempotent success)
      RETURN;
    END IF;
  END IF;

  -- F. State Validation: Ensure the job and payment are in their correct preceding states
  IF v_job_status <> 'accepted' THEN
    RAISE EXCEPTION 'Job status must be accepted to simulate payment funding.';
  END IF;

  IF v_payment_status <> 'pending' THEN
    RAISE EXCEPTION 'Payment status must be pending to simulate payment funding.';
  END IF;

  -- G. Execute simulated funding updates
  -- Enable session variable bypass for payment trigger
  PERFORM set_config('app.authorized_payment_update', 'true', true);

  -- Update payment status to 'held'
  UPDATE public.payments
  SET status = 'held', updated_at = now()
  WHERE id = v_payment_id;

  -- Record the actual deposit/funding charge inside the transaction ledger
  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'charge', v_amount_cents);

  -- Update job status to 'payment_held'
  UPDATE public.jobs
  SET status = 'payment_held', updated_at = now()
  WHERE id = p_job_id;

END;
$$ LANGUAGE plpgsql;

-- 2. Revoke public/anon execute permissions to prevent unauthenticated access
REVOKE EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) FROM PUBLIC;

-- 3. Grant execute permissions explicitly to authenticated role for local UI simulation
GRANT EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) TO authenticated;

-- 4. Explanatory comments:
-- This function is a simulated MVP funding helper designed for local/demo workflows.
-- It acts as a mock for real provider webhook processing. In a real integration,
-- this logic would be run by webhook integration handlers using a secure service role
-- rather than direct client-initiated RPC execution.
