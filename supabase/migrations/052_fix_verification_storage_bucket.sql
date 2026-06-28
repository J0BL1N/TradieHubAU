-- Migration: 052_fix_verification_storage_bucket.sql
-- Description: Create and protect the private verification document storage bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verifications',
  'verifications',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf'
  ];

DROP POLICY IF EXISTS "Allow users to upload own verifications" ON storage.objects;
CREATE POLICY "Allow users to upload own verifications"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'verifications'
    AND name LIKE 'users/' || auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS "Allow users to read own verifications" ON storage.objects;
CREATE POLICY "Allow users to read own verifications"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verifications'
    AND name LIKE 'users/' || auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS "Allow admins to read all verifications" ON storage.objects;
CREATE POLICY "Allow admins to read all verifications"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verifications'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Allow admins to delete verification objects" ON storage.objects;
CREATE POLICY "Allow admins to delete verification objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'verifications'
    AND public.is_admin(auth.uid())
  );

COMMENT ON POLICY "Allow users to upload own verifications" ON storage.objects IS
  'Authenticated users can upload verification documents only under verifications/users/<auth.uid()>/...';
COMMENT ON POLICY "Allow users to read own verifications" ON storage.objects IS
  'Authenticated users can read only their own private verification documents.';
COMMENT ON POLICY "Allow admins to read all verifications" ON storage.objects IS
  'Admins can read private verification documents for manual review.';
COMMENT ON POLICY "Allow admins to delete verification objects" ON storage.objects IS
  'Admins can remove private verification documents when needed for moderation or cleanup.';
