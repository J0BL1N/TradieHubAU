-- Migration: 074_job_evidence_timeline.sql
-- Description: Create public.get_job_evidence_timeline read-only RPC function to query job lifecycle events for customer, contracted tradie, and admin.

CREATE OR REPLACE FUNCTION public.get_job_evidence_timeline(p_job_id uuid)
RETURNS TABLE (
  event_id text,
  event_type text,
  event_label text,
  event_description text,
  occurred_at timestamptz,
  actor_role text,
  actor_user_id uuid,
  amount numeric,
  status text,
  source_table text,
  source_id uuid,
  metadata jsonb
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_tradie_id uuid;
  v_is_admin boolean;
BEGIN
  -- 1. Check parent Job exists and get customer_id
  SELECT customer_id INTO v_customer_id FROM public.jobs WHERE id = p_job_id;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- 2. Get accepted tradie_id (if any)
  SELECT tradie_id INTO v_tradie_id FROM public.applications WHERE job_id = p_job_id AND status = 'accepted';

  -- 3. Check if user is admin
  v_is_admin := public.is_admin(auth.uid());

  -- 4. Auth check: caller must be customer, contracted tradie, or admin
  IF auth.uid() <> v_customer_id 
     AND (v_tradie_id IS NULL OR auth.uid() <> v_tradie_id) 
     AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized to view evidence timeline for this job.';
  END IF;

  RETURN QUERY
  -- Event: Job Posted
  SELECT
    'job_posted_' || j.id::text AS event_id,
    'job_posted'::text AS event_type,
    'Job Posted'::text AS event_label,
    ('Job "' || j.title || '" was posted by customer.')::text AS event_description,
    j.created_at AS occurred_at,
    'customer'::text AS actor_role,
    j.customer_id AS actor_user_id,
    NULL::numeric AS amount,
    j.status::text AS status,
    'jobs'::text AS source_table,
    j.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.jobs j
  WHERE j.id = p_job_id

  UNION ALL

  -- Event: Quote Submitted
  SELECT
    'quote_submitted_' || a.id::text AS event_id,
    'quote_submitted'::text AS event_type,
    'Quote Submitted'::text AS event_label,
    ('Quote with estimate of $' || a.estimate::text || ' was submitted.')::text AS event_description,
    a.created_at AS occurred_at,
    'tradie'::text AS actor_role,
    a.tradie_id AS actor_user_id,
    a.estimate::numeric AS amount,
    a.status::text AS status,
    'applications'::text AS source_table,
    a.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.applications a
  WHERE a.job_id = p_job_id

  UNION ALL

  -- Event: Quote Accepted
  SELECT
    'quote_accepted_' || a.id::text AS event_id,
    'quote_accepted'::text AS event_type,
    'Quote Accepted'::text AS event_label,
    'Quote from tradie accepted by customer.'::text AS event_description,
    a.updated_at AS occurred_at,
    'customer'::text AS actor_role,
    v_customer_id AS actor_user_id,
    a.estimate::numeric AS amount,
    a.status::text AS status,
    'applications'::text AS source_table,
    a.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.applications a
  WHERE a.job_id = p_job_id AND a.status = 'accepted'

  UNION ALL

  -- Event: Payment Funded
  SELECT
    'payment_funded_' || p.id::text AS event_id,
    'payment_funded'::text AS event_type,
    'Payment Funded'::text AS event_label,
    'Secure contract payment funded and held.'::text AS event_description,
    p.updated_at AS occurred_at,
    'customer'::text AS actor_role,
    p.payer_id AS actor_user_id,
    (p.amount::numeric / 100.0) AS amount,
    p.status::text AS status,
    'payments'::text AS source_table,
    p.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.payments p
  WHERE p.job_id = p_job_id AND p.status = 'held_in_escrow'

  UNION ALL

  -- Event: Completion Proof Submitted
  SELECT
    'completion_proof_submitted_' || cp.id::text AS event_id,
    'completion_proof_submitted'::text AS event_type,
    'Completion Proof Submitted'::text AS event_label,
    'Completion proof submitted by tradie.'::text AS event_description,
    cp.created_at AS occurred_at,
    'tradie'::text AS actor_role,
    cp.tradie_id AS actor_user_id,
    NULL::numeric AS amount,
    'pending'::text AS status,
    'job_completion_proofs'::text AS source_table,
    cp.id AS source_id,
    jsonb_build_object('auto_release_at', cp.auto_release_at, 'has_attachments', (cp.attachments IS NOT NULL AND array_length(cp.attachments, 1) > 0)) AS metadata
  FROM public.job_completion_proofs cp
  WHERE cp.job_id = p_job_id

  UNION ALL

  -- Event: Payment Released / Job Completed
  SELECT
    'payment_released_' || p.id::text AS event_id,
    'payment_released'::text AS event_type,
    'Payment Released'::text AS event_label,
    'Secure contract payment released to tradie.'::text AS event_description,
    p.updated_at AS occurred_at,
    'customer'::text AS actor_role,
    p.payer_id AS actor_user_id,
    ((p.amount - p.platform_fee)::numeric / 100.0) AS amount,
    p.status::text AS status,
    'payments'::text AS source_table,
    p.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.payments p
  WHERE p.job_id = p_job_id AND p.status = 'released'

  UNION ALL

  -- Event: Dispute Raised
  SELECT
    'dispute_raised_' || ji.id::text AS event_id,
    'dispute_raised'::text AS event_type,
    'Dispute Raised'::text AS event_label,
    'Dispute raised by customer.'::text AS event_description,
    ji.created_at AS occurred_at,
    'customer'::text AS actor_role,
    ji.raised_by AS actor_user_id,
    NULL::numeric AS amount,
    ji.status::text AS status,
    'job_issues'::text AS source_table,
    ji.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.job_issues ji
  WHERE ji.job_id = p_job_id

  UNION ALL

  -- Event: Dispute Resolved
  SELECT
    'dispute_resolved_' || ji.id::text AS event_id,
    'dispute_resolved'::text AS event_type,
    'Dispute Resolved'::text AS event_label,
    'Dispute resolved by admin.'::text AS event_description,
    ji.resolved_at AS occurred_at,
    'admin'::text AS actor_role,
    ji.resolved_by AS actor_user_id,
    NULL::numeric AS amount,
    ji.status::text AS status,
    'job_issues'::text AS source_table,
    ji.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.job_issues ji
  WHERE ji.job_id = p_job_id AND ji.resolved_at IS NOT NULL

  UNION ALL

  -- Event: Variation Submitted
  SELECT
    'variation_submitted_' || vr.id::text AS event_id,
    'variation_submitted'::text AS event_type,
    'Variation Submitted'::text AS event_label,
    ('Variation request "' || vr.title || '" submitted.')::text AS event_description,
    vr.requested_at AS occurred_at,
    'tradie'::text AS actor_role,
    vr.tradie_id AS actor_user_id,
    (SELECT COALESCE(SUM(vl.quantity * vl.unit_price), 0) FROM public.job_variation_line_items vl WHERE vl.variation_request_id = vr.id)::numeric AS amount,
    vr.status::text AS status,
    'job_variation_requests'::text AS source_table,
    vr.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.job_variation_requests vr
  WHERE vr.job_id = p_job_id

  UNION ALL

  -- Event: Variation Resolved
  SELECT
    'variation_resolved_' || vr.id::text AS event_id,
    ('variation_' || vr.status)::text AS event_type,
    ('Variation ' || INITCAP(vr.status))::text AS event_label,
    ('Variation request "' || vr.title || '" was ' || vr.status || '.')::text AS event_description,
    COALESCE(vr.reviewed_at, vr.updated_at) AS occurred_at,
    CASE 
      WHEN vr.status = 'cancelled' THEN 'tradie'
      ELSE 'customer'
    END::text AS actor_role,
    CASE
      WHEN vr.status = 'cancelled' THEN vr.tradie_id
      ELSE vr.reviewed_by
    END AS actor_user_id,
    (SELECT COALESCE(SUM(vl.quantity * vl.unit_price), 0) FROM public.job_variation_line_items vl WHERE vl.variation_request_id = vr.id)::numeric AS amount,
    vr.status::text AS status,
    'job_variation_requests'::text AS source_table,
    vr.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.job_variation_requests vr
  WHERE vr.job_id = p_job_id AND vr.status <> 'pending'

  UNION ALL

  -- Event: Early Release Submitted
  SELECT
    'early_release_submitted_' || er.id::text AS event_id,
    'early_release_submitted'::text AS event_type,
    'Early Release Requested'::text AS event_label,
    ('Early release request for ' || er.request_type || ' submitted.')::text AS event_description,
    er.requested_at AS occurred_at,
    'tradie'::text AS actor_role,
    er.tradie_id AS actor_user_id,
    er.amount::numeric AS amount,
    er.status::text AS status,
    'early_release_requests'::text AS source_table,
    er.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.early_release_requests er
  WHERE er.job_id = p_job_id

  UNION ALL

  -- Event: Early Release Resolved
  SELECT
    'early_release_resolved_' || er.id::text AS event_id,
    ('early_release_' || er.status)::text AS event_type,
    ('Early Release ' || INITCAP(er.status))::text AS event_label,
    ('Early release request for ' || er.request_type || ' was ' || er.status || '.')::text AS event_description,
    COALESCE(er.reviewed_at, er.updated_at) AS occurred_at,
    CASE 
      WHEN er.status = 'cancelled' THEN 'tradie'
      ELSE 'customer'
    END::text AS actor_role,
    CASE
      WHEN er.status = 'cancelled' THEN er.tradie_id
      ELSE er.reviewed_by
    END AS actor_user_id,
    er.amount::numeric AS amount,
    er.status::text AS status,
    'early_release_requests'::text AS source_table,
    er.id AS source_id,
    NULL::jsonb AS metadata
  FROM public.early_release_requests er
  WHERE er.job_id = p_job_id AND er.status <> 'pending'

  UNION ALL

  -- Event: Invoice/Receipt Generated
  SELECT
    'invoice_generated_' || ji.id::text AS event_id,
    'invoice_generated'::text AS event_type,
    CASE 
      WHEN ji.invoice_type = 'customer_receipt' THEN 'Customer Receipt Generated'
      ELSE 'Payout Statement Generated'
    END::text AS event_label,
    ('Document number ' || ji.invoice_number || ' generated.')::text AS event_description,
    ji.issued_at AS occurred_at,
    'system'::text AS actor_role,
    NULL::uuid AS actor_user_id,
    (ji.amount_cents::numeric / 100.0) AS amount,
    NULL::text AS status,
    'job_invoices'::text AS source_table,
    ji.id AS source_id,
    jsonb_build_object('invoice_type', ji.invoice_type, 'invoice_number', ji.invoice_number) AS metadata
  FROM public.job_invoices ji
  WHERE ji.job_id = p_job_id

  ORDER BY occurred_at ASC;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.get_job_evidence_timeline(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_job_evidence_timeline(uuid) TO authenticated, service_role;
