-- Migration: 040_message_attachments_foundation.sql
-- Description: Add the database, private storage, and RPC foundation for
-- image attachments in job messages without changing the existing text-message
-- RPC or frontend.

-- 1. Private image-only bucket for message attachments.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message_attachments',
  'message_attachments',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- 2. Attachment metadata. Rows are immutable client-side and are inserted only
-- by the send_job_message_with_attachments RPC after it validates the uploaded
-- object path and conversation participant relationship.
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.users(id),
  bucket_id text NOT NULL DEFAULT 'message_attachments',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  width integer NULL,
  height integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_attachments_bucket_check CHECK (bucket_id = 'message_attachments'),
  CONSTRAINT message_attachments_storage_path_unique UNIQUE (storage_path),
  CONSTRAINT message_attachments_file_size_check CHECK (file_size > 0 AND file_size <= 5242880),
  CONSTRAINT message_attachments_mime_type_check CHECK (mime_type IN ('image/jpeg', 'image/jpg', 'image/png', 'image/webp')),
  CONSTRAINT message_attachments_dimensions_check CHECK (
    (width IS NULL OR width > 0)
    AND (height IS NULL OR height > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
  ON public.message_attachments(message_id);

CREATE INDEX IF NOT EXISTS idx_message_attachments_conversation_id
  ON public.message_attachments(conversation_id);

CREATE INDEX IF NOT EXISTS idx_message_attachments_job_id
  ON public.message_attachments(job_id);

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Job participants view message attachments" ON public.message_attachments;
CREATE POLICY "Job participants view message attachments" ON public.message_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.payments p ON p.job_id = j.id
      WHERE c.id = message_attachments.conversation_id
        AND j.id = message_attachments.job_id
        AND c.user1_id = j.customer_id
        AND c.user2_id = p.payee_id
        AND p.payer_id = j.customer_id
        AND auth.uid() IN (c.user1_id, c.user2_id)
        AND j.status IN (
          'accepted',
          'payment_held',
          'completed_pending_review',
          'disputed',
          'completed'
        )
    )
  );

-- No INSERT/UPDATE/DELETE policies are intentionally defined. Authenticated
-- clients can read only their conversation attachments; all writes go through
-- the trusted SECURITY DEFINER RPC below.

-- 3. Storage object policies. The exact path is:
-- jobs/<job_id>/conversations/<conversation_id>/messages/<message_id>/<uploader_id>/<filename>
-- INSERT is allowed before the message row exists, so it validates the job,
-- conversation, authenticated participant, uploader segment, UUID-shaped IDs,
-- filename, and private bucket. Attachment metadata is finalized by RPC after
-- upload.
DROP POLICY IF EXISTS "Job participants upload message attachments" ON storage.objects;
CREATE POLICY "Job participants upload message attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message_attachments'
    AND split_part(name, '/', 1) = 'jobs'
    AND split_part(name, '/', 3) = 'conversations'
    AND split_part(name, '/', 5) = 'messages'
    AND array_length(string_to_array(name, '/'), 1) = 8
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 6) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 7) = auth.uid()::text
    AND split_part(name, '/', 8) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.payments p ON p.job_id = j.id
      WHERE j.id = split_part(name, '/', 2)::uuid
        AND c.id = split_part(name, '/', 4)::uuid
        AND c.job_id = j.id
        AND c.user1_id = j.customer_id
        AND c.user2_id = p.payee_id
        AND p.payer_id = j.customer_id
        AND auth.uid() IN (c.user1_id, c.user2_id)
        AND j.status IN (
          'accepted',
          'payment_held',
          'completed_pending_review',
          'disputed',
          'completed'
        )
    )
  );

DROP POLICY IF EXISTS "Job participants read message attachments" ON storage.objects;
CREATE POLICY "Job participants read message attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'message_attachments'
    AND split_part(name, '/', 1) = 'jobs'
    AND split_part(name, '/', 3) = 'conversations'
    AND split_part(name, '/', 5) = 'messages'
    AND array_length(string_to_array(name, '/'), 1) = 8
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.payments p ON p.job_id = j.id
      WHERE j.id = split_part(name, '/', 2)::uuid
        AND c.id = split_part(name, '/', 4)::uuid
        AND c.job_id = j.id
        AND c.user1_id = j.customer_id
        AND c.user2_id = p.payee_id
        AND p.payer_id = j.customer_id
        AND auth.uid() IN (c.user1_id, c.user2_id)
        AND j.status IN (
          'accepted',
          'payment_held',
          'completed_pending_review',
          'disputed',
          'completed'
        )
    )
  );

