-- Migration: 028_finalize_critical_high_security_guards.sql
-- Description: Close two narrow regressions found during the v0.0.16 final
-- Critical/High review: enforce application column immutability in the caller's
-- execution context and serialize simulated payment funding retries.

-- ============================================================================
-- 1. H-02 follow-up: make the application guard execute as the invoking role.
-- ============================================================================
-- A SECURITY DEFINER trigger owned by postgres observes current_user = postgres,
-- including for direct Data API updates, which made the trusted-role bypass too
-- broad. SECURITY INVOKER preserves the bypass for trusted SECURITY DEFINER RPCs
-- such as accept_quote while enforcing the allowlist for authenticated clients.
CREATE OR REPLACE FUNCTION public.protect_application_updates()
RETURNS trigger
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid())) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.tradie_id THEN
    RAISE EXCEPTION 'Unauthorized to update this application.';
  END IF;

  IF OLD.status IS DISTINCT FROM 'pending' OR NEW.status IS DISTINCT FROM 'withdrawn' THEN
    RAISE EXCEPTION 'Invalid status transition. Tradies can only withdraw pending applications.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR
     NEW.job_id IS DISTINCT FROM OLD.job_id OR
     NEW.tradie_id IS DISTINCT FROM OLD.tradie_id OR
     NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
     NEW.estimate IS DISTINCT FROM OLD.estimate OR
     NEW.availability IS DISTINCT FROM OLD.availability OR
     NEW.message IS DISTINCT FROM OLD.message OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot modify immutable application fields upon withdrawal.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.protect_application_updates() IS
  'Runs as the invoking role so direct clients may only withdraw their own pending application without changing immutable fields; trusted lifecycle RPCs, service role, and admins retain their validated paths.';

-- ============================================================================
-- 2. C-03 follow-up: serialize funding attempts before idempotency checks.
-- ============================================================================
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Serialize all funding attempts for a job before checking authorization/state.
  SELECT j.customer_id, j.status
  INTO v_customer_id, v_job_status
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  IF v_customer_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the job owner or staff administrators can fund this job payment.';
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
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) TO authenticated;

COMMENT ON FUNCTION public.simulate_payment_funding(uuid) IS
  'Authenticated simulated funding path with ownership/admin authorization, locked state validation, and idempotent retry handling.';
