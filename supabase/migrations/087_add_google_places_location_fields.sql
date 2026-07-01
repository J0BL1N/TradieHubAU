-- Migration: 087_add_google_places_location_fields.sql
-- Description: Add Google Places fields (formatted_address, place_id, latitude, longitude) to public.jobs and public.users, and update the protect_job_lifecycle_updates trigger allowlist.

-- 1. Add fields to public.jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

COMMENT ON COLUMN public.jobs.formatted_address IS 'The full formatted address returned by the Google Places API.';
COMMENT ON COLUMN public.jobs.place_id IS 'The Google Places Place ID associated with this location.';
COMMENT ON COLUMN public.jobs.latitude IS 'The geographical latitude of the job location.';
COMMENT ON COLUMN public.jobs.longitude IS 'The geographical longitude of the job location.';

-- 2. Add fields to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

COMMENT ON COLUMN public.users.formatted_address IS 'The full formatted address returned by the Google Places API for the user profile.';
COMMENT ON COLUMN public.users.place_id IS 'The Google Places Place ID associated with the user profile location.';
COMMENT ON COLUMN public.users.latitude IS 'The geographical latitude of the user profile location.';
COMMENT ON COLUMN public.users.longitude IS 'The geographical longitude of the user profile location.';

-- 3. Recreate the protect_job_lifecycle_updates trigger function with the new columns in the client edit allowlist.
CREATE OR REPLACE FUNCTION public.protect_job_lifecycle_updates()
RETURNS TRIGGER
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Preserve trusted migration/RPC, service-role, and administrator operations.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid())) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'Unauthorized to update this job.';
  END IF;

  IF OLD.status IS DISTINCT FROM 'open' OR NEW.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Job lifecycle transitions must use an authorized workflow.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.job_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Job details cannot be edited after a tradie has submitted a quote. Close and repost, or add clarification in a future note feature.';
  END IF;

  -- Remove only the explicitly editable content keys before comparing rows.
  -- Any current or future column outside this allowlist is immutable to clients.
  IF (to_jsonb(NEW) - ARRAY[
        'title',
        'description',
        'categories',
        'location',
        'suburb',
        'state',
        'postcode',
        'location_label',
        'formatted_address',
        'place_id',
        'latitude',
        'longitude',
        'budget_min',
        'budget_max',
        'estimated_budget',
        'budget_type',
        'timeline',
        'urgency',
        'type'
      ]::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY[
        'title',
        'description',
        'categories',
        'location',
        'suburb',
        'state',
        'postcode',
        'location_label',
        'formatted_address',
        'place_id',
        'latitude',
        'longitude',
        'budget_min',
        'budget_max',
        'estimated_budget',
        'budget_type',
        'timeline',
        'urgency',
        'type'
      ]::text[]) THEN
    RAISE EXCEPTION 'Only editable open-job content fields may be changed directly.';
  END IF;

  -- Keep the timestamp system-managed for permitted content edits.
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.protect_job_lifecycle_updates() IS
  'Blocks direct client changes to job lifecycle, ownership, counters, timestamps, and all non-allowlisted fields. Owners can edit core open-job content and Google Places fields only before any quote/application exists.';
