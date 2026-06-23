-- Migration: 015_fix_admin_access_blockers.sql
-- Description: Safe schema additions to add the missing is_admin column, the is_admin(uuid) helper function, and admin RLS permissions for the verifications table.

-- ============================================================================
-- 1. Add is_admin column to public.users table if it is missing
-- ============================================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Safely backfill any NULL values to false (for existing rows in development)
UPDATE public.users SET is_admin = false WHERE is_admin IS NULL;

-- Enforce NOT NULL constraint
ALTER TABLE public.users ALTER COLUMN is_admin SET NOT NULL;


-- ============================================================================
-- 2. Create helper function to check if a user is an administrator
-- ============================================================================
-- Using SECURITY DEFINER and setting search_path to public to allow safe evaluation
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT is_admin INTO v_is_admin
  FROM public.users
  WHERE id = user_id;

  RETURN COALESCE(v_is_admin, FALSE);
END;
$$;

-- Grant execution permissions explicitly to public and authenticated roles
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO public;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;


-- ============================================================================
-- 3. Row-Level Security (RLS) policies for admin verifications access
-- ============================================================================
-- Allow administrators to select/read all verification records for verification dashboard hydration
DROP POLICY IF EXISTS "Admins can view all verifications" ON public.verifications;
CREATE POLICY "Admins can view all verifications" ON public.verifications
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Allow administrators to update verification status directly (e.g. approveDoc, rejectVerification)
DROP POLICY IF EXISTS "Admins can update all verifications" ON public.verifications;
CREATE POLICY "Admins can update all verifications" ON public.verifications
  FOR UPDATE USING (public.is_admin(auth.uid()));
