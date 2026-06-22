-- Migration: 005_verified_tradie_approval.sql
-- Description: Secures roles (prevent self-labelling as tradie), relaxes document type check constraint, updates approval RPC, and enforces verified tradie status for applications.

-- 1. Modify trigger to prevent unauthorized self-promotion or self-labelling as a tradie
CREATE OR REPLACE FUNCTION protect_user_fields()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only restrict if the query comes from the client API (auth.uid() is not null)
  IF auth.uid() IS NOT NULL THEN
    -- If caller is not admin, prevent setting is_admin, verified, or promoting role to tradie/dual
    IF NOT is_admin(auth.uid()) THEN
      -- On INSERT
      IF TG_OP = 'INSERT' THEN
        IF NEW.verified IS TRUE OR NEW.is_admin IS TRUE THEN
          RAISE EXCEPTION 'Only administrators can verify users or grant administrative privileges.';
        END IF;
        IF NEW.role IN ('tradie', 'dual') THEN
          RAISE EXCEPTION 'Users cannot register as a tradie directly; they must apply and be approved by an administrator.';
        END IF;
      -- On UPDATE
      ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.verified IS DISTINCT FROM OLD.verified OR NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
          RAISE EXCEPTION 'Only administrators can modify the verified status or administrative privileges.';
        END IF;
        -- Block self-promoting to tradie or dual role
        IF NEW.role IN ('tradie', 'dual') AND (OLD.role IS DISTINCT FROM NEW.role) THEN
          RAISE EXCEPTION 'Only administrators can promote a user to a tradie or dual role.';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Relax the document_type check constraint in the verifications table
ALTER TABLE verifications DROP CONSTRAINT IF EXISTS verifications_document_type_check;
ALTER TABLE verifications ADD CONSTRAINT verifications_document_type_check 
  CHECK (document_type IN ('license', 'passport', 'contractor_license', 'insurance', 'other'));

-- 3. Update approve_verification RPC function to atomically set verified = true and assign tradie role (if customer)
CREATE OR REPLACE FUNCTION approve_verification(v_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- 1. Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can approve verifications.';
  END IF;

  -- 2. Find target user_id and verify existence
  SELECT user_id INTO target_user_id FROM public.verifications WHERE id = v_id;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Verification record not found.';
  END IF;

  -- 3. Update verification record
  UPDATE public.verifications
  SET 
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  WHERE id = v_id;

  -- 4. Update user profile to verified and role to tradie (if currently a customer)
  UPDATE public.users
  SET 
    verified = true,
    role = CASE WHEN role = 'customer' THEN 'tradie' ELSE role END
  WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql;

-- 4. Enhance applications INSERT policy to require verified tradie status
DROP POLICY IF EXISTS "Tradies can create applications" ON applications;
CREATE POLICY "Verified tradies can create applications"
  ON applications FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('tradie', 'dual')
        AND verified = true
    )
  );
