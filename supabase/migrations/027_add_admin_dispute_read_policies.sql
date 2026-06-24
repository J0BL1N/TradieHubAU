-- Migration: 027_add_admin_dispute_read_policies.sql
-- Description: Resolve High Issue H-05 by allowing platform administrators to
-- read jobs and payments that belong to recorded dispute cases, without granting
-- any additional INSERT, UPDATE, or DELETE access.

-- Use a SECURITY DEFINER predicate so the jobs/payments policies can test the
-- dispute-case anchor without recursively invoking job_issues participant policies,
-- which themselves reference jobs and payments.
-- Current admin case queries are anchored by job_issues, and those rows remain after
-- resolution, so this scope supports both active and historical cases without giving
-- administrators general read access to unrelated marketplace jobs or payments.
CREATE OR REPLACE FUNCTION public.can_admin_read_dispute_case(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_admin(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.job_issues ji
      WHERE ji.job_id = p_job_id
    );
$$;

REVOKE ALL ON FUNCTION public.can_admin_read_dispute_case(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_admin_read_dispute_case(uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins view dispute case jobs" ON public.jobs;
CREATE POLICY "Admins view dispute case jobs"
  ON public.jobs
  FOR SELECT
  TO authenticated
  USING (public.can_admin_read_dispute_case(jobs.id));

DROP POLICY IF EXISTS "Admins view dispute case payments" ON public.payments;
CREATE POLICY "Admins view dispute case payments"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (public.can_admin_read_dispute_case(payments.job_id));

COMMENT ON FUNCTION public.can_admin_read_dispute_case(uuid) IS
  'Returns true only for an authenticated platform admin and a job with a recorded dispute issue; used to avoid recursive RLS checks.';

COMMENT ON POLICY "Admins view dispute case jobs" ON public.jobs IS
  'Allows platform admins to read job rows for ongoing or resolved dispute cases. Does not grant mutation access or expose non-case jobs.';

COMMENT ON POLICY "Admins view dispute case payments" ON public.payments IS
  'Allows platform admins to read payment linkage, amount, and status for ongoing or resolved dispute cases. Does not grant mutation access or expose non-case payments.';
