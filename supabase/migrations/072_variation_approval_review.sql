-- Migration: 072_variation_approval_review.sql
-- Description: Add customer/admin review for itemised variation requests and immutable approved variation line snapshots.

CREATE TABLE IF NOT EXISTS public.approved_variation_line_items (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_request_id            uuid NOT NULL REFERENCES public.job_variation_requests(id) ON DELETE CASCADE,
  original_variation_line_item_id uuid REFERENCES public.job_variation_line_items(id) ON DELETE SET NULL,
  job_id                          uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id                  uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  tradie_id                       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_id                     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label                           text NOT NULL CHECK (char_length(trim(label)) > 0),
  description                     text,
  quantity                        numeric NOT NULL CHECK (quantity > 0),
  unit_price                      numeric NOT NULL CHECK (unit_price >= 0),
  line_total                      numeric NOT NULL CHECK (line_total >= 0),
  line_type                       text NOT NULL CHECK (line_type IN ('labour', 'materials', 'callout', 'disposal', 'equipment', 'permit', 'other')),
  sort_order                      integer NOT NULL DEFAULT 0,
  approved_at                     timestamptz NOT NULL DEFAULT now(),
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approved_variation_line_items_request
  ON public.approved_variation_line_items(variation_request_id);
CREATE INDEX IF NOT EXISTS idx_approved_variation_line_items_job
  ON public.approved_variation_line_items(job_id);
CREATE INDEX IF NOT EXISTS idx_approved_variation_line_items_application
  ON public.approved_variation_line_items(application_id);
CREATE INDEX IF NOT EXISTS idx_approved_variation_line_items_tradie
  ON public.approved_variation_line_items(tradie_id);
CREATE INDEX IF NOT EXISTS idx_approved_variation_line_items_customer
  ON public.approved_variation_line_items(customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_approved_variation_line_items_unique_original
  ON public.approved_variation_line_items(variation_request_id, original_variation_line_item_id)
  WHERE original_variation_line_item_id IS NOT NULL;

ALTER TABLE public.approved_variation_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own approved variation line items"
  ON public.approved_variation_line_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      customer_id = auth.uid()
      OR tradie_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_approved_variation_line_mutation()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Approved variation line item snapshots are immutable.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_approved_variation_line_update_delete ON public.approved_variation_line_items;
CREATE TRIGGER prevent_approved_variation_line_update_delete
  BEFORE UPDATE OR DELETE ON public.approved_variation_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_approved_variation_line_mutation();

CREATE OR REPLACE FUNCTION public.validate_itemised_variation_request_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot modify a variation request that is already %.', OLD.status;
  END IF;

  IF NEW.job_id <> OLD.job_id OR
     NEW.application_id <> OLD.application_id OR
     NEW.tradie_id <> OLD.tradie_id OR
     NEW.customer_id <> OLD.customer_id OR
     NEW.title <> OLD.title OR
     NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION 'Immutable fields of a variation request cannot be modified after creation.';
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF auth.uid() <> OLD.tradie_id AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only the requesting tradie or an admin can cancel this variation request.';
    END IF;

    IF NEW.review_note IS DISTINCT FROM OLD.review_note OR
       NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
       NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
      RAISE EXCEPTION 'Variation review fields cannot be changed when cancelling.';
    END IF;
  ELSIF NEW.status IN ('approved', 'rejected') THEN
    IF auth.uid() <> OLD.customer_id AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only the customer or an admin can approve or reject variation requests.';
    END IF;

    IF auth.uid() = OLD.tradie_id AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Tradies cannot approve or reject their own variation requests.';
    END IF;

    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
    NEW.review_note := NULLIF(trim(COALESCE(NEW.review_note, '')), '');
  ELSIF NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid variation request status transition.';
  ELSE
    IF NEW.review_note IS DISTINCT FROM OLD.review_note OR
       NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
       NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
      RAISE EXCEPTION 'Variation review fields can only be changed when approving or rejecting.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.review_job_variation_request(
  p_variation_request_id uuid,
  p_decision text,
  p_review_note text DEFAULT NULL
)
RETURNS public.job_variation_requests
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false);
  v_request public.job_variation_requests%ROWTYPE;
  v_updated public.job_variation_requests%ROWTYPE;
  v_line_count integer;
  v_total numeric;
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
  FROM public.job_variation_requests
  WHERE id = p_variation_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Variation request not found.';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending variation requests can be reviewed.';
  END IF;

  IF NOT (v_is_admin OR v_user_id = v_request.customer_id) THEN
    RAISE EXCEPTION 'Only the customer or an admin can approve or reject variation requests.';
  END IF;

  IF v_user_id = v_request.tradie_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Tradies cannot approve or reject their own variation requests.';
  END IF;

  IF p_decision = 'approved' THEN
    SELECT count(*), COALESCE(sum(line_total), 0)
    INTO v_line_count, v_total
    FROM public.job_variation_line_items
    WHERE variation_request_id = p_variation_request_id;

    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'Cannot approve a variation request without line items.';
    END IF;

    IF v_total <= 0 THEN
      RAISE EXCEPTION 'Cannot approve a variation request with a zero total.';
    END IF;
  END IF;

  v_note := NULLIF(trim(COALESCE(p_review_note, '')), '');

  UPDATE public.job_variation_requests
  SET status = p_decision,
      review_note = v_note
  WHERE id = p_variation_request_id
  RETURNING * INTO v_updated;

  IF p_decision = 'approved' THEN
    INSERT INTO public.approved_variation_line_items (
      variation_request_id,
      original_variation_line_item_id,
      job_id,
      application_id,
      tradie_id,
      customer_id,
      label,
      description,
      quantity,
      unit_price,
      line_total,
      line_type,
      sort_order,
      approved_at
    )
    SELECT
      li.variation_request_id,
      li.id,
      li.job_id,
      li.application_id,
      li.tradie_id,
      li.customer_id,
      li.label,
      li.description,
      li.quantity,
      li.unit_price,
      li.line_total,
      li.line_type,
      li.sort_order,
      COALESCE(v_updated.reviewed_at, now())
    FROM public.job_variation_line_items li
    WHERE li.variation_request_id = p_variation_request_id
    ON CONFLICT (variation_request_id, original_variation_line_item_id)
      WHERE original_variation_line_item_id IS NOT NULL
      DO NOTHING;
  END IF;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.review_job_variation_request(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_job_variation_request(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON TABLE public.approved_variation_line_items IS
  'Immutable approved itemised variation line snapshots. Used as trustworthy groundwork for later funding/invoice itemisation; no money movement is performed here.';

COMMENT ON FUNCTION public.review_job_variation_request(uuid, text, text) IS
  'Allows the job customer or admin to approve/reject a pending itemised variation request. Approval snapshots line items and does not move funds.';