-- 4. RPC for the future frontend attachment send path. It validates the same
-- participant/lifecycle/contact-gate rules as send_job_message, then validates
-- uploaded object paths and inserts message + attachment rows atomically.
CREATE OR REPLACE FUNCTION public.send_job_message_with_attachments(
  p_message_id uuid,
  p_conversation_id uuid,
  p_text text,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  text text,
  read boolean,
  read_at timestamptz,
  created_at timestamptz,
  attachments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_message text;
  v_attachment_count integer;
  v_job_id uuid;
  v_job_status text;
  v_payment_status text;
  v_customer_id uuid;
  v_payee_id uuid;
  v_conversation_user1 uuid;
  v_conversation_user2 uuid;
  v_attachment jsonb;
  v_storage_path text;
  v_file_name text;
  v_mime_type text;
  v_file_size integer;
  v_width integer;
  v_height integer;
  v_expected_prefix text;
  v_name_parts text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to send messages.';
  END IF;

  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'Message id is required.';
  END IF;

  IF p_attachments IS NULL THEN
    p_attachments := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_attachments) <> 'array' THEN
    RAISE EXCEPTION 'Attachments must be a JSON array.';
  END IF;

  v_attachment_count := jsonb_array_length(p_attachments);
  IF v_attachment_count > 4 THEN
    RAISE EXCEPTION 'A message can include at most 4 attachments.';
  END IF;

  v_message := btrim(COALESCE(p_text, ''));
  IF v_message = '' AND v_attachment_count = 0 THEN
    RAISE EXCEPTION 'Message text or at least one attachment is required.';
  END IF;
  IF char_length(v_message) > 4000 THEN
    RAISE EXCEPTION 'Messages must be 4000 characters or fewer.';
  END IF;

  SELECT
    c.job_id,
    j.status,
    p.status,
    j.customer_id,
    p.payee_id,
    c.user1_id,
    c.user2_id
  INTO
    v_job_id,
    v_job_status,
    v_payment_status,
    v_customer_id,
    v_payee_id,
    v_conversation_user1,
    v_conversation_user2
  FROM public.conversations c
  JOIN public.jobs j ON j.id = c.job_id
  JOIN public.payments p ON p.job_id = j.id
  WHERE c.id = p_conversation_id
    AND p.payer_id = j.customer_id;

  IF v_customer_id IS NULL OR v_payee_id IS NULL THEN
    RAISE EXCEPTION 'Valid job conversation not found.';
  END IF;

  IF v_conversation_user1 <> v_customer_id OR v_conversation_user2 <> v_payee_id THEN
    RAISE EXCEPTION 'Conversation participant linkage is invalid.';
  END IF;

  IF auth.uid() NOT IN (v_customer_id, v_payee_id) THEN
    RAISE EXCEPTION 'Only the accepted job participants can send messages.';
  END IF;

  IF v_job_status NOT IN (
    'accepted',
    'payment_held',
    'completed_pending_review',
    'disputed',
    'completed'
  ) THEN
    RAISE EXCEPTION 'This job is not available for messaging.';
  END IF;

  IF v_payment_status = 'pending' AND (
    v_message ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    OR v_message ~ '(^|[^0-9])(\+?61|0)[[:space:].()-]*[23478]([[:space:].()-]*[0-9]){8}([^0-9]|$)'
  ) THEN
    RAISE EXCEPTION 'Direct phone and email details remain locked until payment is funded.';
  END IF;

  v_expected_prefix := format(
    'jobs/%s/conversations/%s/messages/%s/%s/',
    v_job_id,
    p_conversation_id,
    p_message_id,
    auth.uid()
  );

  FOR v_attachment IN SELECT value FROM jsonb_array_elements(p_attachments)
  LOOP
    IF jsonb_typeof(v_attachment) <> 'object' THEN
      RAISE EXCEPTION 'Each attachment must be an object.';
    END IF;

    v_storage_path := btrim(COALESCE(v_attachment ->> 'storage_path', ''));
    v_file_name := btrim(COALESCE(v_attachment ->> 'file_name', ''));
    v_mime_type := btrim(COALESCE(v_attachment ->> 'mime_type', ''));
    v_file_size := NULLIF(v_attachment ->> 'file_size', '')::integer;
    v_width := NULLIF(v_attachment ->> 'width', '')::integer;
    v_height := NULLIF(v_attachment ->> 'height', '')::integer;
    v_name_parts := string_to_array(v_storage_path, '/');

    IF v_storage_path = '' OR v_file_name = '' THEN
      RAISE EXCEPTION 'Attachment storage_path and file_name are required.';
    END IF;

    IF v_storage_path NOT LIKE v_expected_prefix || '%' THEN
      RAISE EXCEPTION 'Attachment path does not match the message/job/conversation/uploader boundary.';
    END IF;

    IF array_length(v_name_parts, 1) <> 8
      OR v_name_parts[1] <> 'jobs'
      OR v_name_parts[2] <> v_job_id::text
      OR v_name_parts[3] <> 'conversations'
      OR v_name_parts[4] <> p_conversation_id::text
      OR v_name_parts[5] <> 'messages'
      OR v_name_parts[6] <> p_message_id::text
      OR v_name_parts[7] <> auth.uid()::text
      OR v_name_parts[8] = ''
    THEN
      RAISE EXCEPTION 'Attachment path format is invalid.';
    END IF;

    IF v_mime_type NOT IN ('image/jpeg', 'image/jpg', 'image/png', 'image/webp') THEN
      RAISE EXCEPTION 'Only jpg, jpeg, png, and webp image attachments are allowed.';
    END IF;

    IF v_file_size IS NULL OR v_file_size <= 0 OR v_file_size > 5242880 THEN
      RAISE EXCEPTION 'Attachment file size must be between 1 byte and 5MB.';
    END IF;

    IF (v_width IS NOT NULL AND v_width <= 0) OR (v_height IS NOT NULL AND v_height <= 0) THEN
      RAISE EXCEPTION 'Attachment dimensions must be positive when supplied.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = 'message_attachments'
        AND o.name = v_storage_path
    ) THEN
      RAISE EXCEPTION 'Uploaded attachment object was not found.';
    END IF;
  END LOOP;

  INSERT INTO public.messages (id, conversation_id, sender_id, text)
  VALUES (p_message_id, p_conversation_id, auth.uid(), v_message);

  FOR v_attachment IN SELECT value FROM jsonb_array_elements(p_attachments)
  LOOP
    INSERT INTO public.message_attachments (
      message_id,
      conversation_id,
      job_id,
      uploader_id,
      storage_path,
      file_name,
      mime_type,
      file_size,
      width,
      height
    )
    VALUES (
      p_message_id,
      p_conversation_id,
      v_job_id,
      auth.uid(),
      btrim(v_attachment ->> 'storage_path'),
      btrim(v_attachment ->> 'file_name'),
      btrim(v_attachment ->> 'mime_type'),
      NULLIF(v_attachment ->> 'file_size', '')::integer,
      NULLIF(v_attachment ->> 'width', '')::integer,
      NULLIF(v_attachment ->> 'height', '')::integer
    );
  END LOOP;

  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.text,
    m.read,
    m.read_at,
    m.created_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ma.id,
          'message_id', ma.message_id,
          'conversation_id', ma.conversation_id,
          'job_id', ma.job_id,
          'uploader_id', ma.uploader_id,
          'bucket_id', ma.bucket_id,
          'storage_path', ma.storage_path,
          'file_name', ma.file_name,
          'mime_type', ma.mime_type,
          'file_size', ma.file_size,
          'width', ma.width,
          'height', ma.height,
          'created_at', ma.created_at
        )
        ORDER BY ma.created_at, ma.id
      ) FILTER (WHERE ma.id IS NOT NULL),
      '[]'::jsonb
    ) AS attachments
  FROM public.messages m
  LEFT JOIN public.message_attachments ma ON ma.message_id = m.id
  WHERE m.id = p_message_id
  GROUP BY m.id, m.conversation_id, m.sender_id, m.text, m.read, m.read_at, m.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.send_job_message_with_attachments(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_job_message_with_attachments(uuid, uuid, text, jsonb)
  TO authenticated;

COMMENT ON TABLE public.message_attachments IS
  'Immutable metadata for private image attachments sent inside authorised job conversations.';
COMMENT ON FUNCTION public.send_job_message_with_attachments(uuid, uuid, text, jsonb) IS
  'Validates job conversation participation, uploaded private image objects, path binding, and attachment limits before inserting an immutable message and attachment metadata.';
