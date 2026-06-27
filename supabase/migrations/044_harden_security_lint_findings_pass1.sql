-- Migration: 044_harden_security_lint_findings_pass1.sql
-- Description: Pass 1 hardening for Supabase security lint findings.
-- - Remove anonymous execution of public.is_admin(uuid)
-- - Keep public/guest RLS paths from needing anon is_admin execution
-- - Add explicit safe search_path to edited functions
-- - Harden admin-only and beta simulation RPCs with in-function admin checks

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.is_admin IS TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Returns true only for the current authenticated user when their profile is marked admin. Anonymous callers cannot execute this helper.';

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_platform_fee(amount_cents integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF amount_cents <= 50000 THEN
    RETURN round(amount_cents * 0.05)::integer;
  ELSIF amount_cents <= 200000 THEN
    RETURN round(amount_cents * 0.04)::integer;
  ELSE
    RETURN round(amount_cents * 0.03)::integer;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_platform_fee(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_platform_fee(integer) TO service_role;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS policies that previously evaluated is_admin(auth.uid()) for anonymous
-- callers. Guard admin checks behind authenticated-only predicates so anon
-- public reads do not require EXECUTE on public.is_admin(uuid).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users view own or participant profile" ON public.users;
CREATE POLICY "Users view own or participant profile" ON public.users
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE (
        (p.payer_id = auth.uid() AND p.payee_id = users.id)
        OR (p.payee_id = auth.uid() AND p.payer_id = users.id)
      )
    )
  );

