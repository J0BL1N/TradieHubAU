-- Migration: 037_job_messaging_foundation.sql
-- Description: Bind conversations and messages to accepted job participants and
-- provide narrow RPC-only creation/sending paths without weakening M-05 immutability.

-- The original pair-only index prevented the same customer/tradie pair from
-- having separate job threads. Conversations are now unique per job and pair.
DROP INDEX IF EXISTS public.conversations_unique_pair;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_job_pair
  ON public.conversations (
    job_id,
    LEAST(user1_id, user2_id),
    GREATEST(user1_id, user2_id)
  )
  WHERE job_id IS NOT NULL;

-- Conversation and message creation must use the validated RPCs below.
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

-- Existing participant reads are tightened to a current, canonical job contract:
-- user1 is the customer, user2 is the accepted payee, and the job is messageable.
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
CREATE POLICY "Job participants view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (user1_id, user2_id)
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.payments p ON p.job_id = j.id
      WHERE j.id = conversations.job_id
        AND conversations.user1_id = j.customer_id
        AND conversations.user2_id = p.payee_id
        AND p.payer_id = j.customer_id
        AND j.status IN (
          'accepted',
          'payment_held',
          'completed_pending_review',
          'disputed',
          'completed'
        )
    )
  );

DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Job participants view messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.payments p ON p.job_id = j.id
      WHERE c.id = messages.conversation_id
        AND auth.uid() IN (c.user1_id, c.user2_id)
        AND c.user1_id = j.customer_id
        AND c.user2_id = p.payee_id
        AND p.payer_id = j.customer_id
        AND j.status IN (
          'accepted',
          'payment_held',
          'completed_pending_review',
          'disputed',
          'completed'
        )
    )
  );

-- Preserve M-05's recipient-only unread-to-read update, adding the same job and
-- accepted-participant checks used by conversation/message reads.
DROP POLICY IF EXISTS "Recipients can mark messages read" ON public.messages;
CREATE POLICY "Job recipients can mark messages read" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.payments p ON p.job_id = j.id
      WHERE c.id = messages.conversation_id
        AND auth.uid() IN (c.user1_id, c.user2_id)
        AND c.user1_id = j.customer_id
        AND c.user2_id = p.payee_id
        AND p.payer_id = j.customer_id
        AND j.status IN (
          'accepted',
          'payment_held',
          'completed_pending_review',
          'disputed',
          'completed'
        )
    )
  )
  WITH CHECK (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.jobs j ON j.id = c.job_id
      JOIN public.payments p ON p.job_id = j.id
      WHERE c.id = messages.conversation_id
        AND auth.uid() IN (c.user1_id, c.user2_id)
        AND c.user1_id = j.customer_id
        AND c.user2_id = p.payee_id
        AND p.payer_id = j.customer_id
        AND j.status IN (
          'accepted',
          'payment_held',
          'completed_pending_review',
          'disputed',
          'completed'
        )
    )
  );

