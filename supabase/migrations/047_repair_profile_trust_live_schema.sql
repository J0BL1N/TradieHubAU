-- Migration: 047_repair_profile_trust_live_schema.sql
-- Description: Idempotently repair hosted profile trust schema, storage buckets,
-- public-safe profile view, portfolio table, and gallery RPCs after partial 045/046 application.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS years_experience integer,
  ADD COLUMN IF NOT EXISTS service_areas text[],
  ADD COLUMN IF NOT EXISTS website_url text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_years_experience_profile_trust_check;

UPDATE public.users
SET years_experience = NULL
WHERE years_experience < 0
   OR years_experience > 80;

ALTER TABLE public.users
  ADD CONSTRAINT users_years_experience_profile_trust_check
  CHECK (years_experience IS NULL OR (years_experience >= 0 AND years_experience <= 80));

ALTER TABLE public.job_completion_proofs
  ADD COLUMN IF NOT EXISTS is_public_portfolio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portfolio_title text,
  ADD COLUMN IF NOT EXISTS portfolio_caption text,
  ADD COLUMN IF NOT EXISTS portfolio_trade_category text,
  ADD COLUMN IF NOT EXISTS portfolio_published_at timestamptz;

ALTER TABLE public.job_completion_proofs
  ALTER COLUMN is_public_portfolio SET DEFAULT false;

UPDATE public.job_completion_proofs
SET is_public_portfolio = false
WHERE is_public_portfolio IS NULL;

ALTER TABLE public.job_completion_proofs
  ALTER COLUMN is_public_portfolio SET NOT NULL;

ALTER TABLE public.job_completion_proofs
  DROP CONSTRAINT IF EXISTS job_completion_proofs_portfolio_title_public_check,
  DROP CONSTRAINT IF EXISTS job_completion_proofs_portfolio_caption_public_check;

ALTER TABLE public.job_completion_proofs
  ADD CONSTRAINT job_completion_proofs_portfolio_title_public_check
  CHECK (portfolio_title IS NULL OR char_length(btrim(portfolio_title)) BETWEEN 1 AND 120),
  ADD CONSTRAINT job_completion_proofs_portfolio_caption_public_check
  CHECK (portfolio_caption IS NULL OR char_length(btrim(portfolio_caption)) <= 280);

CREATE TABLE IF NOT EXISTS public.tradie_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  title text,
  trade_category text,
  suburb text,
  description text,
  completion_month date,
  image_paths text[],
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz
);

DELETE FROM public.tradie_portfolio_items tpi
WHERE tpi.owner_id IS NULL
   OR NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = tpi.owner_id
  );

UPDATE public.tradie_portfolio_items
SET
  title = COALESCE(NULLIF(btrim(title), ''), 'Previous work'),
  image_paths = COALESCE(image_paths, '{}'),
  is_public = COALESCE(is_public, true),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE public.tradie_portfolio_items
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN image_paths SET DEFAULT '{}',
  ALTER COLUMN image_paths SET NOT NULL,
  ALTER COLUMN is_public SET DEFAULT true,
  ALTER COLUMN is_public SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tradie_portfolio_items_owner_id_fkey'
      AND conrelid = 'public.tradie_portfolio_items'::regclass
  ) THEN
    ALTER TABLE public.tradie_portfolio_items
      ADD CONSTRAINT tradie_portfolio_items_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.tradie_portfolio_items
  DROP CONSTRAINT IF EXISTS tradie_portfolio_items_title_public_check;

ALTER TABLE public.tradie_portfolio_items
  ADD CONSTRAINT tradie_portfolio_items_title_public_check
  CHECK (char_length(btrim(title)) BETWEEN 1 AND 120);

CREATE INDEX IF NOT EXISTS idx_tradie_portfolio_owner
  ON public.tradie_portfolio_items(owner_id);

CREATE INDEX IF NOT EXISTS idx_tradie_portfolio_public
  ON public.tradie_portfolio_items(is_public, created_at);

CREATE INDEX IF NOT EXISTS idx_completion_proofs_public_portfolio
  ON public.job_completion_proofs(tradie_id, is_public_portfolio, created_at);

