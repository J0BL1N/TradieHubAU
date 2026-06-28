-- Migration: 050_structured_job_location_fields.sql
-- Description: Add structured suburb/state/postcode fields for jobs while preserving legacy location text.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS location_label text;

UPDATE public.jobs
SET
  suburb = CASE
    WHEN char_length(NULLIF(btrim(split_part(location, ',', 1)), '')) BETWEEN 2 AND 80
      THEN NULLIF(btrim(split_part(location, ',', 1)), '')
    ELSE suburb
  END,
  location_label = CASE
    WHEN location IS NOT NULL AND btrim(location) <> '' THEN location
    ELSE concat_ws(', ', NULLIF(btrim(suburb), ''), NULLIF(btrim(state), ''))
  END
WHERE suburb IS NULL
  AND location IS NOT NULL
  AND btrim(location) <> '';

UPDATE public.jobs
SET location_label = concat_ws(', ', NULLIF(btrim(suburb), ''), NULLIF(btrim(state), ''))
WHERE (location_label IS NULL OR btrim(location_label) = '')
  AND (suburb IS NOT NULL OR state IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_state_allowed_check'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_state_allowed_check
      CHECK (state IN ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_postcode_format_check'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_postcode_format_check
      CHECK (postcode IS NULL OR postcode ~ '^[0-9]{4}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_suburb_length_check'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_suburb_length_check
      CHECK (suburb IS NULL OR char_length(btrim(suburb)) BETWEEN 2 AND 80) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_suburb ON public.jobs (suburb);
CREATE INDEX IF NOT EXISTS idx_jobs_postcode ON public.jobs (postcode);
CREATE INDEX IF NOT EXISTS idx_jobs_state_suburb ON public.jobs (state, suburb);

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

COMMENT ON COLUMN public.jobs.suburb IS
  'Structured job suburb for browse/search display. Does not include street address.';
COMMENT ON COLUMN public.jobs.postcode IS
  'Structured four-digit Australian postcode. Not shown on public browse cards.';
COMMENT ON COLUMN public.jobs.location_label IS
  'Compatibility/general location label derived from suburb and state where available.';
COMMENT ON FUNCTION public.protect_job_lifecycle_updates() IS
  'Blocks direct client changes to job lifecycle, ownership, counters, timestamps, and all non-allowlisted fields. Owners can edit core open-job content only before any quote/application exists.';
