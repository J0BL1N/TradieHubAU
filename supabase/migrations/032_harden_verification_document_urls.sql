-- Migration: 032_harden_verification_document_urls.sql
-- Description: Resolve Medium Issue M-04 by binding verification records to
-- document paths owned by the authenticated submitter.

DROP POLICY IF EXISTS "Users submit verifications" ON public.verifications;

-- document_url stores the bucket-relative object path. Within the private
-- verifications bucket, users/<uid>/... represents verifications/users/<uid>/....
-- Ordinary users retain no UPDATE policy; existing admin review access is unchanged.
CREATE POLICY "Users submit verifications" ON public.verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND document_url LIKE 'users/' || auth.uid()::text || '/%'
  );

COMMENT ON POLICY "Users submit verifications" ON public.verifications IS
  'Allows authenticated users to submit only their own verification rows referencing objects under the private verifications/users/<auth.uid()>/ prefix.';