ALTER TABLE public.tradie_portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage portfolio items" ON public.tradie_portfolio_items;
DROP POLICY IF EXISTS "Public reads public portfolio items" ON public.tradie_portfolio_items;
DROP POLICY IF EXISTS "Public reads explicitly public completion proofs" ON public.job_completion_proofs;

DROP POLICY IF EXISTS "Public reads profile media" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own profile media" ON storage.objects;
DROP POLICY IF EXISTS "Users update own profile media" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own profile media" ON storage.objects;
DROP POLICY IF EXISTS "Users read own profile media" ON storage.objects;
DROP POLICY IF EXISTS "Portfolio owners upload images" ON storage.objects;
DROP POLICY IF EXISTS "Portfolio owners manage images" ON storage.objects;
DROP POLICY IF EXISTS "Portfolio owners delete images" ON storage.objects;
DROP POLICY IF EXISTS "Portfolio owners read own images" ON storage.objects;
DROP POLICY IF EXISTS "Public reads public portfolio images" ON storage.objects;
DROP POLICY IF EXISTS "Public reads public completion proof images" ON storage.objects;

DROP FUNCTION IF EXISTS public.list_my_portfolio_completion_proofs();
DROP FUNCTION IF EXISTS public.update_completion_proof_portfolio_publication(uuid, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.set_completion_proof_public_portfolio(uuid, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.list_public_tradie_completion_proof_gallery(uuid);
DROP FUNCTION IF EXISTS public.list_public_tradie_gallery(uuid);
DROP FUNCTION IF EXISTS public.can_read_public_completion_proof_image(text);
DROP FUNCTION IF EXISTS public.safe_completion_proof_attachments(uuid, uuid, text[]);

DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  role,
  display_name,
  avatar_url,
  avatar_url AS public_avatar_url,
  suburb,
  state,
  trades,
  abn,
  license_number,
  verified,
  identity_verified,
  tradie_verified,
  show_location,
  business_name,
  headline,
  bio,
  years_experience,
  service_areas,
  website_url,
  created_at,
  updated_at
FROM public.users;

ALTER VIEW public.public_profiles SET (security_invoker = true);
GRANT SELECT ON public.public_profiles TO anon, authenticated;

CREATE POLICY "Owners manage portfolio items"
  ON public.tradie_portfolio_items
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('tradie', 'dual')
    )
  );

CREATE POLICY "Public reads public portfolio items"
  ON public.tradie_portfolio_items
  FOR SELECT
  TO anon, authenticated
  USING (
    is_public IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.public_profiles pp
      WHERE pp.id = tradie_portfolio_items.owner_id
        AND pp.role IN ('tradie', 'dual')
    )
  );

DROP TRIGGER IF EXISTS update_tradie_portfolio_updated_at ON public.tradie_portfolio_items;
CREATE TRIGGER update_tradie_portfolio_updated_at
  BEFORE UPDATE ON public.tradie_portfolio_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile_media',
  'profile_media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio_images',
  'portfolio_images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'completion_proofs',
  'completion_proofs',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
  allowed_mime_types = COALESCE(storage.buckets.allowed_mime_types, EXCLUDED.allowed_mime_types);

CREATE POLICY "Public reads profile media"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'profile_media'
    AND split_part(name, '/', 1) = 'avatars'
    AND array_length(string_to_array(name, '/'), 1) = 3
  );

CREATE POLICY "Users upload own profile media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile_media'
    AND split_part(name, '/', 1) = 'avatars'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 3) <> ''
  );

CREATE POLICY "Users update own profile media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile_media'
    AND split_part(name, '/', 1) = 'avatars'
    AND split_part(name, '/', 2) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile_media'
    AND split_part(name, '/', 1) = 'avatars'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 3) <> ''
  );

CREATE POLICY "Users delete own profile media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile_media'
    AND split_part(name, '/', 1) = 'avatars'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

CREATE POLICY "Portfolio owners upload images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio_images'
    AND split_part(name, '/', 1) = 'portfolio'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 3) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('tradie', 'dual')
    )
  );

