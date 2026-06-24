-- Migration: 036_explicit_rpc_execute_grants.sql
-- Description: Resolve Low Issue L-04 by replacing PostgreSQL's default PUBLIC
-- function execution with explicit role grants for sensitive public functions.

-- User workflow RPCs are callable by signed-in users and trusted service clients.
-- Each RPC retains its existing ownership, participant, lifecycle, and payment checks.
REVOKE ALL ON FUNCTION public.accept_quote(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_completion_proof(uuid, text, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.raise_job_issue(uuid, text, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.raise_job_issue(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_job_completion(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_variation_request(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_variation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_variation(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.simulate_variation_funding(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.simulate_payment_funding(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.accept_quote(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_completion_proof(uuid, text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.raise_job_issue(uuid, text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.raise_job_issue(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_job_completion(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_variation_request(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_variation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_variation(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_variation_funding(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) TO authenticated, service_role;

-- Admin workflows are invoked by authenticated admin sessions. Their existing
-- is_admin(auth.uid()) checks remain the authority boundary; service clients retain
-- execution for trusted operational use.
REVOKE ALL ON FUNCTION public.approve_identity_verification(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_tradie_profile(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.suspend_tradie_profile(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.suspend_identity_verification(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_dispute(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.approve_identity_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_tradie_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_tradie_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_identity_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, integer) TO authenticated, service_role;

-- RLS helpers must be executable by authenticated policy evaluation. They still
-- validate auth.uid() internally and are not exposed to anonymous callers.
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_admin_read_dispute_case(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_submit_review(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_read_dispute_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_submit_review(uuid, uuid, uuid) TO authenticated;

-- Internal calculation is not a public RPC. SECURITY DEFINER workflow functions
-- execute it as their owner; trusted service clients may also calculate fees.
REVOKE ALL ON FUNCTION public.calculate_platform_fee(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_platform_fee(integer) TO service_role;

-- Trigger functions are internal database enforcement mechanisms. Triggers keep
-- running under PostgreSQL without granting clients direct execution privileges.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_conversation_last_message() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_and_unlock_reviews() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_user_fields() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_payment_fields() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_job_lifecycle_updates() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_application_updates() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_message_read_updates() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_review_insert() FROM PUBLIC, anon, authenticated, service_role;
