-- Migration: 035_narrow_is_admin_checks.sql
-- Description: Resolve Low Issue L-01 by preventing arbitrary-user admin probes
-- while preserving existing is_admin(auth.uid()) RLS and function call sites.

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.is_admin IS TRUE
    );
$$;

-- Anonymous callers cannot execute the helper. Authenticated callers may check
-- only their own auth.uid(); all other UUIDs return false without enumeration.
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Returns admin status only when the supplied UUID equals auth.uid(); arbitrary-user admin probing returns false.';
