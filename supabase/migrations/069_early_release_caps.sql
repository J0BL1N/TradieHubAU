-- Migration: 069_early_release_caps.sql
-- Description: Add conservative early release cap enforcement and a permission-checked cap summary RPC.

CREATE OR REPLACE FUNCTION public.check_early_release_caps(
  p_request_id uuid,
  p_job_id uuid,
  p_application_id uuid,
  p_tradie_id uuid,
  p_customer_id uuid,
  p_accepted_quote_line_item_id uuid,
  p_amount numeric
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_status text;
  v_job_customer uuid;
  v_app_status text;
  v_app_tradie uuid;
  v_app_estimate numeric;
  v_line_job uuid;
  v_line_app uuid;
  v_line_total numeric;
  v_snapshot_total numeric;
  v_contract_total numeric;
  v_job_cap numeric;
  v_job_used numeric;
  v_line_used numeric;
  v_has_snapshots boolean;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Early release amount must be greater than zero.';
  END IF;

  SELECT status, customer_id INTO v_job_status, v_job_customer
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job_status IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  IF v_job_status NOT IN ('accepted', 'payment_held') THEN
    RAISE EXCEPTION 'Early release requests can only be created for active or accepted jobs (current status: %).', v_job_status;
  END IF;

  SELECT status, tradie_id, estimate INTO v_app_status, v_app_tradie, v_app_estimate
  FROM public.applications
  WHERE id = p_application_id
    AND job_id = p_job_id;

  IF v_app_status IS NULL THEN
    RAISE EXCEPTION 'Application not found.';
  END IF;

  IF v_app_status <> 'accepted' THEN
    RAISE EXCEPTION 'Application must be accepted before requesting early release.';
  END IF;

  IF p_tradie_id <> v_app_tradie THEN
    RAISE EXCEPTION 'tradie_id must match the accepted applicant.';
  END IF;

  IF p_customer_id <> v_job_customer THEN
    RAISE EXCEPTION 'customer_id must match the job owner.';
  END IF;

  SELECT COALESCE(sum(line_total), 0)
  INTO v_snapshot_total
  FROM public.accepted_quote_line_items
  WHERE job_id = p_job_id
    AND application_id = p_application_id;

  v_has_snapshots := v_snapshot_total > 0;

  IF v_has_snapshots AND p_accepted_quote_line_item_id IS NULL THEN
    RAISE EXCEPTION 'Early release requests must be linked to an accepted quote line item.';
  END IF;

  IF p_accepted_quote_line_item_id IS NOT NULL THEN
    SELECT job_id, application_id, line_total
    INTO v_line_job, v_line_app, v_line_total
    FROM public.accepted_quote_line_items
    WHERE id = p_accepted_quote_line_item_id;

    IF v_line_job IS NULL THEN
      RAISE EXCEPTION 'Linked accepted quote line item not found.';
    END IF;

    IF v_line_job <> p_job_id OR v_line_app <> p_application_id THEN
      RAISE EXCEPTION 'Linked quote line item does not belong to this contract.';
    END IF;

    IF p_amount > v_line_total THEN
      RAISE EXCEPTION 'This request exceeds the allowed early release cap for this job or quote line.';
    END IF;

    SELECT COALESCE(sum(amount), 0)
    INTO v_line_used
    FROM public.early_release_requests
    WHERE accepted_quote_line_item_id = p_accepted_quote_line_item_id
      AND status IN ('pending', 'approved')
      AND id <> COALESCE(p_request_id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_line_used + p_amount > v_line_total THEN
      RAISE EXCEPTION 'This request exceeds the allowed early release cap for this job or quote line.';
    END IF;
  END IF;

  IF v_has_snapshots THEN
    v_contract_total := v_snapshot_total;
  ELSE
    IF v_app_estimate IS NULL OR v_app_estimate <= 0 THEN
      RAISE EXCEPTION 'Early release requests are unavailable for this legacy job because the accepted contract amount is not clear.';
    END IF;
    v_contract_total := v_app_estimate;
  END IF;

  v_job_cap := v_contract_total * 0.30;

  SELECT COALESCE(sum(amount), 0)
  INTO v_job_used
  FROM public.early_release_requests
  WHERE job_id = p_job_id
    AND status IN ('pending', 'approved')
    AND id <> COALESCE(p_request_id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_job_used + p_amount > v_job_cap THEN
    RAISE EXCEPTION 'This request exceeds the allowed early release cap for this job or quote line.';
  END IF;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.check_early_release_caps(uuid, uuid, uuid, uuid, uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.check_early_release_caps(uuid, uuid, uuid, uuid, uuid, uuid, numeric) IS
  'Internal trigger helper that enforces early release caps from accepted quote snapshots or legacy accepted estimate fallback.';

CREATE OR REPLACE FUNCTION public.validate_early_release_request()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_early_release_caps(
    NEW.id,
    NEW.job_id,
    NEW.application_id,
    NEW.tradie_id,
    NEW.customer_id,
    NEW.accepted_quote_line_item_id,
    NEW.amount
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.validate_early_release_request_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot modify an early release request that is already %.', OLD.status;
  END IF;

  IF NEW.status IN ('approved', 'rejected') THEN
    IF auth.uid() <> OLD.customer_id AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only the customer or an admin can approve or reject early release requests.';
    END IF;
    NEW.reviewed_at := NOW();
    NEW.reviewed_by := auth.uid();
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF auth.uid() <> OLD.tradie_id AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only the requesting tradie can cancel this early release request.';
    END IF;
  END IF;

  IF NEW.job_id <> OLD.job_id OR
     NEW.application_id <> OLD.application_id OR
     NEW.tradie_id <> OLD.tradie_id OR
     NEW.customer_id <> OLD.customer_id OR
     NEW.accepted_quote_line_item_id IS DISTINCT FROM OLD.accepted_quote_line_item_id OR
     NEW.request_type <> OLD.request_type OR
     NEW.title <> OLD.title OR
     NEW.description IS DISTINCT FROM OLD.description OR
     NEW.amount <> OLD.amount THEN
     RAISE EXCEPTION 'Immutable fields of an early release request cannot be modified after creation.';
  END IF;

  IF NEW.status = 'approved' THEN
    PERFORM public.check_early_release_caps(
      NEW.id,
      NEW.job_id,
      NEW.application_id,
      NEW.tradie_id,
      NEW.customer_id,
      NEW.accepted_quote_line_item_id,
      NEW.amount
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_early_release_cap_summary(p_job_id uuid)
RETURNS TABLE (
  job_id uuid,
  application_id uuid,
  contract_total numeric,
  job_cap numeric,
  job_used numeric,
  job_remaining numeric,
  cap_source text,
  requires_quote_line_link boolean,
  can_request boolean,
  unavailable_reason text,
  line_caps jsonb
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false);
  v_job_customer uuid;
  v_job_status text;
  v_application_id uuid;
  v_tradie_id uuid;
  v_app_estimate numeric;
  v_snapshot_total numeric;
  v_contract_total numeric;
  v_source text;
  v_unavailable_reason text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT status, customer_id INTO v_job_status, v_job_customer
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job_status IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  SELECT id, tradie_id, estimate
  INTO v_application_id, v_tradie_id, v_app_estimate
  FROM public.applications
  WHERE job_id = p_job_id
    AND status = 'accepted'
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_application_id IS NULL THEN
    RAISE EXCEPTION 'Accepted application not found.';
  END IF;

  IF NOT (v_is_admin OR v_user_id = v_job_customer OR v_user_id = v_tradie_id) THEN
    RAISE EXCEPTION 'Not authorized to view early release caps for this job.';
  END IF;

  SELECT COALESCE(sum(aqli.line_total), 0)
  INTO v_snapshot_total
  FROM public.accepted_quote_line_items aqli
  WHERE aqli.job_id = p_job_id
    AND aqli.application_id = v_application_id;

  IF v_snapshot_total > 0 THEN
    v_contract_total := v_snapshot_total;
    v_source := 'accepted_quote_line_items';
  ELSIF v_app_estimate IS NOT NULL AND v_app_estimate > 0 THEN
    v_contract_total := v_app_estimate;
    v_source := 'legacy_application_estimate';
  ELSE
    v_contract_total := 0;
    v_source := 'unavailable';
    v_unavailable_reason := 'Early release requests are unavailable for this legacy job because the accepted contract amount is not clear.';
  END IF;

  RETURN QUERY
  SELECT
    p_job_id,
    v_application_id,
    v_contract_total,
    v_contract_total * 0.30,
    COALESCE((
      SELECT sum(err.amount)
      FROM public.early_release_requests err
      WHERE err.job_id = p_job_id
        AND err.status IN ('pending', 'approved')
    ), 0),
    GREATEST((v_contract_total * 0.30) - COALESCE((
      SELECT sum(err.amount)
      FROM public.early_release_requests err
      WHERE err.job_id = p_job_id
        AND err.status IN ('pending', 'approved')
    ), 0), 0),
    v_source,
    v_snapshot_total > 0,
    v_job_status IN ('accepted', 'payment_held') AND v_contract_total > 0,
    v_unavailable_reason,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'accepted_quote_line_item_id', aqli.id,
          'line_total', aqli.line_total,
          'used', COALESCE(used.used_amount, 0),
          'remaining', GREATEST(aqli.line_total - COALESCE(used.used_amount, 0), 0)
        )
        ORDER BY aqli.sort_order, aqli.created_at
      )
      FROM public.accepted_quote_line_items aqli
      LEFT JOIN LATERAL (
        SELECT sum(err.amount) AS used_amount
        FROM public.early_release_requests err
        WHERE err.accepted_quote_line_item_id = aqli.id
          AND err.status IN ('pending', 'approved')
      ) used ON TRUE
      WHERE aqli.job_id = p_job_id
        AND aqli.application_id = v_application_id
    ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.get_early_release_cap_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_early_release_cap_summary(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_early_release_cap_summary(uuid) IS
  'Returns early release cap totals only to the contracted tradie, job customer, admins, or service role. Caps are display-only; trigger validation remains authoritative.';
