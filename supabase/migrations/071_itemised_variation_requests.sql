-- Migration: 071_itemised_variation_requests.sql
-- Description: Add itemised variation request groundwork without funding, release, or invoice changes.

CREATE TABLE IF NOT EXISTS public.job_variation_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  tradie_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (char_length(trim(title)) > 0),
  reason         text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_note    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_variation_line_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_request_id uuid NOT NULL REFERENCES public.job_variation_requests(id) ON DELETE CASCADE,
  job_id               uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id       uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  tradie_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label                text NOT NULL CHECK (char_length(trim(label)) > 0),
  description          text,
  quantity             numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price           numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total           numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  line_type            text NOT NULL DEFAULT 'labour' CHECK (line_type IN ('labour', 'materials', 'callout', 'disposal', 'equipment', 'permit', 'other')),
  sort_order           integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_variation_requests_job ON public.job_variation_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_job_variation_requests_application ON public.job_variation_requests(application_id);
CREATE INDEX IF NOT EXISTS idx_job_variation_requests_tradie ON public.job_variation_requests(tradie_id);
CREATE INDEX IF NOT EXISTS idx_job_variation_requests_customer ON public.job_variation_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_variation_requests_status ON public.job_variation_requests(status);
CREATE INDEX IF NOT EXISTS idx_job_variation_line_items_request ON public.job_variation_line_items(variation_request_id);
CREATE INDEX IF NOT EXISTS idx_job_variation_line_items_job ON public.job_variation_line_items(job_id);

ALTER TABLE public.job_variation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_variation_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own itemised variation requests"
  ON public.job_variation_requests FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      customer_id = auth.uid()
      OR tradie_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

CREATE POLICY "Users can select own itemised variation lines"
  ON public.job_variation_line_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      customer_id = auth.uid()
      OR tradie_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

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
  ELSIF NEW.status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Variation approval and rejection controls will be added in a later phase.';
  ELSIF NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid variation request status transition.';
  END IF;

  IF NEW.review_note IS DISTINCT FROM OLD.review_note OR
     NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
     NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
    RAISE EXCEPTION 'Variation review fields cannot be changed in this phase.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_itemised_variation_request_update_trigger ON public.job_variation_requests;
CREATE TRIGGER validate_itemised_variation_request_update_trigger
  BEFORE UPDATE ON public.job_variation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_itemised_variation_request_update();

DROP TRIGGER IF EXISTS update_job_variation_requests_updated_at ON public.job_variation_requests;
CREATE TRIGGER update_job_variation_requests_updated_at
  BEFORE UPDATE ON public.job_variation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.prevent_itemised_variation_line_mutation()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Variation line items are immutable after creation.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_itemised_variation_line_update_delete ON public.job_variation_line_items;
CREATE TRIGGER prevent_itemised_variation_line_update_delete
  BEFORE UPDATE OR DELETE ON public.job_variation_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_itemised_variation_line_mutation();

CREATE OR REPLACE FUNCTION public.create_itemised_variation_request(
  p_job_id uuid,
  p_title text,
  p_reason text DEFAULT NULL,
  p_line_items jsonb DEFAULT '[]'::jsonb
)
RETURNS public.job_variation_requests
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_job_status text;
  v_customer_id uuid;
  v_application_id uuid;
  v_tradie_id uuid;
  v_request public.job_variation_requests%ROWTYPE;
  v_line jsonb;
  v_label text;
  v_description text;
  v_quantity numeric;
  v_unit_price numeric;
  v_line_type text;
  v_total numeric := 0;
  v_sort_order integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF char_length(trim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'Variation title is required.';
  END IF;

  IF jsonb_typeof(p_line_items) <> 'array' OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'At least one variation line item is required.';
  END IF;

  SELECT status, customer_id
  INTO v_job_status, v_customer_id
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job_status IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  IF v_job_status NOT IN ('accepted', 'payment_held') THEN
    RAISE EXCEPTION 'Variation requests can only be created for accepted or active contracts (current status: %).', v_job_status;
  END IF;

  SELECT id, tradie_id
  INTO v_application_id, v_tradie_id
  FROM public.applications
  WHERE job_id = p_job_id
    AND status = 'accepted'
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_application_id IS NULL THEN
    RAISE EXCEPTION 'Accepted application not found.';
  END IF;

  IF v_tradie_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the contracted tradie can create variation requests.';
  END IF;

  INSERT INTO public.job_variation_requests (
    job_id,
    application_id,
    tradie_id,
    customer_id,
    title,
    reason
  )
  VALUES (
    p_job_id,
    v_application_id,
    v_tradie_id,
    v_customer_id,
    trim(p_title),
    NULLIF(trim(COALESCE(p_reason, '')), '')
  )
  RETURNING * INTO v_request;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    v_label := trim(COALESCE(v_line->>'label', ''));
    v_description := NULLIF(trim(COALESCE(v_line->>'description', '')), '');
    v_quantity := COALESCE(NULLIF(v_line->>'quantity', '')::numeric, 0);
    v_unit_price := COALESCE(NULLIF(v_line->>'unit_price', '')::numeric, -1);
    v_line_type := COALESCE(NULLIF(v_line->>'line_type', ''), 'labour');

    IF char_length(v_label) = 0 THEN
      RAISE EXCEPTION 'Each variation line item must have a label.';
    END IF;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Variation line item quantity must be greater than zero.';
    END IF;

    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Variation line item unit price cannot be negative.';
    END IF;

    IF v_line_type NOT IN ('labour', 'materials', 'callout', 'disposal', 'equipment', 'permit', 'other') THEN
      RAISE EXCEPTION 'Invalid variation line item type.';
    END IF;

    v_total := v_total + (v_quantity * v_unit_price);

    INSERT INTO public.job_variation_line_items (
      variation_request_id,
      job_id,
      application_id,
      tradie_id,
      customer_id,
      label,
      description,
      quantity,
      unit_price,
      line_type,
      sort_order
    )
    VALUES (
      v_request.id,
      p_job_id,
      v_application_id,
      v_tradie_id,
      v_customer_id,
      v_label,
      v_description,
      v_quantity,
      v_unit_price,
      v_line_type,
      v_sort_order
    );

    v_sort_order := v_sort_order + 1;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Variation total must be greater than zero.';
  END IF;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.cancel_itemised_variation_request(p_request_id uuid)
RETURNS public.job_variation_requests
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request public.job_variation_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT *
  INTO v_request
  FROM public.job_variation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Variation request not found.';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending variation requests can be cancelled.';
  END IF;

  IF v_request.tradie_id <> v_user_id AND NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Only the requesting tradie or an admin can cancel this variation request.';
  END IF;

  UPDATE public.job_variation_requests
  SET status = 'cancelled'
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.create_itemised_variation_request(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_itemised_variation_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_itemised_variation_request(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_itemised_variation_request(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.job_variation_requests IS
  'Itemised variation request headers for extra work/materials after quote acceptance. Chunk I stores requests only; no funding, release, or invoice behavior.';

COMMENT ON TABLE public.job_variation_line_items IS
  'Immutable itemised variation request line items with generated line totals.';
