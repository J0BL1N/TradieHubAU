-- Migration: 070_early_release_review_rpc.sql
-- Description: Add a permission-checked RPC for customer/admin review of early release requests.

CREATE OR REPLACE FUNCTION public.validate_early_release_request_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot modify an early release request that is already %.', OLD.status;
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

  IF NEW.status IN ('approved', 'rejected') THEN
    IF auth.uid() <> OLD.customer_id AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only the customer or an admin can approve or reject early release requests.';
    END IF;

    IF auth.uid() = OLD.tradie_id AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Tradies cannot approve or reject their own early release requests.';
    END IF;

    IF NEW.status = 'approved' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(NEW.job_id::text, 0));

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

    NEW.reviewed_at := NOW();
    NEW.reviewed_by := auth.uid();
    NEW.review_note := NULLIF(trim(COALESCE(NEW.review_note, '')), '');
  ELSIF NEW.status = 'cancelled' THEN
    IF auth.uid() <> OLD.tradie_id AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only the requesting tradie can cancel this early release request.';
    END IF;

    IF NEW.review_note IS DISTINCT FROM OLD.review_note OR
       NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
       NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
      RAISE EXCEPTION 'Review fields cannot be changed when cancelling an early release request.';
    END IF;
  ELSE
    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Invalid early release request status transition.';
    END IF;

    IF NEW.review_note IS DISTINCT FROM OLD.review_note OR
       NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
       NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
      RAISE EXCEPTION 'Review fields can only be changed when approving or rejecting an early release request.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.review_early_release_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text DEFAULT NULL
)
RETURNS public.early_release_requests
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false);
  v_request public.early_release_requests%ROWTYPE;
  v_updated public.early_release_requests%ROWTYPE;
  v_note text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.';
  END IF;

  SELECT *
  INTO v_request
  FROM public.early_release_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Early release request not found.';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending early release requests can be reviewed.';
  END IF;

  IF NOT (v_is_admin OR v_user_id = v_request.customer_id) THEN
    RAISE EXCEPTION 'Only the customer or an admin can approve or reject early release requests.';
  END IF;

  IF v_user_id = v_request.tradie_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Tradies cannot approve or reject their own early release requests.';
  END IF;

  IF p_decision = 'approved' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_request.job_id::text, 0));

    PERFORM public.check_early_release_caps(
      v_request.id,
      v_request.job_id,
      v_request.application_id,
      v_request.tradie_id,
      v_request.customer_id,
      v_request.accepted_quote_line_item_id,
      v_request.amount
    );
  END IF;

  v_note := NULLIF(trim(COALESCE(p_review_note, '')), '');

  UPDATE public.early_release_requests
  SET status = p_decision,
      review_note = v_note
  WHERE id = p_request_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.review_early_release_request(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_early_release_request(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.review_early_release_request(uuid, text, text) IS
  'Allows only the job customer or an admin to approve/reject pending early release requests. Approval reruns early release cap validation and does not release funds.';
