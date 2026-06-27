-- Migration: 046_public_completion_proof_publishing.sql
-- Description: Add tradie-controlled, public-safe publishing of completed job proof images.

ALTER TABLE public.job_completion_proofs
  ADD COLUMN IF NOT EXISTS portfolio_title text CHECK (
    portfolio_title IS NULL OR char_length(btrim(portfolio_title)) BETWEEN 1 AND 120
  ),
  ADD COLUMN IF NOT EXISTS portfolio_caption text CHECK (
    portfolio_caption IS NULL OR char_length(btrim(portfolio_caption)) <= 280
  ),
  ADD COLUMN IF NOT EXISTS portfolio_trade_category text,
  ADD COLUMN IF NOT EXISTS portfolio_published_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_completion_proofs_public_portfolio
  ON public.job_completion_proofs(tradie_id, is_public_portfolio, created_at);

CREATE OR REPLACE FUNCTION public.safe_completion_proof_attachments(
  p_job_id uuid,
  p_tradie_id uuid,
  p_attachments text[]
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(array_agg(path ORDER BY ord), '{}')::text[]
  FROM unnest(COALESCE(p_attachments, '{}')) WITH ORDINALITY AS attachment(path, ord)
  WHERE path LIKE 'jobs/' || p_job_id::text || '/' || p_tradie_id::text || '/%'
    AND path NOT LIKE '%/../%'
    AND path NOT LIKE '../%'
    AND path <> '';
$$;

CREATE OR REPLACE FUNCTION public.list_my_portfolio_completion_proofs()
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  attachments text[],
  is_public_portfolio boolean,
  portfolio_title text,
  portfolio_caption text,
  portfolio_trade_category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    jcp.id,
    jcp.created_at,
    public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments) AS attachments,
    jcp.is_public_portfolio,
    jcp.portfolio_title,
    jcp.portfolio_caption,
    jcp.portfolio_trade_category
  FROM public.job_completion_proofs jcp
  JOIN public.jobs j ON j.id = jcp.job_id
  JOIN public.payments p ON p.job_id = j.id AND p.payee_id = jcp.tradie_id
  WHERE auth.uid() IS NOT NULL
    AND jcp.tradie_id = auth.uid()
    AND j.status = 'completed'
    AND p.status = 'released'
    AND cardinality(public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments)) > 0
  ORDER BY jcp.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.update_completion_proof_portfolio_publication(
  p_proof_id uuid,
  p_is_public_portfolio boolean,
  p_portfolio_title text DEFAULT NULL,
  p_portfolio_caption text DEFAULT NULL,
  p_portfolio_trade_category text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_proof public.job_completion_proofs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  SELECT jcp.*
  INTO v_proof
  FROM public.job_completion_proofs jcp
  JOIN public.jobs j ON j.id = jcp.job_id
  JOIN public.payments p ON p.job_id = j.id AND p.payee_id = jcp.tradie_id
  WHERE jcp.id = p_proof_id
    AND jcp.tradie_id = auth.uid()
    AND j.status = 'completed'
    AND p.status = 'released'
  FOR UPDATE OF jcp;

  IF v_proof.id IS NULL THEN
    RAISE EXCEPTION 'Completion proof is not eligible for public portfolio publishing.';
  END IF;

  IF cardinality(public.safe_completion_proof_attachments(v_proof.job_id, v_proof.tradie_id, v_proof.attachments)) = 0 THEN
    RAISE EXCEPTION 'Completion proof has no eligible public portfolio images.';
  END IF;

  UPDATE public.job_completion_proofs
  SET
    is_public_portfolio = COALESCE(p_is_public_portfolio, false),
    portfolio_title = NULLIF(btrim(p_portfolio_title), ''),
    portfolio_caption = NULLIF(btrim(p_portfolio_caption), ''),
    portfolio_trade_category = NULLIF(btrim(p_portfolio_trade_category), ''),
    portfolio_published_at = CASE
      WHEN COALESCE(p_is_public_portfolio, false) IS TRUE THEN COALESCE(portfolio_published_at, now())
      ELSE NULL
    END
  WHERE id = p_proof_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_public_tradie_completion_proof_gallery(p_tradie_id uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  attachments text[],
  portfolio_title text,
  portfolio_caption text,
  portfolio_trade_category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    jcp.id,
    jcp.created_at,
    public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments) AS attachments,
    jcp.portfolio_title,
    jcp.portfolio_caption,
    jcp.portfolio_trade_category
  FROM public.job_completion_proofs jcp
  JOIN public.jobs j ON j.id = jcp.job_id
  JOIN public.payments p ON p.job_id = j.id AND p.payee_id = jcp.tradie_id
  JOIN public.public_profiles pp ON pp.id = jcp.tradie_id
  WHERE jcp.tradie_id = p_tradie_id
    AND jcp.is_public_portfolio IS TRUE
    AND j.status = 'completed'
    AND p.status = 'released'
    AND pp.role IN ('tradie', 'dual')
    AND cardinality(public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments)) > 0
  ORDER BY jcp.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.can_read_public_completion_proof_image(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_completion_proofs jcp
    JOIN public.jobs j ON j.id = jcp.job_id
    JOIN public.payments p ON p.job_id = j.id AND p.payee_id = jcp.tradie_id
    JOIN public.public_profiles pp ON pp.id = jcp.tradie_id
    WHERE jcp.is_public_portfolio IS TRUE
      AND j.status = 'completed'
      AND p.status = 'released'
      AND pp.role IN ('tradie', 'dual')
      AND p_name = ANY(public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments))
  );
