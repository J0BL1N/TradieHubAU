-- Migration: 064_add_liveness_selfie_verification_document_type.sql
-- Description: Add liveness_selfie to verification document types and update approve_identity_verification RPC to support it.

-- 1. Relax the document_type check constraint in the verifications table
ALTER TABLE public.verifications DROP CONSTRAINT IF EXISTS verifications_document_type_check;
ALTER TABLE public.verifications ADD CONSTRAINT verifications_document_type_check 
  CHECK (document_type IN (
    'drivers_license', 
    'passport', 
    'proof_of_age', 
    'other_identity', 
    'contractor_license', 
    'insurance', 
    'trade_certificate', 
    'other_trade_credential',
    'liveness_selfie'
  ));

-- 2. Update approve_identity_verification RPC function to support liveness_selfie
CREATE OR REPLACE FUNCTION public.approve_identity_verification(v_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id uuid;
  doc_type text;
BEGIN
  -- Check if caller is admin
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can approve verifications.';
  END IF;

  -- Find target user and document type
  SELECT user_id, document_type INTO target_user_id, doc_type 
  FROM public.verifications 
  WHERE id = v_id;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Verification record not found.';
  END IF;

  -- Validate document is an allowed identity type (including liveness_selfie)
  IF doc_type NOT IN ('drivers_license', 'passport', 'proof_of_age', 'other_identity', 'liveness_selfie') THEN
    RAISE EXCEPTION 'Document is not a valid identity verification document.';
  END IF;

  -- Update verification record status
  UPDATE public.verifications
  SET 
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  WHERE id = v_id;

  -- Update user profile to identity_verified = true
  UPDATE public.users
  SET 
    identity_verified = true,
    verified = true
  WHERE id = target_user_id;

END;
$$;
