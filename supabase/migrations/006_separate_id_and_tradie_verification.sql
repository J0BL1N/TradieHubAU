-- Migration: 006_separate_id_and_tradie_verification.sql
-- Description: Separates photo ID verification from professional tradie approval in TradieHubAU database schema.

-- 1. Alter users table to add identity_verified and tradie_verified
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tradie_verified BOOLEAN DEFAULT FALSE;

-- 2. Create index on the new verification fields
CREATE INDEX IF NOT EXISTS idx_users_identity_verified ON users(identity_verified) WHERE identity_verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_tradie_verified ON users(tradie_verified) WHERE tradie_verified = TRUE;

-- 3. Update trigger to prevent unauthorized self-modification of new fields
CREATE OR REPLACE FUNCTION protect_user_fields()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only restrict if the query comes from the client API (auth.uid() is not null)
  IF auth.uid() IS NOT NULL THEN
    -- If caller is not admin, prevent setting is_admin, verified, identity_verified, tradie_verified, or promoting role to tradie/dual
    IF NOT is_admin(auth.uid()) THEN
      -- On INSERT
      IF TG_OP = 'INSERT' THEN
        IF NEW.verified IS TRUE OR NEW.identity_verified IS TRUE OR NEW.tradie_verified IS TRUE OR NEW.is_admin IS TRUE THEN
          RAISE EXCEPTION 'Only administrators can verify users or grant administrative privileges.';
        END IF;
        IF NEW.role IN ('tradie', 'dual') THEN
          RAISE EXCEPTION 'Users cannot register as a tradie directly; they must apply and be approved by an administrator.';
        END IF;
      -- On UPDATE
      ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.verified IS DISTINCT FROM OLD.verified OR 
           NEW.identity_verified IS DISTINCT FROM OLD.identity_verified OR 
           NEW.tradie_verified IS DISTINCT FROM OLD.tradie_verified OR 
           NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
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

-- 4. Create RPC to approve identity verification (license/passport check)
CREATE OR REPLACE FUNCTION approve_identity_verification(v_id uuid)
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

  -- 4. Update user profile to identity_verified = true
  UPDATE public.users
  SET 
    identity_verified = true,
    verified = true -- maintain compatibility with legacy index/checks
  WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql;

-- 5. Create RPC to explicitly whitelist a tradie's profile after admin review
CREATE OR REPLACE FUNCTION approve_tradie_profile(target_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can approve tradie profiles.';
  END IF;

  -- 2. Check if user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- 3. Update target user profile to tradie_verified = true and set role to tradie (if customer)
  UPDATE public.users
  SET 
    tradie_verified = true,
    role = CASE WHEN role = 'customer' THEN 'tradie' ELSE role END
  WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql;

-- 6. Restrict applications INSERT policy to verified tradies (using tradie_verified)
DROP POLICY IF EXISTS "Verified tradies can create applications" ON applications;
CREATE POLICY "Verified tradies can create applications"
  ON applications FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('tradie', 'dual')
        AND tradie_verified = true
    )
  );
