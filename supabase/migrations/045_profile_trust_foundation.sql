-- Migration: 045_profile_trust_foundation.sql
-- Description: Add public-safe profile trust fields, avatar/portfolio storage,
-- tradie portfolio entries, and opt-in public completion proof visibility.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS years_experience integer CHECK (years_experience IS NULL OR (years_experience >= 0 AND years_experience <= 80)),
  ADD COLUMN IF NOT EXISTS service_areas text[],
  ADD COLUMN IF NOT EXISTS website_url text;

CREATE TABLE IF NOT EXISTS public.tradie_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  trade_category text,
  suburb text,
  description text,
  completion_month date,
  image_paths text[] NOT NULL DEFAULT '{}',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tradie_portfolio_owner ON public.tradie_portfolio_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_tradie_portfolio_public ON public.tradie_portfolio_items(is_public, created_at);

ALTER TABLE public.tradie_portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage portfolio items" ON public.tradie_portfolio_items;
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

DROP POLICY IF EXISTS "Public reads public portfolio items" ON public.tradie_portfolio_items;
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

ALTER TABLE public.job_completion_proofs
  ADD COLUMN IF NOT EXISTS is_public_portfolio boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Public reads explicitly public completion proofs" ON public.job_completion_proofs;
CREATE POLICY "Public reads explicitly public completion proofs"
  ON public.job_completion_proofs
  FOR SELECT
  TO anon, authenticated
  USING (
    is_public_portfolio IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.payments p ON p.job_id = j.id
      JOIN public.public_profiles pp ON pp.id = p.payee_id
      WHERE j.id = job_completion_proofs.job_id
        AND p.payee_id = job_completion_proofs.tradie_id
        AND p.status = 'released'
        AND j.status = 'completed'
        AND pp.role IN ('tradie', 'dual')
    )
  );

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

DROP POLICY IF EXISTS "Public reads profile media" ON storage.objects;
CREATE POLICY "Public reads profile media"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'profile_media');

DROP POLICY IF EXISTS "Users upload own profile media" ON storage.objects;
CREATE POLICY "Users upload own profile media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile_media'
    AND name LIKE 'avatars/' || auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS "Users update own profile media" ON storage.objects;
CREATE POLICY "Users update own profile media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile_media'
    AND name LIKE 'avatars/' || auth.uid()::text || '/%'
  )
  WITH CHECK (
    bucket_id = 'profile_media'
    AND name LIKE 'avatars/' || auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS "Users delete own profile media" ON storage.objects;
CREATE POLICY "Users delete own profile media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile_media'
    AND name LIKE 'avatars/' || auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS "Portfolio owners upload images" ON storage.objects;
CREATE POLICY "Portfolio owners upload images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio_images'
    AND name LIKE 'portfolio/' || auth.uid()::text || '/%'
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('tradie', 'dual')
    )
  );

DROP POLICY IF EXISTS "Portfolio owners manage images" ON storage.objects;
CREATE POLICY "Portfolio owners manage images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portfolio_images'
    AND name LIKE 'portfolio/' || auth.uid()::text || '/%'
  )
  WITH CHECK (
    bucket_id = 'portfolio_images'
    AND name LIKE 'portfolio/' || auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS "Portfolio owners delete images" ON storage.objects;
CREATE POLICY "Portfolio owners delete images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portfolio_images'
    AND name LIKE 'portfolio/' || auth.uid()::text || '/%'
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
        WHERE tpi.is_public IS TRUE
          AND name = ANY(tpi.image_paths)
      )
    )
  );

DROP POLICY IF EXISTS "Public reads public completion proof images" ON storage.objects;
CREATE POLICY "Public reads public completion proof images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'completion_proofs'
    AND EXISTS (
      SELECT 1
      FROM public.job_completion_proofs jcp
      JOIN public.jobs j ON j.id = jcp.job_id
      JOIN public.payments p ON p.job_id = j.id
      WHERE jcp.is_public_portfolio IS TRUE
        AND j.status = 'completed'
        AND p.status = 'released'
        AND p.payee_id = jcp.tradie_id
        AND name = ANY(jcp.attachments)
    )
  );

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  role,
  display_name,
  avatar_url,
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
  bio,
  years_experience,
  service_areas,
  website_url,
  created_at,
  updated_at
FROM public.users;

ALTER VIEW public.public_profiles SET (security_invoker = true);
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMENT ON TABLE public.tradie_portfolio_items IS
  'Public-safe tradie portfolio entries managed by the owning tradie. Public readers only see rows marked is_public.';
COMMENT ON COLUMN public.job_completion_proofs.is_public_portfolio IS
  'Explicit opt-in flag for showing completed work proof images on public tradie profiles. Defaults false to avoid exposing private customer/job imagery.';
