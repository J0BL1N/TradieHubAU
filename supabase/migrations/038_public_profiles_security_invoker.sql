-- Migration: 038_public_profiles_security_invoker.sql
-- Description: Resolve Supabase security advisor warning by making the safe
-- public profile view evaluate with the querying role's permissions.

ALTER VIEW public.public_profiles SET (security_invoker = true);

GRANT SELECT ON public.public_profiles TO anon, authenticated;
