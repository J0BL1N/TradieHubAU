-- Migration: 049_job_workspace_images_and_budget_type.sql
-- Description: Add private job workspace images and simple budget metadata while preserving existing budget_min/budget_max fields.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS estimated_budget integer,
  ADD COLUMN IF NOT EXISTS budget_type text NOT NULL DEFAULT 'rough_estimate',
  ADD COLUMN IF NOT EXISTS workspace_image_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_budget_type_check,
  DROP CONSTRAINT IF EXISTS jobs_estimated_budget_check,
  DROP CONSTRAINT IF EXISTS jobs_workspace_image_count_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_budget_type_check
  CHECK (budget_type IN ('rough_estimate', 'fixed_budget', 'need_quotes')),
  ADD CONSTRAINT jobs_estimated_budget_check
  CHECK (estimated_budget IS NULL OR estimated_budget >= 0),
  ADD CONSTRAINT jobs_workspace_image_count_check
  CHECK (workspace_image_count >= 0 AND workspace_image_count <= 5);

CREATE TABLE IF NOT EXISTS public.job_workspace_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'job_workspace_images',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_workspace_images_bucket_check CHECK (bucket_id = 'job_workspace_images'),
  CONSTRAINT job_workspace_images_storage_path_unique UNIQUE (storage_path),
  CONSTRAINT job_workspace_images_file_size_check CHECK (file_size > 0 AND file_size <= 5242880),
  CONSTRAINT job_workspace_images_mime_type_check CHECK (mime_type IN ('image/jpeg', 'image/jpg', 'image/png', 'image/webp'))
);

CREATE INDEX IF NOT EXISTS idx_job_workspace_images_job_id
  ON public.job_workspace_images(job_id);

CREATE INDEX IF NOT EXISTS idx_job_workspace_images_owner_id
  ON public.job_workspace_images(owner_id);

ALTER TABLE public.job_workspace_images ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job_workspace_images',
  'job_workspace_images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

CREATE OR REPLACE FUNCTION public.can_read_job_workspace_image(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = p_job_id
      AND (
        j.customer_id = auth.uid()
        OR public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.payments p
          WHERE p.job_id = j.id
            AND p.payee_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.applications a
          WHERE a.job_id = j.id
            AND a.tradie_id = auth.uid()
            AND a.status = 'accepted'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_job_workspace_image(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_job_workspace_image(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Job owners insert workspace images" ON public.job_workspace_images;
CREATE POLICY "Job owners insert workspace images"
  ON public.job_workspace_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_workspace_images.job_id
        AND j.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authorized users read workspace images" ON public.job_workspace_images;
CREATE POLICY "Authorized users read workspace images"
  ON public.job_workspace_images
  FOR SELECT
  TO authenticated
  USING (public.can_read_job_workspace_image(job_id));

DROP POLICY IF EXISTS "Job owners delete workspace images" ON public.job_workspace_images;
CREATE POLICY "Job owners delete workspace images"
  ON public.job_workspace_images
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Job owners upload workspace images" ON storage.objects;
CREATE POLICY "Job owners upload workspace images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'job_workspace_images'
    AND split_part(name, '/', 1) = 'jobs'
    AND split_part(name, '/', 3) = auth.uid()::text
    AND array_length(string_to_array(name, '/'), 1) = 4
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 4) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = split_part(name, '/', 2)::uuid
        AND j.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authorized users read workspace image objects" ON storage.objects;
CREATE POLICY "Authorized users read workspace image objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job_workspace_images'
    AND split_part(name, '/', 1) = 'jobs'
    AND array_length(string_to_array(name, '/'), 1) = 4
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_read_job_workspace_image(split_part(name, '/', 2)::uuid)
  );

DROP POLICY IF EXISTS "Job owners delete workspace image objects" ON storage.objects;
CREATE POLICY "Job owners delete workspace image objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'job_workspace_images'
    AND split_part(name, '/', 1) = 'jobs'
    AND split_part(name, '/', 3) = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.sync_job_workspace_image_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  v_job_id := COALESCE(NEW.job_id, OLD.job_id);

  UPDATE public.jobs
  SET workspace_image_count = (
    SELECT COUNT(*)::integer
    FROM public.job_workspace_images jwi
    WHERE jwi.job_id = v_job_id
  )
  WHERE id = v_job_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_job_workspace_image_count() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_job_workspace_image_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.job_workspace_images jwi
    WHERE jwi.job_id = NEW.job_id
  ) >= 5 THEN
    RAISE EXCEPTION 'A job can have at most 5 workspace images.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_job_workspace_image_limit() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_job_workspace_image_limit_trigger ON public.job_workspace_images;
CREATE TRIGGER enforce_job_workspace_image_limit_trigger
  BEFORE INSERT ON public.job_workspace_images
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_job_workspace_image_limit();

DROP TRIGGER IF EXISTS sync_job_workspace_image_count_trigger ON public.job_workspace_images;
CREATE TRIGGER sync_job_workspace_image_count_trigger
  AFTER INSERT OR DELETE ON public.job_workspace_images
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_job_workspace_image_count();

UPDATE public.jobs j
SET workspace_image_count = counts.image_count
FROM (
  SELECT job_id, COUNT(*)::integer AS image_count
  FROM public.job_workspace_images
  GROUP BY job_id
) counts
WHERE j.id = counts.job_id;

UPDATE public.jobs
SET workspace_image_count = 0
WHERE workspace_image_count IS NULL;

COMMENT ON TABLE public.job_workspace_images IS
  'Private workspace/problem images attached to a job. Public browse surfaces show only workspace_image_count.';
COMMENT ON COLUMN public.jobs.budget_type IS
  'Simple customer-facing budget mode while preserving budget_min and budget_max compatibility.';
COMMENT ON COLUMN public.jobs.workspace_image_count IS
  'Public-safe count used to show whether private workspace photos are attached without exposing the images publicly.';
