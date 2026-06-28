-- Migration: 065_add_verification_recheck_and_expiry_fields.sql
-- Description: Add fields to support verification document expiry and admin-requested rechecks.

ALTER TABLE public.verifications
ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recheck_requested_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recheck_reason text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recheck_requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.verifications.expires_at IS 'When the verification document expires or becomes stale.';
COMMENT ON COLUMN public.verifications.recheck_requested_at IS 'Timestamp when an admin requested a recheck.';
COMMENT ON COLUMN public.verifications.recheck_reason IS 'Reason why a recheck was requested by the admin.';
COMMENT ON COLUMN public.verifications.recheck_requested_by IS 'Admin user who requested the recheck.';

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
  SELECT abn, license_number, identity_verified, tradie_verified
  INTO v_abn, v_lic, v_id_verified, v_tradie_verified
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_tradie_verified IS TRUE THEN
    RETURN;
  END IF;

  IF (
    v_id_verified IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM public.verifications
      WHERE user_id = p_user_id
        AND document_type IN ('drivers_license', 'passport', 'proof_of_age', 'other_identity')
        AND status = 'approved'
        AND recheck_requested_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = p_user_id
      AND document_type IN ('drivers_license', 'passport', 'proof_of_age', 'other_identity')
      AND status = 'approved'
      AND (recheck_requested_at IS NOT NULL OR expires_at <= now())
  ) THEN
    RETURN;
  END IF;

  IF v_abn IS NULL OR btrim(v_abn) = '' THEN
    RETURN;
  END IF;

  IF v_lic IS NULL OR btrim(v_lic) = '' THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = p_user_id
      AND document_type = 'liveness_selfie'
      AND status = 'approved'
      AND recheck_requested_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = p_user_id
      AND document_type = 'contractor_license'
      AND status = 'approved'
      AND recheck_requested_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.verifications
    WHERE user_id = p_user_id
      AND document_type = 'insurance'
      AND status = 'approved'
      AND recheck_requested_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RETURN;
  END IF;

  PERFORM public.approve_tradie_profile(p_user_id);
END;
$$;

COMMENT ON FUNCTION public.check_and_auto_whitelist_tradie(uuid) IS
  'Validates future tradie whitelisting with approved identity, liveness, licence, and insurance documents, excluding expired or admin recheck-requested verification records.';
