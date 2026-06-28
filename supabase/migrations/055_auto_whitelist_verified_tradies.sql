-- Migration: 055_auto_whitelist_verified_tradies.sql
-- Description: Automatically whitelist/approve a tradie profile once all required proofs are approved by admin.

-- 1. Helper function to check verification conditions and auto-approve the tradie profile
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

  -- Condition 1: User identity must be verified
  IF v_id_verified IS NOT TRUE THEN
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
  'Validates if a tradie has all required identity, license, insurance, ABN, and license number parameters, and whitelists them automatically.';

-- 2. Trigger function to orchestrate auto-whitelisting on document/profile updates
CREATE OR REPLACE FUNCTION public.trg_auto_whitelist_tradie()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid;
  v_tradie_verified boolean;
BEGIN
  -- Identify user ID based on trigger table
  IF TG_TABLE_NAME = 'verifications' THEN
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'users' THEN
    -- Optimization check: if user is already whitelisted, do nothing
    IF NEW.tradie_verified IS TRUE THEN
      RETURN NEW;
    END IF;

    -- Only check if identity verification, ABN, or Licence Number changed
    IF NEW.identity_verified IS NOT DISTINCT FROM OLD.identity_verified
       AND NEW.abn IS NOT DISTINCT FROM OLD.abn
       AND NEW.license_number IS NOT DISTINCT FROM OLD.license_number THEN
      RETURN NEW;
    END IF;

    v_user_id := NEW.id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    -- Perform final check to see if user is already verified
    SELECT tradie_verified INTO v_tradie_verified FROM public.users WHERE id = v_user_id;
    IF v_tradie_verified IS NOT TRUE THEN
      PERFORM public.check_and_auto_whitelist_tradie(v_user_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_auto_whitelist_tradie() IS
  'Trigger function running on update events on public.verifications or public.users to automatically whitelist eligible profiles.';

-- 3. Create triggers on verifications and users tables
DROP TRIGGER IF EXISTS trg_verifications_auto_whitelist ON public.verifications;
CREATE TRIGGER trg_verifications_auto_whitelist
  AFTER UPDATE OF status ON public.verifications
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION public.trg_auto_whitelist_tradie();

DROP TRIGGER IF EXISTS trg_users_auto_whitelist ON public.users;
CREATE TRIGGER trg_users_auto_whitelist
  AFTER UPDATE OF identity_verified, abn, license_number ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_whitelist_tradie();
