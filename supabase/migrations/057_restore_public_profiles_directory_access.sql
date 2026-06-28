-- Migration: 057_restore_public_profiles_directory_access.sql
-- Description: Disables security_invoker on the public.public_profiles view to restore public directory access for customers and guests.

-- 1. Reset security_invoker to revert the view to standard security definer behavior.
-- Since the public_profiles view is fully sanitized (it explicitly drops private columns like email, phone, 
-- stripe IDs, and verification document URLs), running it as security definer is safe and correct.
-- This keeps the underlying public.users table strictly protected by RLS (preventing direct REST leaks of private columns)
-- while allowing standard public directory directory lookup.
ALTER VIEW public.public_profiles RESET (security_invoker);

-- 2. Ensure selection permissions are granted to public roles (anon and authenticated)
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Public sanitized profile directory. Intentionally uses security definer (security_invoker = false) to expose public trust data without leaking private columns from the RLS-protected users table.';