-- Return only the authenticated user's valid job conversations. Live job/payment
-- status is included for clear pre-funding and lifecycle messaging in the UI.
CREATE OR REPLACE FUNCTION public.list_job_conversations()
RETURNS TABLE (
  id uuid,
  job_id uuid,
  job_title text,
  job_status text,
  payment_status text,
  user1_id uuid,
  user2_id uuid,
  last_message_text text,
  last_message_at timestamptz,
  last_message_from uuid,
  unread_count bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    c.id,
    c.job_id,
    j.title,
    j.status,
    p.status,
    c.user1_id,
    c.user2_id,
    c.last_message_text,
    c.last_message_at,
    c.last_message_from,
    (
      SELECT COUNT(*)
      FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.sender_id <> auth.uid()
        AND m.read IS NOT TRUE
    ) AS unread_count,
    c.created_at
  FROM public.conversations c
  JOIN public.jobs j ON j.id = c.job_id
  JOIN public.payments p ON p.job_id = j.id
  WHERE auth.uid() IS NOT NULL
    AND auth.uid() IN (c.user1_id, c.user2_id)
    AND c.user1_id = j.customer_id
    AND c.user2_id = p.payee_id
    AND p.payer_id = j.customer_id
    AND j.status IN (
      'accepted',
      'payment_held',
      'completed_pending_review',
      'disputed',
      'completed'
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

-- Open the single canonical thread for a job. Quote acceptance creates the
-- payment row used as the source of truth for the customer/payee relationship.
CREATE OR REPLACE FUNCTION public.open_job_conversation(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer_id uuid;
  v_payee_id uuid;
  v_job_title text;
  v_job_status text;
  v_conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to open job messages.';
  END IF;

  SELECT j.customer_id, p.payee_id, j.title, j.status
  INTO v_customer_id, v_payee_id, v_job_title, v_job_status
  FROM public.jobs j
  JOIN public.payments p ON p.job_id = j.id
  WHERE j.id = p_job_id
    AND p.payer_id = j.customer_id;

  IF v_customer_id IS NULL OR v_payee_id IS NULL THEN
    RAISE EXCEPTION 'An accepted job relationship is required for messaging.';
  END IF;

  IF auth.uid() NOT IN (v_customer_id, v_payee_id) THEN
    RAISE EXCEPTION 'Only the accepted job participants can open this conversation.';
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

  SELECT c.id
  INTO v_conversation_id
  FROM public.conversations c
  WHERE c.job_id = p_job_id
    AND c.user1_id = v_customer_id
    AND c.user2_id = v_payee_id;

  IF v_conversation_id IS NULL THEN
    BEGIN
      INSERT INTO public.conversations (user1_id, user2_id, job_id, job_title)
      VALUES (v_customer_id, v_payee_id, p_job_id, v_job_title)
      RETURNING conversations.id INTO v_conversation_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT c.id
      INTO v_conversation_id
      FROM public.conversations c
      WHERE c.job_id = p_job_id
        AND c.user1_id = v_customer_id
        AND c.user2_id = v_payee_id;
    END;
  END IF;

  RETURN v_conversation_id;
END;
$$;

-- Messages are immutable after this RPC inserts them. Before payment is funded,
-- obvious email/phone sharing is rejected to preserve the contact-detail gate.
CREATE OR REPLACE FUNCTION public.send_job_message(
  p_conversation_id uuid,
  p_text text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_message text;
  v_job_status text;
  v_payment_status text;
  v_customer_id uuid;
  v_payee_id uuid;
  v_conversation_user1 uuid;
  v_conversation_user2 uuid;
  v_message_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to send messages.';
  END IF;

  v_message := btrim(COALESCE(p_text, ''));
  IF v_message = '' THEN
    RAISE EXCEPTION 'Message text is required.';
  END IF;
  IF char_length(v_message) > 4000 THEN
    RAISE EXCEPTION 'Messages must be 4000 characters or fewer.';
  END IF;

  SELECT
    j.status,
    p.status,
    j.customer_id,
    p.payee_id,
    c.user1_id,
    c.user2_id
  INTO
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

  INSERT INTO public.messages (conversation_id, sender_id, text)
  VALUES (p_conversation_id, auth.uid(), v_message)
  RETURNING messages.id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

-- Explicit L-04-style role grants: these RPCs are user-facing and require an
-- authenticated JWT; no anonymous or default PUBLIC execution is permitted.
REVOKE ALL ON FUNCTION public.list_job_conversations() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.open_job_conversation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.send_job_message(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_job_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_job_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_job_message(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.list_job_conversations() IS
  'Lists only the authenticated customer/payee job conversations with live job/payment status and unread counts.';
COMMENT ON FUNCTION public.open_job_conversation(uuid) IS
  'Returns or creates the canonical job conversation for the authenticated customer or accepted payee.';
COMMENT ON FUNCTION public.send_job_message(uuid, text) IS
  'Validates accepted job participation and lifecycle before inserting an immutable message; blocks obvious pre-funding phone/email sharing.';
