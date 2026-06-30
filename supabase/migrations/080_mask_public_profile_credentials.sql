-- Migration: 080_mask_public_profile_credentials.sql
-- Description: Mask abn, license_number, and website_url in public.public_profiles for unauthorized users.

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  role,
  display_name,
  avatar_url,
  avatar_url AS public_avatar_url,
  suburb,
  state,
  trades,
  CASE
    WHEN (
      auth.uid() = id
      OR public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.payments p
        WHERE (p.payer_id = auth.uid() AND p.payee_id = users.id)
           OR (p.payee_id = auth.uid() AND p.payer_id = users.id)
      )
    ) THEN abn
    ELSE NULL
  END AS abn,
  CASE
    WHEN (
      auth.uid() = id
      OR public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.payments p
        WHERE (p.payer_id = auth.uid() AND p.payee_id = users.id)
           OR (p.payee_id = auth.uid() AND p.payer_id = users.id)
      )
    ) THEN license_number
    ELSE NULL
  END AS license_number,
  verified,
  identity_verified,
  tradie_verified,
  show_location,
  business_name,
  headline,
  bio,
  years_experience,
  service_areas,
  CASE
    WHEN (
      auth.uid() = id
      OR public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.payments p
        WHERE (p.payer_id = auth.uid() AND p.payee_id = users.id)
           OR (p.payee_id = auth.uid() AND p.payer_id = users.id)
      )
    ) THEN website_url
    ELSE NULL
  END AS website_url,
  created_at,
  updated_at
FROM public.users;

-- Reset security_invoker to revert the view to standard security definer behavior.
ALTER VIEW public.public_profiles RESET (security_invoker);

-- Grant select permission to anon and authenticated
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Public sanitized profile directory with dynamic masking for ABN, License Number, and Website URL. Returns NULL unless the viewer is the profile owner, an admin, or has a payment record with the owner.';