DROP POLICY IF EXISTS "Admins view all user profiles" ON public.users;
CREATE POLICY "Admins view all user profiles" ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all verifications" ON public.verifications;
CREATE POLICY "Admins can view all verifications" ON public.verifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all verifications" ON public.verifications;
CREATE POLICY "Admins can update all verifications" ON public.verifications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all variations" ON public.variations;
CREATE POLICY "Admins view all variations" ON public.variations
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all completion proofs" ON public.job_completion_proofs;
CREATE POLICY "Admins view all completion proofs" ON public.job_completion_proofs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all job issues" ON public.job_issues;
CREATE POLICY "Admins view all job issues" ON public.job_issues
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update all job issues" ON public.job_issues;
CREATE POLICY "Admins update all job issues" ON public.job_issues
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all ledger entries" ON public.payment_ledger;
CREATE POLICY "Admins view all ledger entries" ON public.payment_ledger
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow admins to read all verifications" ON storage.objects;
CREATE POLICY "Allow admins to read all verifications" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verifications'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Allow job participants to view completion proofs" ON storage.objects;
CREATE POLICY "Allow job participants to view completion proofs" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'completion_proofs'
    AND (
      EXISTS (
        SELECT 1
        FROM public.payments p
        JOIN public.jobs j ON j.id = p.job_id
        WHERE p.job_id::text = split_part(name, '/', 2)
          AND (p.payee_id = auth.uid() OR j.customer_id = auth.uid())
      )
      OR public.is_admin(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Admin-only verification RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_identity_verification(v_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id uuid;
  doc_type text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can approve verifications.';
  END IF;

  SELECT user_id, document_type
  INTO target_user_id, doc_type
  FROM public.verifications
  WHERE id = v_id;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Verification record not found.';
  END IF;

  IF doc_type NOT IN ('drivers_license', 'passport', 'proof_of_age', 'other_identity') THEN
    RAISE EXCEPTION 'Document is not a valid identity verification document.';
  END IF;

  UPDATE public.verifications
  SET
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  WHERE id = v_id;

  UPDATE public.users
  SET
    identity_verified = true,
    verified = true
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_tradie_profile(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_abn text;
  v_lic text;
  v_id_verified boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can whitelist tradie profiles.';
  END IF;

  SELECT abn, license_number, identity_verified
  INTO v_abn, v_lic, v_id_verified
  FROM public.users
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  IF v_id_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'User identity must be verified before approving tradie whitelisting.';
  END IF;

  IF v_abn IS NULL OR v_abn = '' THEN
    RAISE EXCEPTION 'User must have a valid ABN entered to be whitelisted.';
  END IF;

  IF v_lic IS NULL OR v_lic = '' THEN
    RAISE EXCEPTION 'User must have a valid Licence ID entered to be whitelisted.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = target_user_id
      AND document_type = 'contractor_license'
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'User must have an approved contractor license document to be whitelisted.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = target_user_id
      AND document_type = 'insurance'
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'User must have an approved insurance certificate document to be whitelisted.';
  END IF;

  UPDATE public.users
  SET
    tradie_verified = true,
    role = CASE WHEN role = 'customer' THEN 'tradie' ELSE role END
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_tradie_profile(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can suspend tradie profiles.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  UPDATE public.users
  SET
    tradie_verified = false,
    role = CASE WHEN role = 'tradie' THEN 'customer' ELSE role END
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_identity_verification(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can revoke identity verifications.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  UPDATE public.users
  SET
    identity_verified = false,
    verified = false
  WHERE id = target_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Beta/dev payment simulation RPCs. These are not customer-facing production
-- payment APIs. Keep service-role operational access and require admin sessions
-- for any direct authenticated invocation.
-- ---------------------------------------------------------------------------

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
  IF COALESCE(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can run payment funding simulation.';
  END IF;

  SELECT j.customer_id, j.status
  INTO v_customer_id, v_job_status
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
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
  IF COALESCE(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators can run variation funding simulation.';
  END IF;

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

-- ---------------------------------------------------------------------------
-- Admin-only dispute RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_dispute(p_job_id uuid, p_resolution text, p_split_percentage integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can resolve disputes.';
  END IF;

  SELECT id, payer_id, payee_id
  INTO v_payment_id, v_payer_id, v_payee_id
  FROM public.payments
  WHERE job_id = p_job_id;

  IF v_payer_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND status = 'disputed') THEN
    RAISE EXCEPTION 'Job is not in disputed status.';
  END IF;

  IF p_split_percentage < 0 OR p_split_percentage > 100 THEN
    RAISE EXCEPTION 'Split percentage must be between 0 and 100.';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0)
  INTO v_total_funded
  FROM public.payment_ledger
  WHERE payment_id = v_payment_id AND transaction_type = 'charge';

  IF v_total_funded <= 0 THEN
    RAISE EXCEPTION 'Cannot resolve dispute: No funded payments exist in ledger.';
  END IF;

  v_platform_fee := public.calculate_platform_fee(v_total_funded);

  PERFORM set_config('app.authorized_payment_update', 'true', true);

  IF p_split_percentage = 100 THEN
    UPDATE public.payments
    SET
      status = 'released',
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now()
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;

    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'payout', v_total_funded - v_platform_fee);
    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'fee', v_platform_fee);

  ELSIF p_split_percentage = 0 THEN
    UPDATE public.payments
    SET
      status = 'refunded',
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now()
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'cancelled', updated_at = now() WHERE id = p_job_id;

    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'refund', v_total_funded);

  ELSE
    UPDATE public.payments
    SET
      status = 'released',
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now()
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;

    v_split_payout := round((v_total_funded - v_platform_fee) * (p_split_percentage / 100.0))::integer;
    v_split_fee := round(v_platform_fee * (p_split_percentage / 100.0))::integer;
    v_split_refund := v_total_funded - (v_split_payout + v_split_fee);

    IF v_split_payout > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'payout', v_split_payout);
    END IF;

    IF v_split_fee > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'fee', v_split_fee);
    END IF;

    IF v_split_refund > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'refund', v_split_refund);
    END IF;
  END IF;

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

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    'admin_dispute_resolved',
    'Admin resolved the dispute.',
    jsonb_build_object(
      'payment_id', v_payment_id,
      'split_percentage', p_split_percentage
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_admin_dispute_action(
  p_job_id uuid,
  p_action text,
  p_admin_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_issue_id uuid;
  v_message_text text;
  v_event_type text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can update dispute actions.';
  END IF;

  IF p_action NOT IN ('request_evidence', 'escalate') THEN
    RAISE EXCEPTION 'Unsupported admin dispute action.';
  END IF;

  IF btrim(COALESCE(p_admin_notes, '')) = '' THEN
    RAISE EXCEPTION 'Admin notes are required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND status = 'disputed') THEN
    RAISE EXCEPTION 'Job is not in disputed status.';
  END IF;

  UPDATE public.job_issues
  SET admin_notes = btrim(p_admin_notes)
  WHERE job_id = p_job_id
    AND status = 'open'
  RETURNING id INTO v_issue_id;

  IF v_issue_id IS NULL THEN
    RAISE EXCEPTION 'This dispute is no longer open. Refresh the case before adding notes.';
  END IF;

  IF p_action = 'request_evidence' THEN
    v_event_type := 'admin_requested_more_evidence';
    v_message_text := 'Admin requested more evidence.';
  ELSE
    v_event_type := 'admin_escalated_dispute';
    v_message_text := 'Admin escalated the dispute.';
  END IF;

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    v_event_type,
    v_message_text,
    jsonb_build_object('issue_id', v_issue_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Explicit RPC grants after redefinition.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.approve_identity_verification(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_tradie_profile(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.suspend_tradie_profile(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.suspend_identity_verification(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_dispute(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_admin_dispute_action(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.simulate_payment_funding(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.simulate_variation_funding(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.approve_identity_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_tradie_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_tradie_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_identity_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_admin_dispute_action(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_variation_funding(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.simulate_payment_funding(uuid) IS
  'Restricted beta/dev payment funding simulation. Direct authenticated execution requires an admin session; service role is reserved for trusted backend simulation only.';
COMMENT ON FUNCTION public.simulate_variation_funding(uuid) IS
  'Restricted beta/dev variation funding simulation. Direct authenticated execution requires an admin session; service role is reserved for trusted backend simulation only.';
