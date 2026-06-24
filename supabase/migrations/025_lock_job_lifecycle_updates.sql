-- Migration: 025_lock_job_lifecycle_updates.sql
-- Description: Resolve High Issue H-03 by restricting direct client UPDATE access
-- to editable content on owner-controlled open jobs. Lifecycle transitions remain
-- available only to trusted SECURITY DEFINER RPCs, service-role operations, and admins.

-- 1. Replace the broad owner UPDATE policy with an open-job content edit boundary.
DROP POLICY IF EXISTS "Owner can update jobs" ON public.jobs;

CREATE POLICY "Owners can edit open job content"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (
    auth.role() = 'authenticated'
    AND customer_id = auth.uid()
    AND status = 'open'
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND customer_id = auth.uid()
    AND status = 'open'
  );

-- 2. Enforce the content-field allowlist at the row level.
-- This function intentionally remains SECURITY INVOKER. Updates issued inside the
-- existing SECURITY DEFINER lifecycle RPCs run as their trusted function owner,
-- while direct Data API updates run as authenticated/anon and are checked here.
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

-- Consolidate timestamp maintenance into the protection trigger so clients cannot
-- supply updated_at and trigger ordering cannot weaken the immutable-field check.
DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
DROP TRIGGER IF EXISTS protect_job_lifecycle_updates_trigger ON public.jobs;

CREATE TRIGGER protect_job_lifecycle_updates_trigger
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_job_lifecycle_updates();

COMMENT ON POLICY "Owners can edit open job content" ON public.jobs IS
  'Allows an authenticated job owner to edit an open job; the protection trigger restricts changes to the approved content-field allowlist.';

COMMENT ON FUNCTION public.protect_job_lifecycle_updates() IS
  'Blocks direct client changes to job lifecycle, ownership, counters, timestamps, and all non-allowlisted fields while preserving trusted RPC/service/admin updates.';
