-- Migration: 092_public_profile_identity_safety.sql
-- Description: Implement database-level safety middle ground for public profile/tradie browsing.
-- 1. Add reusable public utility functions:
--    - contains_contact_bypass_text(text) -> boolean (detects phone, email, websites, socials, off-platform phrases)
--    - safe_public_display_name(text, text) -> text (formats "John Smith" -> "John S.", handles beta cleanup)
--    - safe_public_profile_text(text) -> text (nulls text containing contact details)
-- 2. Update get_public_profiles() to only return safe display_name, null business_name/website_url, and cleaned text columns to unauthorized viewers.
-- 3. Add BEFORE INSERT OR UPDATE triggers on public.users to validate that public-facing fields contain no contact bypasses.
-- 4. Add BEFORE INSERT OR UPDATE triggers on public.job_completion_proofs to validate portfolio fields.
-- 5. Update list_public_tradie_completion_proof_gallery() to sanitize titles/captions dynamically.

-- ============================================================================
-- 1. ADD REUSABLE SAFE IDENTITY UTILITY FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.contains_contact_bypass_text(text);
DROP FUNCTION IF EXISTS public.contains_contact_bypass_text(text, boolean);

CREATE OR REPLACE FUNCTION public.contains_contact_bypass_text(p_text text, p_allow_url boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_digits_only text;
  v_no_x text;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN false;
  END IF;

  -- 1. Check direct regex matches on original text
  -- Email pattern
  IF p_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' THEN
    RETURN true;
  END IF;

  -- Social handles / mentions
  IF p_text ~* '\b(instagram|facebook|fb|tiktok|snapchat|whatsapp|insta|viber|telegram|line app|wechat)\b' THEN
    RETURN true;
  END IF;

  IF p_text ~* '@[[:alnum:]_]{2,}' THEN
    RETURN true;
  END IF;

  -- Bypass phrases
  IF p_text ~* '\b(google me|search me|look me up|find me on|call me|text me|message me on|pay cash|outside the app|off platform|off-platform|pay outside|contact me at|call my mobile|my phone number)\b' THEN
    RETURN true;
  END IF;

  -- URLs / Domains (only if not allowed)
  IF NOT p_allow_url THEN
    IF p_text ~* '\b(https?://|www\.)[^\s]+' THEN
      RETURN true;
    END IF;

    IF p_text ~* '\b[[:alnum:]-]+\.(com|net|org|biz|info|io|co|au|me|club|xyz|online|space|site|tech|website|work|company|app)\b' THEN
      RETURN true;
    END IF;
  END IF;

  -- 2. Advanced Phone / Digit pattern detection (including obfuscation)
  -- Clean text: lowercased, keep only digits and 'x'
  v_digits_only := regexp_replace(lower(p_text), '[^0-9x]', '', 'g');
  -- Clean version without 'x'
  v_no_x := regexp_replace(v_digits_only, 'x', '', 'g');

  -- If we find a 10-digit number starting with 0, or 9-digit number starting with 4, or 11/12-digit starting with 61
  IF v_no_x ~ '(^|[^0-9])0[0-9]{9}([^0-9]|$)' OR
     v_no_x ~ '(^|[^0-9])61[0-9]{9}([^0-9]|$)' OR
     v_no_x ~ '(^|[^0-9])[23478][0-9]{8}([^0-9]|$)' THEN
    RETURN true;
  END IF;

  -- Also match typical obfuscations directly on digits_only
  IF v_digits_only ~ '0x?4(x?[0-9]){8}' THEN
    RETURN true;
  END IF;

  -- Fallback to standard regexes on original text for spacing/hyphen variations
  IF p_text ~ '(^|[^0-9])(\+?61|0)[[:space:].()-]*[23478]([[:space:].()-]*[0-9]){8}([^0-9]|$)' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.contains_contact_bypass_text(text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contains_contact_bypass_text(text, boolean) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.contains_contact_bypass_text(text, boolean) IS 
'Scans input text for phone numbers (including obfuscated digits), email addresses, URLs/domains (unless p_allow_url is true), social handles, and known off-platform payment/contact instructions.';


CREATE OR REPLACE FUNCTION public.safe_public_display_name(p_display_name text, p_business_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_trimmed text;
  v_parts text[];
  v_first text;
  v_last_initial text;
  v_result text;
BEGIN
  v_trimmed := COALESCE(NULLIF(trim(p_display_name), ''), NULLIF(trim(p_business_name), ''));

  -- Strip starting/ending BETA indicators if they exist
  v_trimmed := regexp_replace(v_trimmed, '^\[?BETA\]?[:\-\s]*', '', 'i');
  v_trimmed := regexp_replace(v_trimmed, '[:\-\s]*\[?BETA\]?$', '', 'i');
  v_trimmed := regexp_replace(v_trimmed, '[\[\]]', '', 'g');
  v_trimmed := trim(v_trimmed);

  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RETURN 'Verified tradie';
  END IF;

  IF public.contains_contact_bypass_text(v_trimmed) THEN
    RETURN 'Verified tradie';
  END IF;

  v_parts := regexp_split_to_array(v_trimmed, '\s+');
  
  IF array_length(v_parts, 1) = 0 THEN
    RETURN 'Verified tradie';
  ELSIF array_length(v_parts, 1) = 1 THEN
    v_result := v_parts[1];
  ELSE
    v_first := v_parts[1];
    v_last_initial := upper(substring(v_parts[2] from 1 for 1));
    v_result := v_first || ' ' || v_last_initial || '.';
  END IF;

  IF public.contains_contact_bypass_text(v_result) THEN
    RETURN 'Verified tradie';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.safe_public_display_name(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_public_display_name(text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.safe_public_display_name(text, text) IS 
'Formats a display name to a safe public format (First name + last initial, e.g. John S.) to prevent google-searching/identifying individuals directly. Strips BETA terms.';


CREATE OR REPLACE FUNCTION public.safe_public_profile_text(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN NULL;
  END IF;
  
  IF public.contains_contact_bypass_text(p_text) THEN
    RETURN NULL;
  END IF;
  
  RETURN p_text;
END;
$$;

REVOKE ALL ON FUNCTION public.safe_public_profile_text(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_public_profile_text(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.safe_public_profile_text(text) IS 
'Returns input text only if it contains no contact bypass attempts, returning NULL otherwise.';


-- ============================================================================
-- 2. RECREATE GET_PUBLIC_PROFILES() FUNCTION WITH SECURED FIELD OUTPUTS
-- ============================================================================

-- We do NOT drop public.public_profiles view because other objects depend on it (e.g. RLS and storage policies).
-- Instead, we use CREATE OR REPLACE FUNCTION and CREATE OR REPLACE VIEW since the return signature is identical.
-- DROP VIEW IF EXISTS public.public_profiles;

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
    CASE
      WHEN (
        auth.uid() = u.id
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE (p.payer_id = auth.uid() AND p.payee_id = u.id)
             OR (p.payee_id = auth.uid() AND p.payer_id = u.id)
        )
      ) THEN u.display_name
      ELSE public.safe_public_display_name(u.display_name, u.business_name)
    END AS display_name,
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
    CASE
      WHEN (
        auth.uid() = u.id
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE (p.payer_id = auth.uid() AND p.payee_id = u.id)
             OR (p.payee_id = auth.uid() AND p.payer_id = u.id)
        )
      ) THEN u.business_name
      ELSE NULL
    END AS business_name,
    CASE
      WHEN (
        auth.uid() = u.id
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE (p.payer_id = auth.uid() AND p.payee_id = u.id)
             OR (p.payee_id = auth.uid() AND p.payer_id = u.id)
        )
      ) THEN u.headline
      ELSE public.safe_public_profile_text(u.headline)
    END AS headline,
    CASE
      WHEN (
        auth.uid() = u.id
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE (p.payer_id = auth.uid() AND p.payee_id = u.id)
             OR (p.payee_id = auth.uid() AND p.payer_id = u.id)
        )
      ) THEN u.bio
      ELSE public.safe_public_profile_text(u.bio)
    END AS bio,
    u.years_experience,
    CASE
      WHEN (
        auth.uid() = u.id
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.payments p
          WHERE (p.payer_id = auth.uid() AND p.payee_id = u.id)
             OR (p.payee_id = auth.uid() AND p.payer_id = u.id)
        )
      ) THEN u.service_areas
      ELSE 
        CASE 
          WHEN public.contains_contact_bypass_text(array_to_string(u.service_areas, ' ')) THEN NULL
          ELSE u.service_areas
        END
    END AS service_areas,
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

-- Recreate public_profiles view as security invoker
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


-- ============================================================================
-- 3. WRITE TRIGGERS TO PREVENT PUBLIC PROFILE INPUT LEAKS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_user_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    -- Check display_name
    IF NEW.display_name IS NOT NULL AND public.contains_contact_bypass_text(NEW.display_name) THEN
      RAISE EXCEPTION 'Public profile fields cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;

    -- Check business_name
    IF NEW.business_name IS NOT NULL AND public.contains_contact_bypass_text(NEW.business_name) THEN
      RAISE EXCEPTION 'Public profile fields cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;

    -- Check headline
    IF NEW.headline IS NOT NULL AND public.contains_contact_bypass_text(NEW.headline) THEN
      RAISE EXCEPTION 'Public profile fields cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;

    -- Check bio
    IF NEW.bio IS NOT NULL AND public.contains_contact_bypass_text(NEW.bio) THEN
      RAISE EXCEPTION 'Public profile fields cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;

    -- Check website_url
    IF NEW.website_url IS NOT NULL AND public.contains_contact_bypass_text(NEW.website_url, true) THEN
      RAISE EXCEPTION 'Public profile fields cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;

    -- Check service_areas
    IF NEW.service_areas IS NOT NULL AND array_length(NEW.service_areas, 1) > 0 THEN
      IF public.contains_contact_bypass_text(array_to_string(NEW.service_areas, ' ')) THEN
        RAISE EXCEPTION 'Public profile fields cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_user_profile_fields() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_user_profile_fields ON public.users;
CREATE TRIGGER trg_validate_user_profile_fields
  BEFORE INSERT OR UPDATE OF display_name, business_name, headline, bio, website_url, service_areas
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_user_profile_fields();


-- ============================================================================
-- 4. WRITE TRIGGERS TO PREVENT PORTFOLIO ITEMS INPUT LEAKS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_portfolio_item_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    -- Check title
    IF NEW.title IS NOT NULL AND public.contains_contact_bypass_text(NEW.title) THEN
      RAISE EXCEPTION 'Portfolio title cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;

    -- Check description
    IF NEW.description IS NOT NULL AND public.contains_contact_bypass_text(NEW.description) THEN
      RAISE EXCEPTION 'Portfolio caption/description cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_portfolio_item_fields() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_portfolio_item_fields ON public.tradie_portfolio_items;
CREATE TRIGGER trg_validate_portfolio_item_fields
  BEFORE INSERT OR UPDATE OF title, description
  ON public.tradie_portfolio_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_portfolio_item_fields();


CREATE OR REPLACE FUNCTION public.validate_completion_proof_portfolio_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    -- Check portfolio_title
    IF NEW.portfolio_title IS NOT NULL AND public.contains_contact_bypass_text(NEW.portfolio_title) THEN
      RAISE EXCEPTION 'Portfolio title cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;

    -- Check portfolio_caption
    IF NEW.portfolio_caption IS NOT NULL AND public.contains_contact_bypass_text(NEW.portfolio_caption) THEN
      RAISE EXCEPTION 'Portfolio caption cannot include phone numbers, emails, websites, social handles, or off-platform contact instructions.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_completion_proof_portfolio_fields() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_completion_proof_portfolio_fields ON public.job_completion_proofs;
CREATE TRIGGER trg_validate_completion_proof_portfolio_fields
  BEFORE INSERT OR UPDATE OF portfolio_title, portfolio_caption
  ON public.job_completion_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_completion_proof_portfolio_fields();


-- ============================================================================
-- 5. SANITIZE COMPLETION PROOF GALLERY DISPLAY RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_public_tradie_completion_proof_gallery(p_tradie_id uuid)
RETURNS TABLE (
  id uuid,
  job_title text,
  job_categories text[],
  job_suburb text,
  job_state text,
  completed_at timestamptz,
  created_at timestamptz,
  attachments text[],
  portfolio_title text,
  portfolio_caption text,
  portfolio_trade_category text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    jcp.id,
    j.title AS job_title,
    j.categories AS job_categories,
    j.suburb AS job_suburb,
    j.state AS job_state,
    j.updated_at AS completed_at,
    jcp.created_at,
    public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments) AS attachments,
    public.safe_public_profile_text(jcp.portfolio_title) AS portfolio_title,
    public.safe_public_profile_text(jcp.portfolio_caption) AS portfolio_caption,
    jcp.portfolio_trade_category
  FROM public.job_completion_proofs jcp
  JOIN public.jobs j ON j.id = jcp.job_id
  JOIN public.payments p ON p.job_id = j.id AND p.payee_id = jcp.tradie_id
  JOIN public.public_profiles pp ON pp.id = jcp.tradie_id
  WHERE jcp.tradie_id = p_tradie_id
    AND jcp.is_public_portfolio IS TRUE
    AND j.status = 'completed'
    AND p.status = 'released'
    AND pp.role IN ('tradie', 'dual')
    AND NOT EXISTS (
      SELECT 1
      FROM public.job_issues ji
      WHERE ji.job_id = j.id
        AND ji.status = 'open'
    )
    AND cardinality(public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments)) > 0
  ORDER BY COALESCE(jcp.portfolio_published_at, jcp.created_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_tradie_completion_proof_gallery(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_tradie_completion_proof_gallery(uuid) TO anon, authenticated, service_role;
