-- Migration: 043_allow_anon_is_admin_policy_evaluation.sql
-- Description: Allow anonymous RLS policy evaluation paths that reference
-- public.is_admin(auth.uid()) to return false instead of failing with
-- "permission denied for function is_admin". The helper remains narrowed:
-- anon callers have no auth.uid(), so it cannot return true for them.

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Returns admin status only when the supplied UUID equals auth.uid(); anonymous policy evaluation is allowed and always returns false.';
