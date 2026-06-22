-- Migration: 014_fix_contracted_tradie_view_job.sql
-- Description: Fix column shadowing in the SELECT policy on public.jobs so the outer jobs.id is correctly matched to payments.job_id.

DROP POLICY IF EXISTS "Contracted tradies can view job" ON public.jobs;

CREATE POLICY "Contracted tradies can view job" ON public.jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payments
      WHERE payments.job_id = jobs.id AND payments.payee_id = auth.uid()
    )
  );
