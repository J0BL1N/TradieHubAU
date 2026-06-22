-- Migration: 012_contracted_tradie_view_job.sql
-- Description: Allow contracted tradies (payees of the job payment record) to view/select the job record under Row Level Security.

DROP POLICY IF EXISTS "Contracted tradies can view job" ON public.jobs;
CREATE POLICY "Contracted tradies can view job" ON public.jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payments
      WHERE payments.job_id = id AND payments.payee_id = auth.uid()
    )
  );