$$;

REVOKE ALL ON FUNCTION public.safe_completion_proof_attachments(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_portfolio_completion_proofs() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_completion_proof_portfolio_publication(uuid, boolean, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_tradie_completion_proof_gallery(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_read_public_completion_proof_image(text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.safe_completion_proof_attachments(uuid, uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_portfolio_completion_proofs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_completion_proof_portfolio_publication(uuid, boolean, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_tradie_completion_proof_gallery(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_public_completion_proof_image(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public reads explicitly public completion proofs" ON public.job_completion_proofs;
-- Public gallery reads go through list_public_tradie_completion_proof_gallery()
-- so raw completion descriptions, job ids, and unfiltered attachment arrays are
-- not exposed to anonymous profile visitors.

DROP POLICY IF EXISTS "Public reads public completion proof images" ON storage.objects;
CREATE POLICY "Public reads public completion proof images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'completion_proofs'
    AND split_part(name, '/', 1) = 'jobs'
    AND array_length(string_to_array(name, '/'), 1) = 4
    AND public.can_read_public_completion_proof_image(name)
  );

DROP POLICY IF EXISTS "Public reads public portfolio images" ON storage.objects;
CREATE POLICY "Public reads public portfolio images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'portfolio_images'
    AND (
      name LIKE 'portfolio/' || auth.uid()::text || '/%'
      OR EXISTS (
        SELECT 1
        FROM public.tradie_portfolio_items tpi
        JOIN public.public_profiles pp ON pp.id = tpi.owner_id
        WHERE tpi.is_public IS TRUE
          AND pp.role IN ('tradie', 'dual')
          AND split_part(name, '/', 1) = 'portfolio'
          AND split_part(name, '/', 2) = tpi.owner_id::text
          AND name = ANY(tpi.image_paths)
      )
    )
  );

COMMENT ON COLUMN public.job_completion_proofs.portfolio_title IS
  'Optional tradie-authored public-safe title for showing a completed work proof in a public profile gallery.';
COMMENT ON COLUMN public.job_completion_proofs.portfolio_caption IS
  'Optional tradie-authored public-safe caption for public profile gallery use. Do not store customer names, addresses, or private job details.';
COMMENT ON COLUMN public.job_completion_proofs.portfolio_trade_category IS
  'Optional public-safe trade/category label for a published completion proof image.';
COMMENT ON FUNCTION public.update_completion_proof_portfolio_publication(uuid, boolean, text, text, text) IS
  'Allows the assigned tradie to publish or unpublish their own completion proof images only after the job is completed and payment is released.';
