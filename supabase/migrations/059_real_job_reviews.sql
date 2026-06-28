-- Migration: 059_real_job_reviews.sql
-- Purpose: Customer-to-tradie reviews tied to real completed/released jobs only.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_text_length_check'
      AND conrelid = 'public.reviews'::regclass
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_text_length_check
      CHECK (text IS NULL OR char_length(text) <= 1000);
  END IF;
END $$;

-- Reviews are public only when they are for the exact customer/tradie pair on a
-- completed job with released payment and no open dispute.
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
        AND j.customer_id = p_reviewer_id
        AND p.payer_id = p_reviewer_id
        AND p.payee_id = p_reviewee_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.job_issues ji
          WHERE ji.job_id = j.id
            AND ji.status = 'open'
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_submit_review(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_submit_review(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Completed participants can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;

CREATE POLICY "Completed customers can create tradie reviews" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND public.can_submit_review(job_id, reviewer_id, reviewee_id)
  );

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
    RAISE EXCEPTION 'Reviews require a completed, released job and the correct customer/tradie pair.';
  END IF;

  NEW.text := NULLIF(btrim(NEW.text), '');
  IF NEW.text IS NOT NULL AND char_length(NEW.text) > 1000 THEN
    RAISE EXCEPTION 'Review text must be 1000 characters or fewer.';
  END IF;

  NEW.submitted_at := now();
  NEW.unlocked := true;
  NEW.unlocked_at := now();
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

CREATE OR REPLACE FUNCTION public.submit_tradie_review(
  p_job_id uuid,
  p_tradie_id uuid,
  p_rating integer,
  p_text text DEFAULT NULL
)
RETURNS public.reviews
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_review public.reviews;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to leave a review.';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5.';
  END IF;

  INSERT INTO public.reviews (job_id, reviewer_id, reviewee_id, rating, text)
  VALUES (p_job_id, auth.uid(), p_tradie_id, p_rating, p_text)
  RETURNING * INTO v_review;

  RETURN v_review;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tradie_review(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_tradie_review(uuid, uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_public_tradie_reviews(p_tradie_id uuid)
RETURNS TABLE (
  id uuid,
  rating integer,
  text text,
  submitted_at timestamptz,
  reviewer_display_name text,
  reviewer_avatar_url text,
  job_title text,
  job_categories text[],
  job_suburb text,
  job_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    r.id,
    r.rating,
    r.text,
    r.submitted_at,
    COALESCE(NULLIF(u.display_name, ''), 'Verified customer') AS reviewer_display_name,
    u.avatar_url AS reviewer_avatar_url,
    j.title AS job_title,
    j.categories AS job_categories,
    j.suburb AS job_suburb,
    j.state AS job_state
  FROM public.reviews r
  JOIN public.jobs j ON j.id = r.job_id
  JOIN public.payments p ON p.job_id = j.id
  LEFT JOIN public.users u ON u.id = r.reviewer_id
  WHERE r.reviewee_id = p_tradie_id
    AND r.unlocked = true
    AND j.status = 'completed'
    AND p.status = 'released'
    AND j.customer_id = r.reviewer_id
    AND p.payer_id = r.reviewer_id
    AND p.payee_id = r.reviewee_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.job_issues ji
      WHERE ji.job_id = j.id
        AND ji.status = 'open'
    )
  ORDER BY r.submitted_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_public_tradie_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_tradie_reviews(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_tradie_review_summaries(p_tradie_ids uuid[])
RETURNS TABLE (
  tradie_id uuid,
  average_rating numeric,
  review_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    r.reviewee_id AS tradie_id,
    round(avg(r.rating)::numeric, 1) AS average_rating,
    count(*)::bigint AS review_count
  FROM public.reviews r
  JOIN public.jobs j ON j.id = r.job_id
  JOIN public.payments p ON p.job_id = j.id
  WHERE r.reviewee_id = ANY(p_tradie_ids)
    AND r.unlocked = true
    AND j.status = 'completed'
    AND p.status = 'released'
    AND j.customer_id = r.reviewer_id
    AND p.payer_id = r.reviewer_id
    AND p.payee_id = r.reviewee_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.job_issues ji
      WHERE ji.job_id = j.id
        AND ji.status = 'open'
    )
  GROUP BY r.reviewee_id;
$$;

REVOKE ALL ON FUNCTION public.list_public_tradie_review_summaries(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_tradie_review_summaries(uuid[]) TO anon, authenticated;

COMMENT ON POLICY "Completed customers can create tradie reviews" ON public.reviews IS
  'Allows only the original customer to review the contracted tradie after the job is completed, payment is released, and no open dispute exists.';

COMMENT ON FUNCTION public.submit_tradie_review(uuid, uuid, integer, text) IS
  'Submits one public customer-to-tradie review for an eligible completed/released TradieHubAU job.';

COMMENT ON FUNCTION public.list_public_tradie_reviews(uuid) IS
  'Returns public-safe tradie reviews tied to completed/released jobs without customer contact, address, payment, dispute, or private job details.';
