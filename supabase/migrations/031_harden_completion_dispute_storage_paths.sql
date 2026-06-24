-- Migration: 031_harden_completion_dispute_storage_paths.sql
-- Description: Resolve Medium Issue M-03 by binding completion/dispute uploads
-- to exact namespaces, authenticated uploaders, authorised jobs, and lifecycle.

DROP POLICY IF EXISTS "Allow tradies to upload completion proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow customers to upload dispute evidence" ON storage.objects;

-- Storage INSERT policies are permissive/ORed, so the completion policy must
-- require the jobs/ prefix and must never authorise an object under disputes/.
-- The uploader path segment must match auth.uid(), while job/payment state mirrors
-- the submit_completion_proof RPC's contracted-payee and payment-held expectations.
CREATE POLICY "Allow tradies to upload completion proofs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'completion_proofs'
    AND split_part(name, '/', 1) = 'jobs'
    AND array_length(string_to_array(name, '/'), 1) = 4
    AND split_part(name, '/', 3) = auth.uid()::text
    AND split_part(name, '/', 4) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.payments p ON p.job_id = j.id
      JOIN public.applications a
        ON a.job_id = j.id
       AND a.tradie_id = p.payee_id
       AND a.status = 'accepted'
      WHERE j.id::text = split_part(name, '/', 2)
        AND j.status = 'payment_held'
        AND p.status = 'held'
        AND p.payee_id = auth.uid()
    )
  );

-- The disputes/ prefix and uploader segment are exact so this policy cannot be
-- reused for completion paths. The customer and lifecycle checks mirror the
-- raise_job_issue RPC's completed_pending_review eligibility boundary.
CREATE POLICY "Allow customers to upload dispute evidence" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'completion_proofs'
    AND split_part(name, '/', 1) = 'disputes'
    AND array_length(string_to_array(name, '/'), 1) = 4
    AND split_part(name, '/', 3) = auth.uid()::text
    AND split_part(name, '/', 4) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id::text = split_part(name, '/', 2)
        AND j.customer_id = auth.uid()
        AND j.status = 'completed_pending_review'
    )
  );
