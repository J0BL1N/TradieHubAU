-- Migration: 068_early_release_requests.sql
-- Description: Create public.early_release_requests table, indexes, RLS policies, context-matching insert triggers, and role-enforced update triggers.

-- 1. Create the Early Release Requests Table
CREATE TABLE IF NOT EXISTS public.early_release_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                      UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id              UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  tradie_id                   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  accepted_quote_line_item_id UUID REFERENCES public.accepted_quote_line_items(id) ON DELETE SET NULL,
  
  request_type                TEXT NOT NULL CHECK (request_type IN ('materials', 'fuel', 'mobilisation', 'permit', 'equipment', 'other')),
  title                       TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description                 TEXT,
  amount                      NUMERIC NOT NULL CHECK (amount > 0),
  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  
  requested_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at                 TIMESTAMPTZ,
  reviewed_by                 UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_note                 TEXT,
  
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for Query Performance
CREATE INDEX idx_early_release_requests_job ON public.early_release_requests(job_id);
CREATE INDEX idx_early_release_requests_application ON public.early_release_requests(application_id);
CREATE INDEX idx_early_release_requests_tradie ON public.early_release_requests(tradie_id);
CREATE INDEX idx_early_release_requests_customer ON public.early_release_requests(customer_id);

-- 3. Enable RLS
ALTER TABLE public.early_release_requests ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can select own early release requests"
  ON public.early_release_requests FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      customer_id = auth.uid()
      OR tradie_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

CREATE POLICY "Tradies can insert own early release requests"
  ON public.early_release_requests FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
  );

CREATE POLICY "Users can update own early release requests"
  ON public.early_release_requests FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      customer_id = auth.uid()
      OR tradie_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      customer_id = auth.uid()
      OR tradie_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

CREATE POLICY "Admins can delete early release requests"
  ON public.early_release_requests FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.is_admin(auth.uid())
  );

-- 5. Trigger Function: Validate Early Release Request Context on Insert
CREATE OR REPLACE FUNCTION public.validate_early_release_request()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_status text;
  v_job_customer uuid;
  v_app_status text;
  v_app_tradie uuid;
  v_line_job uuid;
  v_line_app uuid;
BEGIN
  -- Check parent job exists and get status & customer
  SELECT status, customer_id INTO v_job_status, v_job_customer
  FROM public.jobs WHERE id = NEW.job_id;
  IF v_job_status IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- Verify job status is either 'accepted' or 'payment_held' (work-in-progress/active contract states)
  IF v_job_status NOT IN ('accepted', 'payment_held') THEN
    RAISE EXCEPTION 'Early release requests can only be created for active or accepted jobs (current status: %).', v_job_status;
  END IF;

  -- Check parent application exists and get status & tradie
  SELECT status, tradie_id INTO v_app_status, v_app_tradie
  FROM public.applications WHERE id = NEW.application_id;
  IF v_app_status IS NULL THEN
    RAISE EXCEPTION 'Application not found.';
  END IF;

  -- Verify application is accepted for this job
  IF v_app_status <> 'accepted' THEN
    RAISE EXCEPTION 'Application must be accepted before requesting early release.';
  END IF;

  -- Verify client provided user IDs match actual job/application context
  IF NEW.tradie_id <> v_app_tradie THEN
    RAISE EXCEPTION 'tradie_id must match the accepted applicant.';
  END IF;
  IF NEW.customer_id <> v_job_customer THEN
    RAISE EXCEPTION 'customer_id must match the job owner.';
  END IF;

  -- If linking to an accepted quote line, verify matching context
  IF NEW.accepted_quote_line_item_id IS NOT NULL THEN
    SELECT job_id, application_id INTO v_line_job, v_line_app
    FROM public.accepted_quote_line_items
    WHERE id = NEW.accepted_quote_line_item_id;
    
    IF v_line_job IS NULL THEN
      RAISE EXCEPTION 'Linked accepted quote line item not found.';
    END IF;
    IF v_line_job <> NEW.job_id OR v_line_app <> NEW.application_id THEN
      RAISE EXCEPTION 'Linked quote line item does not belong to this contract.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_early_release_request_trigger ON public.early_release_requests;
CREATE TRIGGER validate_early_release_request_trigger
  BEFORE INSERT ON public.early_release_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_early_release_request();

-- 6. Trigger Function: Validate and enforce status transition boundaries on update
CREATE OR REPLACE FUNCTION public.validate_early_release_request_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If status was already resolved, prevent any modifications
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot modify an early release request that is already %.', OLD.status;
  END IF;

  -- Role based check for status updates
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

  -- Prevent modifying immutable fields
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_early_release_request_update_trigger ON public.early_release_requests;
CREATE TRIGGER validate_early_release_request_update_trigger
  BEFORE UPDATE ON public.early_release_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_early_release_request_update();

-- 7. Updated At Trigger
CREATE TRIGGER update_early_release_requests_updated_at
  BEFORE UPDATE ON public.early_release_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
