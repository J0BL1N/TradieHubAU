-- Migration: 048_lock_job_edits_after_quotes.sql
-- Description: Prevent customer edits to core job details after any tradie quote exists.

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
        'state',
        'budget_min',
        'budget_max',
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
        'state',
        'budget_min',
        'budget_max',
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
  'Blocks direct client changes to job lifecycle, ownership, counters, timestamps, and all non-allowlisted fields. Owners can edit core open-job content only before any quote/application exists.';
