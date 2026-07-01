-- Migration: 091_supabase_lint_hardening.sql
-- Description: Harden database schema against Supabase Performance and Security lint warnings.
-- 1. Recreate views public_profiles and public_open_jobs with security_invoker = true.
--    - Recreates public_profiles to query a secure SECURITY DEFINER helper function public.get_public_profiles().
--      This satisfies the linter warning while allowing guests and customers to query public profile details without breaking RLS.
-- 2. Add explicit search_path to search_location_suburbs, get_location_regions, and censor_profanity.
-- 3. Revoke EXECUTE privileges from PUBLIC and anon on database trigger functions and internal helpers.

-- ============================================================================
-- 1. SECURE HELPER FUNCTION FOR PUBLIC_PROFILES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_profiles()
RETURNS TABLE (
  id UUID,
  role TEXT,
  display_name TEXT,
  avatar_url TEXT,
  public_avatar_url TEXT,
  suburb TEXT,
  state TEXT,
  trades TEXT[],
  abn TEXT,
  license_number TEXT,
  verified BOOLEAN,
  identity_verified BOOLEAN,
  tradie_verified BOOLEAN,
  show_location BOOLEAN,
  business_name TEXT,
  headline TEXT,
  bio TEXT,
  years_experience INTEGER,
  service_areas TEXT[],
  website_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.role,
    u.display_name,
    u.avatar_url,
    u.avatar_url AS public_avatar_url,
    u.suburb,
    u.state,
    u.trades,
    CASE
      WHEN (
        auth.uid() = u.id
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE (p.payer_id = auth.uid() AND p.payee_id = u.id)
             OR (p.payee_id = auth.uid() AND p.payer_id = u.id)
        )
      ) THEN u.abn
      ELSE NULL
    END AS abn,
    CASE
      WHEN (
        auth.uid() = u.id
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE (p.payer_id = auth.uid() AND p.payee_id = u.id)
             OR (p.payee_id = auth.uid() AND p.payer_id = u.id)
        )
      ) THEN u.license_number
      ELSE NULL
    END AS license_number,
    u.verified,
    u.identity_verified,
    u.tradie_verified,
    u.show_location,
    u.business_name,
    u.headline,
    u.bio,
    u.years_experience,
    u.service_areas,
    CASE
      WHEN (
        auth.uid() = u.id
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE (p.payer_id = auth.uid() AND p.payee_id = u.id)
             OR (p.payee_id = auth.uid() AND p.payer_id = u.id)
        )
      ) THEN u.website_url
      ELSE NULL
    END AS website_url,
    u.created_at,
    u.updated_at
  FROM public.users u;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_profiles() TO anon, authenticated, service_role;

-- ============================================================================
-- 2. RECREATE PUBLIC_PROFILES & PUBLIC_OPEN_JOBS VIEW AS SECURITY INVOKER
-- ============================================================================

CREATE OR REPLACE VIEW public.public_profiles 
WITH (security_invoker = true) 
AS
SELECT
  id,
  role,
  display_name,
  avatar_url,
  public_avatar_url,
  suburb,
  state,
  trades,
  abn,
  license_number,
  verified,
  identity_verified,
  tradie_verified,
  show_location,
  business_name,
  headline,
  bio,
  years_experience,
  service_areas,
  website_url,
  created_at,
  updated_at
FROM public.get_public_profiles();

GRANT SELECT ON public.public_profiles TO anon, authenticated;

CREATE OR REPLACE VIEW public.public_open_jobs
WITH (security_invoker = true)
AS
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

GRANT SELECT ON public.public_open_jobs TO anon, authenticated;

-- ============================================================================
-- 3. FIX MUTABLE SEARCH_PATH WARNINGS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_location_suburbs(
  p_state text default null,
  p_region_id uuid default null,
  p_region_name text default null,
  p_query text default null,
  p_limit int default 50
)
RETURNS TABLE (
  id uuid,
  suburb text,
  state text,
  postcode text,
  region_id uuid,
  region_name text,
  display_name text,
  latitude numeric,
  longitude numeric,
  is_verified boolean,
  source text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.suburb,
    s.state,
    s.postcode,
    s.region_id,
    s.region_name,
    s.display_name,
    s.latitude,
    s.longitude,
    s.is_verified,
    s.source
  FROM public.location_suburbs s
  WHERE s.is_active = true
    AND (p_state IS NULL OR s.state = p_state)
    AND (p_region_id IS NULL OR s.region_id = p_region_id)
    AND (p_region_name IS NULL OR s.region_name ILIKE p_region_name)
    AND (
      p_query IS NULL 
      OR s.suburb ILIKE p_query || '%'
      OR s.postcode LIKE p_query || '%'
      OR s.display_name ILIKE '%' || p_query || '%'
    )
  ORDER BY
    CASE 
      WHEN p_query IS NULL THEN 0
      WHEN lower(s.suburb) = lower(p_query) THEN 1
      WHEN s.postcode = p_query THEN 1
      WHEN s.suburb ILIKE p_query || '%' THEN 2
      WHEN s.postcode LIKE p_query || '%' THEN 2
      ELSE 3
    END ASC,
    s.is_verified DESC,
    s.suburb ASC,
    s.postcode ASC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_location_suburbs(text, uuid, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_location_suburbs(text, uuid, text, text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_location_regions(
  p_state text default null
)
RETURNS TABLE (
  id uuid,
  state text,
  region_name text,
  region_type text,
  is_verified boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.state,
    r.region_name,
    r.region_type,
    r.is_verified
  FROM public.location_regions r
  WHERE r.is_active = true
    AND (p_state IS NULL OR r.state = p_state)
  ORDER BY r.region_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_regions(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_regions(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.censor_profanity(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_words text[] := ARRAY['crap', 'shit', 'fuck', 'bitch', 'asshole', 'cunt', 'bastard', 'idiot', 'stupid'];
  v_word text;
  v_censored text;
  v_result text := p_text;
BEGIN
  IF p_text IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH v_word IN ARRAY v_words LOOP
    v_censored := repeat('*', char_length(v_word));
    v_result := regexp_replace(v_result, '\y' || v_word || '\y', v_censored, 'gi');
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.censor_profanity(text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. HARDEN TRIGGER PRIVILEGES & INTERNAL HELPERS
-- ============================================================================

-- Revoke execute on trigger functions from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.create_notification_on_application_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification_on_completion_proof() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification_on_dispute_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification_on_new_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification_on_payment_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification_on_verification_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_message_moderation() FROM PUBLIC, anon, authenticated;

-- Revoke execute on safe_completion_proof_attachments helper from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.safe_completion_proof_attachments(uuid, uuid, text[]) FROM PUBLIC, anon;
