-- Migration: 058_completed_work_portfolio_foundation.sql
-- Description: Expose completed-work portfolio entries from real completed jobs only.

DROP FUNCTION IF EXISTS public.list_public_tradie_gallery(uuid);
DROP FUNCTION IF EXISTS public.list_public_tradie_completion_proof_gallery(uuid);
DROP FUNCTION IF EXISTS public.list_my_portfolio_completion_proofs();

CREATE OR REPLACE FUNCTION public.list_my_portfolio_completion_proofs()
RETURNS TABLE (
  id uuid,
  job_title text,
  job_categories text[],
  job_suburb text,
  job_state text,
  completed_at timestamptz,
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
    j.title AS job_title,
    j.categories AS job_categories,
    j.suburb AS job_suburb,
    j.state AS job_state,
    j.updated_at AS completed_at,
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
    AND NOT EXISTS (
      SELECT 1
      FROM public.job_issues ji
      WHERE ji.job_id = j.id
        AND ji.status = 'open'
    )
    AND cardinality(public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments)) > 0
  ORDER BY j.updated_at DESC, jcp.created_at DESC;
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
    AND NOT EXISTS (
      SELECT 1
      FROM public.job_issues ji
      WHERE ji.job_id = j.id
        AND ji.status = 'open'
    )
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
  job_title text,
  job_categories text[],
  job_suburb text,
  job_state text,
  completed_at timestamptz,
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
    j.title AS job_title,
    j.categories AS job_categories,
    j.suburb AS job_suburb,
    j.state AS job_state,
    j.updated_at AS completed_at,
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
    AND NOT EXISTS (
      SELECT 1
      FROM public.job_issues ji
      WHERE ji.job_id = j.id
        AND ji.status = 'open'
    )
    AND cardinality(public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments)) > 0
  ORDER BY COALESCE(jcp.portfolio_published_at, jcp.created_at) DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_public_tradie_gallery(p_tradie_id uuid)
RETURNS TABLE (
  id uuid,
  job_title text,
  job_categories text[],
  job_suburb text,
  job_state text,
  completed_at timestamptz,
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
  SELECT * FROM public.list_public_tradie_completion_proof_gallery(p_tradie_id);
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.job_issues ji
        WHERE ji.job_id = j.id
          AND ji.status = 'open'
      )
      AND p_name = ANY(public.safe_completion_proof_attachments(jcp.job_id, jcp.tradie_id, jcp.attachments))
  );
$$;

GRANT EXECUTE ON FUNCTION public.list_my_portfolio_completion_proofs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_completion_proof_portfolio_publication(uuid, boolean, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_tradie_completion_proof_gallery(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_tradie_gallery(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_public_completion_proof_image(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.list_my_portfolio_completion_proofs() IS
  'Lists the authenticated tradie''s eligible completed-work portfolio entries from real completed, released, undisputed jobs only.';
COMMENT ON FUNCTION public.list_public_tradie_gallery(uuid) IS
  'Public-safe completed work gallery for a tradie profile. Exposes only opt-in completed job title, category, suburb/state, completion date, safe caption, and filtered completion proof image paths.';
