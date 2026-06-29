-- Migration: 078_revoke_public_execute_on_definers.sql
-- Description: Revoke PUBLIC/anon direct execution privileges from security definer admin RPCs, internal trigger helpers, validations, and simulation functions.

-- 1. Revoke anon/PUBLIC execute from admin-only and sensitive RPCs
REVOKE EXECUTE ON FUNCTION public.approve_identity_verification(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_tradie_profile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.suspend_identity_verification(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.suspend_tradie_profile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_admin_dispute_action(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_job_evidence_pack(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_admin_enforcement_action(uuid, text, text, text, text, uuid, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_admin_enforcement_action(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_user_enforcement_history(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_tradie_risk_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_analytics(text) FROM PUBLIC, anon;

-- 2. Revoke anon/PUBLIC execute from developer simulation RPCs
REVOKE EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.simulate_variation_funding(uuid) FROM PUBLIC, anon;

-- 3. Revoke anon/PUBLIC execute from authenticated-only user RPCs
REVOKE EXECUTE ON FUNCTION public.get_early_release_cap_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_job_invoice(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_job_evidence_timeline(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_itemised_variation_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_itemised_variation_request(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_job_variation_request(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_early_release_request(uuid, text, text) FROM PUBLIC, anon;

-- 4. Revoke all direct execution (PUBLIC, anon, and authenticated) from internal triggers and trigger helpers
REVOKE EXECUTE ON FUNCTION public.protect_user_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_auto_whitelist_tradie(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_auto_whitelist_tradie() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_quote_line_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_accepted_application_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_early_release_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_early_release_request_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_early_release_caps(uuid, uuid, uuid, uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_itemised_variation_line_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_itemised_variation_request_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_approved_variation_line_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_job_invoice_line_items(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_job_invoices(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_generate_invoices_on_payment_release() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_ensure_invoices_on_job_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_review_insert() FROM PUBLIC, anon, authenticated;
