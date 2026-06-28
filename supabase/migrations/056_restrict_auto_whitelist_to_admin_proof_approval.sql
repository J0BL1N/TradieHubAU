-- Migration: 056_restrict_auto_whitelist_to_admin_proof_approval.sql
-- Description: Drop the users auto-whitelist trigger to prevent normal profile edits from triggering whitelisting updates, and harden check_and_auto_whitelist_tradie to support identity document approvals robustly.

-- 1. Drop the users auto-whitelist trigger if it exists
DROP TRIGGER IF EXISTS trg_users_auto_whitelist ON public.users;

-- 2. Redefine the helper function check_and_auto_whitelist_tradie to check verifications for identity approval directly
CREATE OR REPLACE FUNCTION public.check_and_auto_whitelist_tradie(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_abn text;
  v_lic text;
  v_id_verified boolean;
  v_tradie_verified boolean;
BEGIN
  -- Fetch user profile details
  SELECT abn, license_number, identity_verified, tradie_verified
  INTO v_abn, v_lic, v_id_verified, v_tradie_verified
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- If already verified/whitelisted, do nothing
  IF v_tradie_verified IS TRUE THEN
    RETURN;
  END IF;

  -- Condition 1: User identity must be verified (either on the users table or via an approved document in verifications)
  IF v_id_verified IS NOT TRUE AND NOT EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = p_user_id
      AND document_type IN ('drivers_license', 'passport', 'proof_of_age', 'other_identity')
      AND status = 'approved'
  ) THEN
    RETURN;
  END IF;

  -- Condition 2: User must have entered an ABN
  IF v_abn IS NULL OR v_abn = '' THEN
    RETURN;
  END IF;

  -- Condition 3: User must have entered a Licence ID
  IF v_lic IS NULL OR v_lic = '' THEN
    RETURN;
  END IF;

  -- Condition 4: User must have an approved contractor license document
  IF NOT EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = p_user_id
      AND document_type = 'contractor_license'
      AND status = 'approved'
  ) THEN
    RETURN;
  END IF;

  -- Condition 5: User must have an approved insurance certificate document
  IF NOT EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = p_user_id
      AND document_type = 'insurance'
      AND status = 'approved'
  ) THEN
    RETURN;
  END IF;

  -- All required conditions are met. Call the existing whitelist function to execute role upgrades and set flags.
  PERFORM public.approve_tradie_profile(p_user_id);
END;
$$;

COMMENT ON FUNCTION public.check_and_auto_whitelist_tradie(uuid) IS
  'Validates if a tradie has all required identity (verified via users or verifications table), license, insurance, ABN, and license number parameters, and whitelists them automatically.';
