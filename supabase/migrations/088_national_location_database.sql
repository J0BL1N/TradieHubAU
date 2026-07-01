-- Migration: 088_national_location_database.sql
-- Description: Design provider-neutral national location schema (regions and suburbs), searchable RPC functions, RLS policies, and verified fallback seeds.

-- 1. Create location_regions table
CREATE TABLE IF NOT EXISTS public.location_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  region_name text NOT NULL,
  region_type text NOT NULL DEFAULT 'app_region',
  source text NULL,
  is_verified boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint & Indexes for location_regions
CREATE UNIQUE INDEX IF NOT EXISTS location_regions_state_name_type_uidx 
  ON public.location_regions (state, region_name, region_type);

CREATE INDEX IF NOT EXISTS location_regions_state_idx ON public.location_regions (state);
CREATE INDEX IF NOT EXISTS location_regions_lower_name_idx ON public.location_regions (lower(region_name));
CREATE INDEX IF NOT EXISTS location_regions_type_idx ON public.location_regions (region_type);
CREATE INDEX IF NOT EXISTS location_regions_is_active_idx ON public.location_regions (is_active);

-- 2. Create location_suburbs table
CREATE TABLE IF NOT EXISTS public.location_suburbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suburb text NOT NULL,
  state text NOT NULL,
  postcode text NOT NULL,
  region_id uuid NULL REFERENCES public.location_regions (id) ON DELETE SET NULL,
  region_name text NULL,
  display_name text NOT NULL,
  latitude numeric NULL,
  longitude numeric NULL,
  source text NULL,
  source_record_id text NULL,
  is_verified boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint & Indexes for location_suburbs
CREATE UNIQUE INDEX IF NOT EXISTS location_suburbs_suburb_state_postcode_uidx
  ON public.location_suburbs (suburb, state, postcode);

CREATE INDEX IF NOT EXISTS location_suburbs_state_idx ON public.location_suburbs (state);
CREATE INDEX IF NOT EXISTS location_suburbs_postcode_idx ON public.location_suburbs (postcode);
CREATE INDEX IF NOT EXISTS location_suburbs_lower_suburb_idx ON public.location_suburbs (lower(suburb));
CREATE INDEX IF NOT EXISTS location_suburbs_region_id_idx ON public.location_suburbs (region_id);
CREATE INDEX IF NOT EXISTS location_suburbs_lower_region_name_idx ON public.location_suburbs (lower(region_name));
CREATE INDEX IF NOT EXISTS location_suburbs_is_verified_idx ON public.location_suburbs (is_verified);
CREATE INDEX IF NOT EXISTS location_suburbs_is_active_idx ON public.location_suburbs (is_active);

-- 3. Enable RLS
ALTER TABLE public.location_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_suburbs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Allow public select on location_regions"
  ON public.location_regions FOR SELECT
  USING (true);

CREATE POLICY "Allow public select on location_suburbs"
  ON public.location_suburbs FOR SELECT
  USING (true);

-- 5. Search Suburbs RPC
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

-- 6. Get Regions RPC
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

-- 7. Verified Smoke Testing Fallback Seed
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

-- 8. Explicit RPC execution grants (standardizing security)
REVOKE ALL ON FUNCTION public.search_location_suburbs(text, uuid, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_location_suburbs(text, uuid, text, text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_location_regions(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_regions(text) TO anon, authenticated, service_role;
