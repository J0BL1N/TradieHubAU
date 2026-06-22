-- Migration: 008_harden_verification_safety.sql
-- Description: Safety follow-up pass to implement strict database-level gating, storage rules, profile field locks, and admin reset RPCs.

-- 1. Redefine the document type check constraint in the verifications table
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
    'other_trade_credential'
  ));

-- 2. Harden approve_identity_verification RPC to only allow identity documents
CREATE OR REPLACE FUNCTION public.approve_identity_verification(v_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  doc_type text;
BEGIN
  -- 1. Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can approve verifications.';
  END IF;

  -- 2. Find target user and document type
  SELECT user_id, document_type INTO target_user_id, doc_type 
  FROM public.verifications 
  WHERE id = v_id;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Verification record not found.';
  END IF;

  -- 3. Safety check: Ensure this document is actually an identity document
  IF doc_type NOT IN ('drivers_license', 'passport', 'proof_of_age', 'other_identity') THEN
    RAISE EXCEPTION 'Document is not a valid identity verification document.';
  END IF;

  -- 4. Update verification record
  UPDATE public.verifications
  SET 
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  WHERE id = v_id;

  -- 5. Update user profile to identity_verified = true and verified = true (legacy compatibility)
  UPDATE public.users
  SET 
    identity_verified = true,
    verified = true
  WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql;

-- 3. Harden approve_tradie_profile RPC
CREATE OR REPLACE FUNCTION public.approve_tradie_profile(target_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abn text;
  v_lic text;
  v_id_verified boolean;
BEGIN
  -- 1. Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can whitelist tradie profiles.';
  END IF;

  -- 2. Retrieve target user qualifications
  SELECT abn, license_number, identity_verified INTO v_abn, v_lic, v_id_verified
  FROM public.users
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- 3. Safety Check: Verify that basic identity check is completed
  IF v_id_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'User identity must be verified before approving tradie whitelisting.';
  END IF;

  -- 4. Safety Check: Verify ABN and licence number are present
  IF v_abn IS NULL OR v_abn = '' THEN
    RAISE EXCEPTION 'User must have a valid ABN entered to be whitelisted.';
  END IF;

  IF v_lic IS NULL OR v_lic = '' THEN
    RAISE EXCEPTION 'User must have a valid Licence ID entered to be whitelisted.';
  END IF;

  -- 5. Safety Check: Verify at least one contractor_license document is approved
  IF NOT EXISTS (
    SELECT 1 FROM public.verifications
    WHERE user_id = target_user_id
      AND document_type = 'contractor_license'
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'User must have an approved contractor license document to be whitelisted.';
  END IF;

  -- 6. Safety Check: Verify at least one insurance document is approved
  IF NOT EXISTS (
    SELECT 1 FROM public.verifications
    WHERE user_id = target_user_id
      AND document_type = 'insurance'
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'User must have an approved insurance certificate document to be whitelisted.';
  END IF;

  -- 7. Whitelist user profile and upgrade customer roles (preserving dual/special roles)
  UPDATE public.users
  SET 
    tradie_verified = true,
    role = CASE WHEN role = 'customer' THEN 'tradie' ELSE role END
  WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql;

-- 4. Create suspend_tradie_profile RPC for admin resets
CREATE OR REPLACE FUNCTION public.suspend_tradie_profile(target_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can suspend tradie profiles.';
  END IF;

  -- 2. Verify target user existence
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- 3. Suspend profile
  UPDATE public.users
  SET 
    tradie_verified = false,
    role = CASE WHEN role = 'tradie' THEN 'customer' ELSE role END -- Downgrade role back to customer
  WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql;

-- 5. Create suspend_identity_verification RPC for admin resets
CREATE OR REPLACE FUNCTION public.suspend_identity_verification(target_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can revoke identity verifications.';
  END IF;

  -- 2. Verify target user existence
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- 3. Revoke identity flags
  UPDATE public.users
  SET 
    identity_verified = false,
    verified = false
  WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql;

-- 6. Upgrade user profile field editing protection trigger
CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only restrict client API updates (auth.uid() is not null)
  IF auth.uid() IS NOT NULL THEN
    -- If caller is not admin, prevent tampering with security/role parameters
    IF NOT is_admin(auth.uid()) THEN
      -- On INSERT
      IF TG_OP = 'INSERT' THEN
        IF NEW.verified IS TRUE OR NEW.identity_verified IS TRUE OR NEW.tradie_verified IS TRUE OR NEW.is_admin IS TRUE THEN
          RAISE EXCEPTION 'Only staff administrators can grant verification status or admin permissions.';
        END IF;
        IF NEW.role IN ('tradie', 'dual') THEN
          RAISE EXCEPTION 'Direct signup as a tradie is blocked. Submit credentials on the profile tab.';
        END IF;
      -- On UPDATE
      ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.verified IS DISTINCT FROM OLD.verified OR 
           NEW.identity_verified IS DISTINCT FROM OLD.identity_verified OR 
           NEW.tradie_verified IS DISTINCT FROM OLD.tradie_verified OR 
           NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
          RAISE EXCEPTION 'Only staff administrators can modify verification flags or administrative status.';
        END IF;

        IF NEW.role IN ('tradie', 'dual') AND (OLD.role IS DISTINCT FROM NEW.role) THEN
          RAISE EXCEPTION 'Only staff administrators can promote a profile to a tradie role.';
        END IF;

        -- DB Gating: Prevent regular users from modifying ABN, Licence Number, or Trades 
        -- if they are already whitelisted OR if they currently have a pending tradie verification file.
        IF OLD.tradie_verified IS TRUE OR EXISTS (
          SELECT 1 FROM public.verifications 
          WHERE user_id = auth.uid() 
            AND document_type IN ('contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential')
            AND status = 'pending'
        ) THEN
          IF NEW.abn IS DISTINCT FROM OLD.abn OR 
             NEW.license_number IS DISTINCT FROM OLD.license_number OR 
             NEW.trades IS DISTINCT FROM OLD.trades THEN
            RAISE EXCEPTION 'Your ABN, licence ID, and trade category selections are locked while your tradie application is pending or approved.';
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Restrict applications table INSERT policy to require BOTH identity and tradie approvals
DROP POLICY IF EXISTS "Verified tradies can create applications" ON public.applications;
CREATE POLICY "Verified tradies can create applications"
  ON public.applications FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('tradie', 'dual')
        AND identity_verified = true
        AND tradie_verified = true
    )
  );

-- 8. Add Storage Bucket security policies for private 'verifications' bucket


DROP POLICY IF EXISTS "Allow users to upload own verifications" ON storage.objects;
CREATE POLICY "Allow users to upload own verifications" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verifications'
    AND auth.role() = 'authenticated'
    AND name LIKE 'users/' || auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS "Allow users to read own verifications" ON storage.objects;
CREATE POLICY "Allow users to read own verifications" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verifications'
    AND auth.role() = 'authenticated'
    AND name LIKE 'users/' || auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS "Allow admins to read all verifications" ON storage.objects;
CREATE POLICY "Allow admins to read all verifications" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verifications'
    AND is_admin(auth.uid())
  );
