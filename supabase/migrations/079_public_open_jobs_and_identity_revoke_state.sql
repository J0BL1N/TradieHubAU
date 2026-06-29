-- Migration: 079_public_open_jobs_and_identity_revoke_state.sql
-- Description: Provide a public-safe open jobs surface and make identity revocation mark current ID docs for recheck.

CREATE OR REPLACE VIEW public.public_open_jobs AS
SELECT
  j.id,
  j.customer_id,
  j.title,
  j.description,
  j.categories,
  COALESCE(NULLIF(concat_ws(', ', NULLIF(btrim(j.suburb), ''), NULLIF(btrim(j.state), '')), ''), j.state) AS location,
  j.suburb,
  j.state,
  j.region,
  NULL::text AS postcode,
  COALESCE(NULLIF(concat_ws(', ', NULLIF(btrim(j.suburb), ''), NULLIF(btrim(j.state), '')), ''), j.state) AS location_label,
  j.budget_min,
  j.budget_max,
  j.estimated_budget,
  j.budget_type,
  j.workspace_image_count,
  j.timeline,
  j.urgency,
  j.type,
  j.status,
  j.quotes_count,
  j.created_at,
  j.updated_at
FROM public.jobs j
WHERE j.status = 'open';

ALTER VIEW public.public_open_jobs RESET (security_invoker);
GRANT SELECT ON public.public_open_jobs TO anon, authenticated;

COMMENT ON VIEW public.public_open_jobs IS
  'Public-safe open job browse/detail surface. Excludes postcode, street-level fallback location, private payment data, applications, evidence, invoices, and attachments.';

CREATE OR REPLACE FUNCTION public.suspend_identity_verification(target_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
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

  UPDATE public.verifications
  SET
    recheck_requested_at = COALESCE(recheck_requested_at, now()),
    recheck_reason = COALESCE(recheck_reason, 'Identity verification was revoked by an administrator. Please upload a replacement ID.'),
    recheck_requested_by = COALESCE(recheck_requested_by, auth.uid())
  WHERE user_id = target_user_id
    AND document_type IN ('drivers_license', 'passport', 'proof_of_age', 'other_identity', 'liveness_selfie')
    AND status = 'approved'
    AND recheck_requested_at IS NULL;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.suspend_identity_verification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_identity_verification(uuid) TO authenticated, service_role;
