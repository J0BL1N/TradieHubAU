-- Migration: 051_add_job_region.sql
-- Description: Store selected Region/LGA/Council Area for structured job locations.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS region text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_region_length_check'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_region_length_check
      CHECK (region IS NULL OR char_length(btrim(region)) BETWEEN 2 AND 120) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_state_region ON public.jobs (state, region);

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

  IF (to_jsonb(NEW) - ARRAY[
        'title',
        'description',
        'categories',
        'location',
        'suburb',
        'state',
        'region',
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
        'region',
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

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN public.jobs.region IS
  'Selected Region/LGA/Council Area for structured job location. Public job cards still show suburb and state only.';
COMMENT ON FUNCTION public.protect_job_lifecycle_updates() IS
  'Blocks direct client changes to job lifecycle, ownership, counters, timestamps, and all non-allowlisted fields. Owners can edit core open-job content only before any quote/application exists.';
