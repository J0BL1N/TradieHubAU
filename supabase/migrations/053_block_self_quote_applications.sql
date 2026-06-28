-- Migration: 053_block_self_quote_applications.sql
-- Description: Prevent job owners from submitting quotes/applications on their own jobs.

DROP POLICY IF EXISTS "Tradies can create applications" ON public.applications;
DROP POLICY IF EXISTS "Verified tradies can create applications" ON public.applications;

CREATE POLICY "Verified tradies can create applications"
  ON public.applications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('tradie', 'dual')
        AND u.identity_verified = true
        AND u.tradie_verified = true
    )
    AND customer_id = (
      SELECT j.customer_id
      FROM public.jobs j
      WHERE j.id = job_id
    )
    AND auth.uid() <> (
      SELECT j.customer_id
      FROM public.jobs j
      WHERE j.id = job_id
    )
  );

COMMENT ON POLICY "Verified tradies can create applications" ON public.applications IS
  'Allows only authenticated verified tradies to apply to jobs they do not own, while preserving job owner/customer correlation.';