CREATE POLICY "Portfolio owners read own images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'portfolio_images'
    AND split_part(name, '/', 1) = 'portfolio'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

CREATE POLICY "Portfolio owners manage images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portfolio_images'
    AND split_part(name, '/', 1) = 'portfolio'
    AND split_part(name, '/', 2) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'portfolio_images'
    AND split_part(name, '/', 1) = 'portfolio'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 3) <> ''
  );

CREATE POLICY "Portfolio owners delete images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portfolio_images'
    AND split_part(name, '/', 1) = 'portfolio'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

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
  WHERE split_part(path, '/', 1) = 'jobs'
    AND split_part(path, '/', 2) = p_job_id::text
    AND split_part(path, '/', 3) = p_tradie_id::text
    AND array_length(string_to_array(path, '/'), 1) = 4
    AND split_part(path, '/', 4) <> ''
    AND path NOT LIKE '%/../%'
    AND path NOT LIKE '../%';
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

CREATE OR REPLACE FUNCTION public.set_completion_proof_public_portfolio(
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

CREATE OR REPLACE FUNCTION public.update_completion_proof_portfolio_publication(
  p_proof_id uuid,
  p_is_public_portfolio boolean,
  p_portfolio_title text DEFAULT NULL,
  p_portfolio_caption text DEFAULT NULL,
  p_portfolio_trade_category text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.set_completion_proof_public_portfolio(
    p_proof_id,
    p_is_public_portfolio,
    p_portfolio_title,
    p_portfolio_caption,
    p_portfolio_trade_category
  );
$$;

CREATE OR REPLACE FUNCTION public.list_public_tradie_gallery(p_tradie_id uuid)
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
  SELECT * FROM public.list_public_tradie_gallery(p_tradie_id);
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
REVOKE ALL ON FUNCTION public.set_completion_proof_public_portfolio(uuid, boolean, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_completion_proof_portfolio_publication(uuid, boolean, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_tradie_gallery(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_tradie_completion_proof_gallery(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_read_public_completion_proof_image(text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.safe_completion_proof_attachments(uuid, uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_portfolio_completion_proofs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_completion_proof_public_portfolio(uuid, boolean, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_completion_proof_portfolio_publication(uuid, boolean, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_tradie_gallery(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_tradie_completion_proof_gallery(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_public_completion_proof_image(text) TO anon, authenticated, service_role;

CREATE POLICY "Public reads public portfolio images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'portfolio_images'
    AND EXISTS (
      SELECT 1
      FROM public.tradie_portfolio_items tpi
      JOIN public.public_profiles pp ON pp.id = tpi.owner_id
      WHERE tpi.is_public IS TRUE
        AND pp.role IN ('tradie', 'dual')
        AND split_part(name, '/', 1) = 'portfolio'
        AND split_part(name, '/', 2) = tpi.owner_id::text
        AND name = ANY(tpi.image_paths)
    )
  );

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

COMMENT ON TABLE public.tradie_portfolio_items IS
  'Public-safe tradie portfolio entries managed by the owning tradie. Public readers only see rows marked is_public.';
COMMENT ON COLUMN public.job_completion_proofs.is_public_portfolio IS
  'Explicit opt-in flag for showing completed work proof images on public tradie profiles. Defaults false to avoid exposing private customer/job imagery.';
COMMENT ON COLUMN public.job_completion_proofs.portfolio_title IS
  'Optional tradie-authored public-safe title for showing a completed work proof in a public profile gallery.';
COMMENT ON COLUMN public.job_completion_proofs.portfolio_caption IS
  'Optional tradie-authored public-safe caption for public profile gallery use. Do not store customer names, addresses, or private job details.';
COMMENT ON COLUMN public.job_completion_proofs.portfolio_trade_category IS
  'Optional public-safe trade/category label for a published completion proof image.';
COMMENT ON FUNCTION public.set_completion_proof_public_portfolio(uuid, boolean, text, text, text) IS
  'Allows the assigned tradie to publish or unpublish their own completion proof images only after the job is completed and payment is released.';
