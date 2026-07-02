-- Migration: 094_trade_verification_live_patch.sql
-- Description: Safe recovery patch containing audit-hardening database gating functions and application RLS policies on top of original 093 tables.

-- ============================================================================
-- Database-level quote/application gating by trade licences
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_user_has_required_licences(p_user_id uuid, p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_state varchar(3);
  v_job_categories text[];
  v_category text;
  v_req_licence_id uuid;
  v_level text;
  v_has_approved_unexpired boolean;
  v_user_trades text[];
  v_hard_gated_categories text[] := ARRAY[
    'electrical', 'electrician', 'electrical_contractor',
    'plumbing', 'plumber', 'gasfitting', 'gasfitter', 'roof_plumbing',
    'building', 'builder', 'hvac', 'pest_control', 'asbestos_removal',
    'demolition', 'solar_installer', 'security_installer'
  ];
BEGIN
  -- 1. Get user state & trades
  SELECT state, trades INTO v_user_state, v_user_trades FROM public.users WHERE id = p_user_id;
  IF v_user_state IS NULL THEN
    v_user_state := 'VIC'; -- fallback
  END IF;

  -- 2. Get job categories
  SELECT categories INTO v_job_categories FROM public.jobs WHERE id = p_job_id;
  IF v_job_categories IS NULL OR array_length(v_job_categories, 1) IS NULL THEN
    RETURN true;
  END IF;

  -- 3. Loop through categories
  FOREACH v_category IN ARRAY v_job_categories LOOP
    -- Handyman block: Handyman cannot quote on hard-gated categories
    IF (v_user_trades && ARRAY['handyman']) AND (v_category = ANY(v_hard_gated_categories)) THEN
      RETURN false;
    END IF;

    -- Check if there's a rule requiring a licence
    SELECT licence_requirement_level, required_licence_type_id
    INTO v_level, v_req_licence_id
    FROM public.trade_requirement_rules
    WHERE trade_id = v_category AND state_code = v_user_state;

    IF v_level = 'required' AND v_req_licence_id IS NOT NULL THEN
      -- Check if user has an approved, unexpired credential of this type
      SELECT EXISTS (
        SELECT 1
        FROM public.user_trade_credentials
        WHERE user_id = p_user_id
          AND licence_type_id = v_req_licence_id
          AND status = 'approved'
          AND expiry_date > CURRENT_DATE
      ) INTO v_has_approved_unexpired;

      IF NOT v_has_approved_unexpired THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- Revoke and grant explicit permissions on the gating check function
REVOKE ALL ON FUNCTION public.check_user_has_required_licences(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_user_has_required_licences(uuid, uuid) TO authenticated, service_role;

-- Recreate applications insert policy to enforce trade licensing check
DROP POLICY IF EXISTS "Verified tradies can create applications" ON public.applications;
CREATE POLICY "Verified tradies can create applications"
  ON public.applications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('tradie', 'dual')
        AND u.identity_verified = true
        AND u.tradie_verified = true
        AND (u.application_restricted_until IS NULL OR u.application_restricted_until < now())
        AND (u.account_review_hold_until IS NULL OR u.account_review_hold_until < now())
    )
    AND customer_id = (
      SELECT j.customer_id
      FROM public.jobs j
      WHERE j.id = job_id
    )
    AND auth.uid() <> (
      SELECT j.customer_id
      FROM public.jobs j
      WHERE j.id = job_id
    )
    -- Enforce the database-level trade licence gating
    AND public.check_user_has_required_licences(auth.uid(), job_id)
  );
