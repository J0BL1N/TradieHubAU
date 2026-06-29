-- Migration: 075_admin_job_evidence_pack.sql
-- Description: Create public.get_admin_job_evidence_pack read-only RPC function to compile full job/dispute case files for staff administrators.

CREATE OR REPLACE FUNCTION public.get_admin_job_evidence_pack(p_job_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_job public.jobs%ROWTYPE;
  v_customer jsonb;
  v_tradie jsonb;
  v_quote jsonb;
  v_variations jsonb;
  v_early_releases jsonb;
  v_invoices jsonb;
  v_payments jsonb;
  v_proofs jsonb;
  v_disputes jsonb;
  v_timeline jsonb;
BEGIN
  -- 1. Explicit admin check
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  -- 2. Check parent Job exists
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- 3. Customer safe identity
  SELECT jsonb_build_object(
    'id', u.id,
    'display_name', u.display_name,
    'email', u.email,
    'phone', u.phone,
    'identity_verified', u.identity_verified,
    'tradie_verified', u.tradie_verified,
    'created_at', u.created_at
  ) INTO v_customer
  FROM public.users u
  WHERE u.id = v_job.customer_id;

  -- 4. Contracted Tradie safe identity (if any)
  SELECT jsonb_build_object(
    'id', u.id,
    'display_name', u.display_name,
    'email', u.email,
    'phone', u.phone,
    'abn', u.abn,
    'license_number', u.license_number,
    'identity_verified', u.identity_verified,
    'tradie_verified', u.tradie_verified,
    'created_at', u.created_at
  ) INTO v_tradie
  FROM public.applications a
  JOIN public.users u ON u.id = a.tradie_id
  WHERE a.job_id = p_job_id AND a.status = 'accepted'
  LIMIT 1;

  -- 5. Accepted Quote & Line Items
  SELECT jsonb_build_object(
    'id', a.id,
    'estimate', a.estimate,
    'status', a.status,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'line_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', aqli.id,
        'label', aqli.label,
        'description', aqli.description,
        'quantity', aqli.quantity,
        'unit_price', aqli.unit_price,
        'line_total', aqli.line_total,
        'line_type', aqli.line_type,
        'sort_order', aqli.sort_order
      ) ORDER BY aqli.sort_order)
      FROM public.accepted_quote_line_items aqli
      WHERE aqli.application_id = a.id
    ), '[]'::jsonb)
  ) INTO v_quote
  FROM public.applications a
  WHERE a.job_id = p_job_id AND a.status = 'accepted'
  LIMIT 1;

  -- 6. Variations (both line items and status)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', vr.id,
    'title', vr.title,
    'description', vr.description,
    'status', vr.status,
    'requested_at', vr.requested_at,
    'reviewed_at', vr.reviewed_at,
    'reviewed_by', vr.reviewed_by,
    'rejection_reason', vr.rejection_reason,
    'line_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vli.id,
        'label', vli.label,
        'description', vli.description,
        'quantity', vli.quantity,
        'unit_price', vli.unit_price,
        'line_type', vli.line_type,
        'sort_order', vli.sort_order
      ) ORDER BY vli.sort_order)
      FROM public.job_variation_line_items vli
      WHERE vli.variation_request_id = vr.id
    ), '[]'::jsonb)
  ) ORDER BY vr.requested_at DESC), '[]'::jsonb) INTO v_variations
  FROM public.job_variation_requests vr
  WHERE vr.job_id = p_job_id;

  -- 7. Early Release Requests
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', er.id,
    'amount', er.amount,
    'request_type', er.request_type,
    'status', er.status,
    'requested_at', er.requested_at,
    'reviewed_at', er.reviewed_at,
    'reviewed_by', er.reviewed_by,
    'notes', er.notes,
    'rejection_reason', er.rejection_reason
  ) ORDER BY er.requested_at DESC), '[]'::jsonb) INTO v_early_releases
  FROM public.early_release_requests er
  WHERE er.job_id = p_job_id;

  -- 8. Invoices / Receipts
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ji.id,
    'invoice_type', ji.invoice_type,
    'invoice_number', ji.invoice_number,
    'amount_cents', ji.amount_cents,
    'issued_at', ji.issued_at,
    'line_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', jili.id,
        'source_type', jili.source_type,
        'label', jili.label,
        'description', jili.description,
        'quantity', jili.quantity,
        'unit_price', jili.unit_price,
        'line_total', jili.line_total,
        'line_type', jili.line_type
      ) ORDER BY jili.sort_order)
      FROM public.job_invoice_line_items jili
      WHERE jili.invoice_id = ji.id
    ), '[]'::jsonb)
  ) ORDER BY ji.issued_at DESC), '[]'::jsonb) INTO v_invoices
  FROM public.job_invoices ji
  WHERE ji.job_id = p_job_id;

  -- 9. Payments and Ledgers
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'amount', p.amount,
    'platform_fee', p.platform_fee,
    'status', p.status,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'ledger_entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pl.id,
        'transaction_type', pl.transaction_type,
        'amount_cents', pl.amount_cents,
        'stripe_transaction_id', pl.stripe_transaction_id,
        'created_at', pl.created_at
      ) ORDER BY pl.created_at ASC)
      FROM public.payment_ledger pl
      WHERE pl.payment_id = p.id
    ), '[]'::jsonb)
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO v_payments
  FROM public.payments p
  WHERE p.job_id = p_job_id;

  -- 10. Completion Proofs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', cp.id,
    'description', cp.description,
    'attachments', cp.attachments,
    'created_at', cp.created_at,
    'auto_release_at', cp.auto_release_at
  ) ORDER BY cp.created_at DESC), '[]'::jsonb) INTO v_proofs
  FROM public.job_completion_proofs cp
  WHERE cp.job_id = p_job_id;

  -- 11. Disputes / Issues
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ji.id,
    'proof_id', ji.proof_id,
    'raised_by', ji.raised_by,
    'description', ji.description,
    'attachments', ji.attachments,
    'status', ji.status,
    'created_at', ji.created_at,
    'resolved_at', ji.resolved_at,
    'resolved_by', ji.resolved_by,
    'admin_notes', ji.admin_notes
  ) ORDER BY ji.created_at DESC), '[]'::jsonb) INTO v_disputes
  FROM public.job_issues ji
  WHERE ji.job_id = p_job_id;

  -- 12. Timeline Events (reusing get_job_evidence_timeline)
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_timeline
  FROM public.get_job_evidence_timeline(p_job_id) t;

  -- Combine everything into a single JSON
  v_result := jsonb_build_object(
    'job', jsonb_build_object(
      'id', v_job.id,
      'title', v_job.title,
      'description', v_job.description,
      'status', v_job.status,
      'created_at', v_job.created_at,
      'updated_at', v_job.updated_at
    ),
    'customer', v_customer,
    'tradie', v_tradie,
    'quote', v_quote,
    'variations', v_variations,
    'early_releases', v_early_releases,
    'invoices', v_invoices,
    'payments', v_payments,
    'completion_proofs', v_proofs,
    'disputes', v_disputes,
    'timeline', v_timeline
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.get_admin_job_evidence_pack(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_job_evidence_pack(uuid) TO authenticated, service_role;
