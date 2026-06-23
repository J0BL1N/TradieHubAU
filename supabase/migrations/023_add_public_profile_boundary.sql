-- Migration: 023_add_public_profile_boundary.sql
-- Description: Resolve High Issue H-01 by creating a safe public.public_profiles view and replacing public SELECT access on public.users with a policy restricting access to self, admins, and active job participants.

-- 1. Create public_profiles view exposing only safe columns
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  id,
  role,
  display_name,
  avatar_url,
  suburb,
  state,
  trades,
  abn,
  license_number,
  verified,
  identity_verified,
  tradie_verified,
  show_location,
  created_at,
  updated_at
FROM public.users;

-- Grant select permission on the view to public roles (anon and authenticated)
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 2. Drop the old wide public select policy on users table
DROP POLICY IF EXISTS "Public can view user profiles" ON public.users;

-- 3. Create a replacement secure select policy on users table
-- Allows selecting own row, admin reads, or reads of active/contracted job participants (to fetch contact details)
CREATE POLICY "Users view own or participant profile" ON public.users
  FOR SELECT USING (
    auth.uid() = id
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.payments p
      WHERE (
        (p.payer_id = auth.uid() AND p.payee_id = users.id)
        OR (p.payee_id = auth.uid() AND p.payer_id = users.id)
      )
    )
  );

-- 4. Explanatory comments:
-- The base public.users table contains private/gated information like email and phone numbers.
-- To prevent direct client REST leaks (H-01), general/directory browsing must use the safe public_profiles view.
-- Direct SELECT access to the base users table is restricted to self, admins, and active/accepted job participants.
