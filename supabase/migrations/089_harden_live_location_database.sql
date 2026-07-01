-- Migration: 089_harden_live_location_database.sql
-- Description: Enforce security hardening on the location database tables and RPC functions for live environments.

-- 1. Table RLS checks & hardening
ALTER TABLE public.location_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_suburbs ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke write privileges from public, anon, and authenticated roles to prevent any client write path
REVOKE INSERT, UPDATE, DELETE ON TABLE public.location_regions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.location_suburbs FROM PUBLIC, anon, authenticated;

-- Drop and recreate the SELECT policies to be clean and idempotent
DROP POLICY IF EXISTS "Allow public select on location_regions" ON public.location_regions;
CREATE POLICY "Allow public select on location_regions"
  ON public.location_regions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow public select on location_suburbs" ON public.location_suburbs;
CREATE POLICY "Allow public select on location_suburbs"
  ON public.location_suburbs FOR SELECT
  USING (true);

-- 2. Recreate or replace search_location_suburbs RPC function
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

-- 3. Recreate or replace get_location_regions RPC function
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

-- 4. Enforce strict explicit execution privileges
REVOKE ALL ON FUNCTION public.search_location_suburbs(text, uuid, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_location_suburbs(text, uuid, text, text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_location_regions(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_regions(text) TO anon, authenticated, service_role;

-- 5. Idempotent Smoke Testing Fallback Seed Verification
-- Insert Regions
INSERT INTO public.location_regions (state, region_name, region_type, source) VALUES
  ('SA', 'City of Salisbury', 'app_region', 'verified_fallback_seed'),
  ('SA', 'City of Adelaide', 'app_region', 'verified_fallback_seed'),
  ('VIC', 'Cardinia Shire', 'app_region', 'verified_fallback_seed'),
  ('VIC', 'City of Casey', 'app_region', 'verified_fallback_seed'),
  ('VIC', 'City of Greater Dandenong', 'app_region', 'verified_fallback_seed'),
  ('VIC', 'City of Melbourne', 'app_region', 'verified_fallback_seed')
ON CONFLICT (state, region_name, region_type) DO NOTHING;

-- Insert Suburbs (resolving region_id dynamically)
WITH regions AS (
  SELECT r.id, r.state, r.region_name FROM public.location_regions r WHERE r.source = 'verified_fallback_seed'
)
INSERT INTO public.location_suburbs (suburb, state, postcode, region_id, region_name, display_name, source)
VALUES
  ('Ingle Farm', 'SA', '5098', (SELECT r.id FROM regions r WHERE r.state = 'SA' AND r.region_name = 'City of Salisbury'), 'City of Salisbury', 'Ingle Farm SA 5098', 'verified_fallback_seed'),
  ('Salisbury', 'SA', '5108', (SELECT r.id FROM regions r WHERE r.state = 'SA' AND r.region_name = 'City of Salisbury'), 'City of Salisbury', 'Salisbury SA 5108', 'verified_fallback_seed'),
  ('Salisbury Downs', 'SA', '5108', (SELECT r.id FROM regions r WHERE r.state = 'SA' AND r.region_name = 'City of Salisbury'), 'City of Salisbury', 'Salisbury Downs SA 5108', 'verified_fallback_seed'),
  ('Salisbury East', 'SA', '5109', (SELECT r.id FROM regions r WHERE r.state = 'SA' AND r.region_name = 'City of Salisbury'), 'City of Salisbury', 'Salisbury East SA 5109', 'verified_fallback_seed'),
  ('Pakenham', 'VIC', '3810', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'Cardinia Shire'), 'Cardinia Shire', 'Pakenham VIC 3810', 'verified_fallback_seed'),
  ('Koo Wee Rup', 'VIC', '3981', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'Cardinia Shire'), 'Cardinia Shire', 'Koo Wee Rup VIC 3981', 'verified_fallback_seed'),
  ('Officer', 'VIC', '3809', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'Cardinia Shire'), 'Cardinia Shire', 'Officer VIC 3809', 'verified_fallback_seed'),
  ('Beaconsfield', 'VIC', '3807', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'Cardinia Shire'), 'Cardinia Shire', 'Beaconsfield VIC 3807', 'verified_fallback_seed'),
  ('Berwick', 'VIC', '3806', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'City of Casey'), 'City of Casey', 'Berwick VIC 3806', 'verified_fallback_seed'),
  ('Clyde', 'VIC', '3978', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'City of Casey'), 'City of Casey', 'Clyde VIC 3978', 'verified_fallback_seed'),
  ('Cranbourne', 'VIC', '3977', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'City of Casey'), 'City of Casey', 'Cranbourne VIC 3977', 'verified_fallback_seed'),
  ('Narre Warren', 'VIC', '3805', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'City of Casey'), 'City of Casey', 'Narre Warren VIC 3805', 'verified_fallback_seed'),
  ('Dandenong', 'VIC', '3175', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'City of Greater Dandenong'), 'City of Greater Dandenong', 'Dandenong VIC 3175', 'verified_fallback_seed'),
  ('Melbourne', 'VIC', '3000', (SELECT r.id FROM regions r WHERE r.state = 'VIC' AND r.region_name = 'City of Melbourne'), 'City of Melbourne', 'Melbourne VIC 3000', 'verified_fallback_seed')
ON CONFLICT (suburb, state, postcode) DO UPDATE
SET
  region_id = EXCLUDED.region_id,
  region_name = EXCLUDED.region_name,
  display_name = EXCLUDED.display_name,
  source = EXCLUDED.source,
  is_verified = true,
  is_active = true;
