-- Migration: 034_harden_review_creation.sql
-- Description: Resolve Medium Issue M-06 by requiring completed-job participant
-- and counterparty linkage for review creation.

-- Evaluate job/payment participation through a narrow SECURITY DEFINER helper so
-- review RLS remains reliable for both the customer and contracted tradie.
CREATE OR REPLACE FUNCTION public.can_submit_review(
  p_job_id uuid,
  p_reviewer_id uuid,
  p_reviewee_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_reviewer_id = auth.uid()
    AND p_reviewee_id IS DISTINCT FROM p_reviewer_id
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.payments p ON p.job_id = j.id
      WHERE j.id = p_job_id
        AND j.status = 'completed'
        AND p.status = 'released'
        AND (
          (
            j.customer_id = p_reviewer_id
            AND p.payer_id = p_reviewer_id
            AND p.payee_id = p_reviewee_id
          )
          OR
          (
            p.payee_id = p_reviewer_id
            AND j.customer_id = p_reviewee_id
            AND p.payer_id = p_reviewee_id
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_submit_review(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_submit_review(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;

CREATE POLICY "Completed participants can create reviews" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND public.can_submit_review(job_id, reviewer_id, reviewee_id)
  );

-- Client-supplied linkage is validated above; review visibility and timestamps
-- remain system-managed. No ordinary-user UPDATE policy exists on reviews.
CREATE OR REPLACE FUNCTION public.protect_review_insert()
RETURNS trigger
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.reviewer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'The authenticated user must be the review author.';
  END IF;

  IF NEW.job_id IS NULL OR NOT public.can_submit_review(
    NEW.job_id,
    NEW.reviewer_id,
    NEW.reviewee_id
  ) THEN
    RAISE EXCEPTION 'Reviews require a completed job and the correct participant counterparty.';
  END IF;

  NEW.submitted_at := now();
  NEW.unlocked := false;
  NEW.unlocked_at := NULL;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_review_insert_trigger ON public.reviews;
CREATE TRIGGER protect_review_insert_trigger
  BEFORE INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_review_insert();

-- The existing unique_review(job_id, reviewer_id, reviewee_id) constraint blocks
-- duplicate reviews for the same job, author, and counterparty.

-- Review unlocking is the only trusted review UPDATE path. It runs after a valid
-- counterparty review arrives and preserves the existing double-blind behaviour.
CREATE OR REPLACE FUNCTION public.check_and_unlock_reviews()
RETURNS trigger
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  counterpart_review_id uuid;
BEGIN
  SELECT r.id
  INTO counterpart_review_id
  FROM public.reviews r
  WHERE r.job_id = NEW.job_id
    AND r.reviewer_id = NEW.reviewee_id
    AND r.reviewee_id = NEW.reviewer_id
    AND r.id <> NEW.id;

  IF counterpart_review_id IS NOT NULL THEN
    UPDATE public.reviews
    SET unlocked = true, unlocked_at = now()
    WHERE id IN (NEW.id, counterpart_review_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.check_and_unlock_reviews() FROM PUBLIC;

COMMENT ON POLICY "Completed participants can create reviews" ON public.reviews IS
  'Allows one review per completed/released job participant for that job''s exact customer/tradie counterparty.';

COMMENT ON FUNCTION public.can_submit_review(uuid, uuid, uuid) IS
  'Validates authenticated reviewer, completed job, released payment, and exact payer/payee counterparty linkage.';
