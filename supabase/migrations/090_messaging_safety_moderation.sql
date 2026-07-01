-- Migration: 090_messaging_safety_moderation.sql
-- Description: Implement messaging moderation bot trigger, user-focused notifications, and enrich admin evidence pack with conversation logs.

-- 1. Helper function to censor profanity
CREATE OR REPLACE FUNCTION public.censor_profanity(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_words text[] := ARRAY['crap', 'shit', 'fuck', 'bitch', 'asshole', 'cunt', 'bastard', 'idiot', 'stupid'];
  v_word text;
  v_censored text;
  v_result text := p_text;
BEGIN
  IF p_text IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH v_word IN ARRAY v_words LOOP
    v_censored := repeat('*', char_length(v_word));
    v_result := regexp_replace(v_result, '\y' || v_word || '\y', v_censored, 'gi');
  END LOOP;
  RETURN v_result;
END;
$$;

-- 2. Trigger function for messages table before insert
CREATE OR REPLACE FUNCTION public.process_message_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_payment_status text;
  v_customer_id uuid;
  v_payee_id uuid;
  v_flag_reasons text[] := ARRAY[]::text[];
  v_text text;
  v_is_system boolean;
BEGIN
  v_is_system := NEW.message_type = 'system';
  IF v_is_system THEN
    RETURN NEW;
  END IF;

  v_text := NEW.text;
  IF v_text IS NULL OR v_text = '' THEN
    RETURN NEW;
  END IF;

  -- 1. Profanity Censorship
  NEW.text := public.censor_profanity(v_text);

  -- Fetch job & payment details to see if payment is funded or pending
  SELECT j.id, p.status, j.customer_id, p.payee_id
  INTO v_job_id, v_payment_status, v_customer_id, v_payee_id
  FROM public.conversations c
  JOIN public.jobs j ON j.id = c.job_id
  JOIN public.payments p ON p.job_id = j.id
  WHERE c.id = NEW.conversation_id
    AND p.payer_id = j.customer_id
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    -- 2. Contact details bypass (only block if payment status is pending)
    IF v_payment_status = 'pending' THEN
      -- Email regex
      IF v_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' THEN
        v_flag_reasons := array_append(v_flag_reasons, 'email_bypass');
      END IF;

      -- Phone regex
      IF v_text ~ '(^|[^0-9])(\+?61|0)[[:space:].()-]*[23478]([[:space:].()-]*[0-9]){8}([^0-9]|$)'
         OR v_text ~ '(\b\d{4}[[:space:]-]?\d{3}[[:space:]-]?\d{3}\b)' THEN
        v_flag_reasons := array_append(v_flag_reasons, 'phone_bypass');
      END IF;

      -- Social handles/mentions
      IF v_text ~* '\b(facebook|fb|instagram|insta|linkedin|whatsapp|viber|telegram|snapchat|tiktok|socials?|handle)\b' THEN
        v_flag_reasons := array_append(v_flag_reasons, 'social_bypass');
      END IF;
    END IF;

    -- 3. Off-platform payment attempts (always block/flag)
    IF v_text ~* '\b(bank transfer|direct deposit|pay cash|paypal|pay outside|outside the app|off-platform|pay direct|cash payment|bsb|acc number|account number)\b' THEN
      v_flag_reasons := array_append(v_flag_reasons, 'off_platform_payment');
    END IF;

    -- 4. Set flagged/blocked in metadata if reasons exist
    IF array_length(v_flag_reasons, 1) > 0 THEN
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
        'flagged', true,
        'blocked', true,
        'flag_reasons', to_jsonb(v_flag_reasons)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create BEFORE INSERT trigger on public.messages
DROP TRIGGER IF EXISTS trg_process_message_moderation ON public.messages;
CREATE TRIGGER trg_process_message_moderation
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.process_message_moderation();


-- 3. Redefine send_job_message and send_job_message_with_attachments to allow insertion (bypassing raw RAISE EXCEPTION for phone/email)
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
  v_customer_id uuid;
  v_payee_id uuid;
  v_conversation_user1 uuid;
  v_conversation_user2 uuid;
  v_message_id uuid;
  v_message_count integer;
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
    j.customer_id,
    p.payee_id,
    c.user1_id,
    c.user2_id
  INTO
    v_job_status,
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

  SELECT COUNT(*)
  INTO v_message_count
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id;

  IF v_message_count >= 1000 THEN
    RAISE EXCEPTION 'This beta conversation has reached the temporary 1,000 message limit.';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, text)
  VALUES (p_conversation_id, auth.uid(), v_message)
  RETURNING messages.id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

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
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_message text;
  v_job_status text;
  v_customer_id uuid;
  v_payee_id uuid;
  v_conversation_user1 uuid;
  v_conversation_user2 uuid;
  v_message_count integer;
  v_att_count integer;
  v_att jsonb;
  v_att_id uuid;
  v_att_storage_path text;
  v_att_file_name text;
  v_att_mime text;
  v_att_size integer;
  v_att_width integer;
  v_att_height integer;
  v_inserted_attachments jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to send messages.';
  END IF;

  v_message := btrim(COALESCE(p_text, ''));

  SELECT
    j.status,
    j.customer_id,
    p.payee_id,
    c.user1_id,
    c.user2_id
  INTO
    v_job_status,
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

  SELECT COUNT(*)
  INTO v_message_count
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id;

  IF v_message_count >= 1000 THEN
    RAISE EXCEPTION 'This beta conversation has reached the temporary 1,000 message limit.';
  END IF;

  v_att_count := jsonb_array_length(p_attachments);
  IF v_message = '' AND (p_attachments IS NULL OR v_att_count = 0) THEN
    RAISE EXCEPTION 'Message text or at least one attachment is required.';
  END IF;
  IF char_length(v_message) > 4000 THEN
    RAISE EXCEPTION 'Messages must be 4000 characters or fewer.';
  END IF;

  IF v_att_count > 10 THEN
    RAISE EXCEPTION 'A message cannot contain more than 10 attachments.';
  END IF;

  INSERT INTO public.messages (id, conversation_id, sender_id, text)
  VALUES (p_message_id, p_conversation_id, auth.uid(), v_message);

  FOR i IN 0..(v_att_count - 1) LOOP
    v_att := p_attachments -> i;
    v_att_id := gen_random_uuid();
    v_att_storage_path := (v_att ->> 'storage_path');
    v_att_file_name := (v_att ->> 'file_name');
    v_att_mime := (v_att ->> 'mime_type');
    v_att_size := (v_att ->> 'file_size')::integer;
    v_att_width := (v_att ->> 'width')::integer;
    v_att_height := (v_att ->> 'height')::integer;

    IF v_att_storage_path IS NULL OR v_att_file_name IS NULL OR v_att_mime IS NULL OR v_att_size IS NULL THEN
      RAISE EXCEPTION 'Invalid attachment payload structure.';
    END IF;

    IF v_att_mime NOT IN ('image/jpeg', 'image/jpg', 'image/png', 'image/webp') THEN
      RAISE EXCEPTION 'Only image attachments are allowed.';
    END IF;

    INSERT INTO public.message_attachments (
      id, message_id, conversation_id, job_id, uploader_id, bucket_id, storage_path, file_name, mime_type, file_size, width, height
    ) VALUES (
      v_att_id, p_message_id, p_conversation_id, (SELECT job_id FROM public.conversations WHERE id = p_conversation_id),
      auth.uid(), 'message_attachments', v_att_storage_path, v_att_file_name, v_att_mime::public.message_attachment_mime_type,
      v_att_size, v_att_width, v_att_height
    );

    v_inserted_attachments := v_inserted_attachments || jsonb_build_array(jsonb_build_object(
      'id', v_att_id,
      'message_id', p_message_id,
      'conversation_id', p_conversation_id,
      'uploader_id', auth.uid(),
      'storage_path', v_att_storage_path,
      'file_name', v_att_file_name,
      'mime_type', v_att_mime,
      'file_size', v_att_size,
      'width', v_att_width,
      'height', v_att_height
    ));
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
    v_inserted_attachments AS attachments
  FROM public.messages m
  WHERE m.id = p_message_id;
END;
$$;


-- 4. User/Actor-focused notifications trigger functions
CREATE OR REPLACE FUNCTION public.create_notification_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
  v_job_title TEXT;
  v_user1_id UUID;
  v_user2_id UUID;
  v_recipient_id UUID;
  v_sender_name TEXT;
BEGIN
  -- If message is blocked, do not create notification
  IF NEW.metadata->>'blocked' = 'true' THEN
    RETURN NEW;
  END IF;

  -- Fetch conversation and job details
  SELECT c.job_id, c.job_title, c.user1_id, c.user2_id
  INTO v_job_id, v_job_title, v_user1_id, v_user2_id
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF FOUND THEN
    -- Determine recipient
    IF NEW.sender_id = v_user1_id THEN
      v_recipient_id := v_user2_id;
    ELSIF NEW.sender_id = v_user2_id THEN
      v_recipient_id := v_user1_id;
    END IF;

    -- Fetch sender display name
    SELECT display_name INTO v_sender_name
    FROM public.users
    WHERE id = NEW.sender_id;

    -- Insert notification for the recipient (avoiding self-notification and duplicates)
    IF v_recipient_id IS NOT NULL AND NEW.sender_id <> v_recipient_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE entity_type = 'message'
          AND entity_id = NEW.id
      ) THEN
        INSERT INTO public.notifications (
          user_id,
          event_type,
          title,
          body,
          entity_type,
          entity_id,
          job_id,
          conversation_id
        ) VALUES (
          v_recipient_id,
          'new_message',
          COALESCE(v_sender_name, 'Someone') || ' sent you a message',
          'Job: ' || COALESCE(v_job_title, 'your job'),
          'message',
          NEW.id,
          v_job_id,
          NEW.conversation_id
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification_on_application_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title TEXT;
  v_tradie_name TEXT;
  v_customer_name TEXT;
BEGIN
  -- Fetch job title
  SELECT title INTO v_job_title
  FROM public.jobs
  WHERE id = NEW.job_id;

  -- Fetch tradie display name
  SELECT display_name INTO v_tradie_name
  FROM public.users
  WHERE id = NEW.tradie_id;

  -- Fetch customer display name
  SELECT display_name INTO v_customer_name
  FROM public.users
  WHERE id = NEW.customer_id;

  -- Handle INSERT (New application submitted)
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE entity_type = 'application'
        AND entity_id = NEW.id
        AND event_type = 'quote_submitted'
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        event_type,
        title,
        body,
        entity_type,
        entity_id,
        job_id
      ) VALUES (
        NEW.customer_id,
        'quote_submitted',
        COALESCE(v_tradie_name, 'A tradie') || ' submitted a quote',
        'Job: ' || COALESCE(v_job_title, 'your job'),
        'application',
        NEW.id,
        NEW.job_id
      );
    END IF;
  
  -- Handle UPDATE (Status changed)
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE entity_type = 'application'
          AND entity_id = NEW.id
          AND event_type = 'quote_accepted'
      ) THEN
        INSERT INTO public.notifications (
          user_id,
          event_type,
          title,
          body,
          entity_type,
          entity_id,
          job_id
        ) VALUES (
          NEW.tradie_id,
          'quote_accepted',
          COALESCE(v_customer_name, 'The customer') || ' accepted your quote',
          'Job: ' || COALESCE(v_job_title, 'the job'),
          'application',
          NEW.id,
          NEW.job_id
        );
      END IF;
    ELSIF OLD.status = 'pending' AND NEW.status = 'declined' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE entity_type = 'application'
          AND entity_id = NEW.id
          AND event_type = 'quote_declined'
      ) THEN
        INSERT INTO public.notifications (
          user_id,
          event_type,
          title,
          body,
          entity_type,
          entity_id,
          job_id
        ) VALUES (
          NEW.tradie_id,
          'quote_declined',
          COALESCE(v_customer_name, 'The customer') || ' declined your quote',
          'Job: ' || COALESCE(v_job_title, 'the job'),
          'application',
          NEW.id,
          NEW.job_id
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification_on_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title TEXT;
  v_customer_name TEXT;
BEGIN
  -- Fetch job title
  SELECT title INTO v_job_title
  FROM public.jobs
  WHERE id = NEW.job_id;

  -- Fetch customer display name
  SELECT display_name INTO v_customer_name
  FROM public.users
  WHERE id = NEW.payer_id;

  -- Payment funded: changed to 'held' or 'held_in_escrow'
  IF (OLD.status = 'pending' OR OLD.status IS NULL) AND NEW.status IN ('held', 'held_in_escrow') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE entity_type = 'payment'
        AND entity_id = NEW.id
        AND event_type = 'payment_funded'
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        event_type,
        title,
        body,
        entity_type,
        entity_id,
        job_id
      ) VALUES (
        NEW.payee_id,
        'payment_funded',
        COALESCE(v_customer_name, 'The customer') || ' secured payment',
        'Payment for ' || COALESCE(v_job_title, 'your job') || ' is secured. You can now start work safely.',
        'payment',
        NEW.id,
        NEW.job_id
      );
    END IF;

  -- Payment released: changed to 'released'
  ELSIF (OLD.status IN ('held', 'held_in_escrow') OR OLD.status = 'pending') AND NEW.status = 'released' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE entity_type = 'payment'
        AND entity_id = NEW.id
        AND event_type = 'payment_released'
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        event_type,
        title,
        body,
        entity_type,
        entity_id,
        job_id
      ) VALUES (
        NEW.payee_id,
        'payment_released',
        COALESCE(v_customer_name, 'The customer') || ' released payment',
        'Payment for ' || COALESCE(v_job_title, 'your job') || ' was released.',
        'payment',
        NEW.id,
        NEW.job_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification_on_completion_proof()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title TEXT;
  v_customer_id UUID;
  v_tradie_name TEXT;
BEGIN
  -- Fetch job details
  SELECT title, customer_id INTO v_job_title, v_customer_id
  FROM public.jobs
  WHERE id = NEW.job_id;

  -- Fetch tradie display name
  SELECT display_name INTO v_tradie_name
  FROM public.users
  WHERE id = NEW.tradie_id;

  IF v_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE entity_type = 'completion_proof'
        AND entity_id = NEW.id
        AND event_type = 'proof_submitted'
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        event_type,
        title,
        body,
        entity_type,
        entity_id,
        job_id
      ) VALUES (
        v_customer_id,
        'proof_submitted',
        COALESCE(v_tradie_name, 'The tradie') || ' submitted completion proof',
        'Please review the proof for ' || COALESCE(v_job_title, 'your job'),
        'completion_proof',
        NEW.id,
        NEW.job_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification_on_dispute_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title TEXT;
  v_customer_id UUID;
  v_payee_id UUID;
  v_recipient_id UUID;
  v_raised_by_name TEXT;
BEGIN
  -- Fetch job details and payee (accepted tradie)
  SELECT j.title, j.customer_id, p.payee_id
  INTO v_job_title, v_customer_id, v_payee_id
  FROM public.jobs j
  LEFT JOIN public.payments p ON p.job_id = j.id
  WHERE j.id = NEW.job_id;

  -- Handle INSERT (Dispute opened)
  IF TG_OP = 'INSERT' THEN
    -- Determine the other participant
    IF NEW.raised_by = v_customer_id THEN
      v_recipient_id := v_payee_id;
    ELSIF NEW.raised_by = v_payee_id THEN
      v_recipient_id := v_customer_id;
    END IF;

    -- Fetch raised_by user display name
    SELECT display_name INTO v_raised_by_name
    FROM public.users
    WHERE id = NEW.raised_by;

    IF v_recipient_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE entity_type = 'job_issue'
          AND entity_id = NEW.id
          AND event_type = 'dispute_opened'
      ) THEN
        INSERT INTO public.notifications (
          user_id,
          event_type,
          title,
          body,
          entity_type,
          entity_id,
          job_id
        ) VALUES (
          v_recipient_id,
          'dispute_opened',
          COALESCE(v_raised_by_name, 'A user') || ' opened a dispute',
          'A dispute was opened for ' || COALESCE(v_job_title, 'your job') || '.',
          'job_issue',
          NEW.id,
          NEW.job_id
        );
      END IF;
    END IF;

  -- Handle UPDATE (Dispute resolved)
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'open' AND NEW.status IN ('resolved_payout', 'resolved_refund', 'resolved_split') THEN
      -- Notify Customer
      IF v_customer_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.notifications
          WHERE user_id = v_customer_id
            AND entity_type = 'job_issue'
            AND entity_id = NEW.id
            AND event_type = 'dispute_resolved'
        ) THEN
          INSERT INTO public.notifications (
            user_id,
            event_type,
            title,
            body,
            entity_type,
            entity_id,
            job_id
          ) VALUES (
            v_customer_id,
            'dispute_resolved',
            'Dispute resolved',
            'The dispute for ' || COALESCE(v_job_title, 'the job') || ' has been resolved.',
            'job_issue',
            NEW.id,
            NEW.job_id
          );
        END IF;
      END IF;

      -- Notify Tradie
      IF v_payee_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.notifications
          WHERE user_id = v_payee_id
            AND entity_type = 'job_issue'
            AND entity_id = NEW.id
            AND event_type = 'dispute_resolved'
        ) THEN
          INSERT INTO public.notifications (
            user_id,
            event_type,
            title,
            body,
            entity_type,
            entity_id,
            job_id
          ) VALUES (
            v_payee_id,
            'dispute_resolved',
            'Dispute resolved',
            'The dispute for ' || COALESCE(v_job_title, 'the job') || ' has been resolved.',
            'job_issue',
            NEW.id,
            NEW.job_id
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- 5. Enrich get_admin_job_evidence_pack with message history
CREATE OR REPLACE FUNCTION public.get_admin_job_evidence_pack(p_job_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_job public.jobs%ROWTYPE;
  v_customer jsonb;
  v_tradie jsonb;
  v_quote jsonb;
  v_variations jsonb;
  v_early_releases jsonb;
  v_invoices jsonb;
  v_payments jsonb;
  v_proofs jsonb;
  v_disputes jsonb;
  v_timeline jsonb;
  v_messages jsonb;
BEGIN
  -- 1. Explicit admin check
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  -- 2. Check parent Job exists
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- 3. Customer safe identity
  SELECT jsonb_build_object(
    'id', u.id,
    'display_name', u.display_name,
    'email', u.email,
    'phone', u.phone,
    'identity_verified', u.identity_verified,
    'tradie_verified', u.tradie_verified,
    'created_at', u.created_at
  ) INTO v_customer
  FROM public.users u
  WHERE u.id = v_job.customer_id;

  -- 4. Contracted Tradie safe identity (if any)
  SELECT jsonb_build_object(
    'id', u.id,
    'display_name', u.display_name,
    'email', u.email,
    'phone', u.phone,
    'abn', u.abn,
    'license_number', u.license_number,
    'identity_verified', u.identity_verified,
    'tradie_verified', u.tradie_verified,
    'created_at', u.created_at
  ) INTO v_tradie
  FROM public.applications a
  JOIN public.users u ON u.id = a.tradie_id
  WHERE a.job_id = p_job_id AND a.status = 'accepted'
  LIMIT 1;

  -- 5. Accepted Quote & Line Items
  SELECT jsonb_build_object(
    'id', a.id,
    'estimate', a.estimate,
    'status', a.status,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'line_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', aqli.id,
        'label', aqli.label,
        'description', aqli.description,
        'quantity', aqli.quantity,
        'unit_price', aqli.unit_price,
        'line_total', aqli.line_total,
        'line_type', aqli.line_type,
        'sort_order', aqli.sort_order
      ) ORDER BY aqli.sort_order)
      FROM public.accepted_quote_line_items aqli
      WHERE aqli.application_id = a.id
    ), '[]'::jsonb)
  ) INTO v_quote
  FROM public.applications a
  WHERE a.job_id = p_job_id AND a.status = 'accepted'
  LIMIT 1;

  -- 6. Variations (both line items and status)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', vr.id,
    'title', vr.title,
    'description', vr.description,
    'status', vr.status,
    'requested_at', vr.requested_at,
    'reviewed_at', vr.reviewed_at,
    'reviewed_by', vr.reviewed_by,
    'rejection_reason', vr.rejection_reason,
    'line_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vli.id,
        'label', vli.label,
        'description', vli.description,
        'quantity', vli.quantity,
        'unit_price', vli.unit_price,
        'line_type', vli.line_type,
        'sort_order', vli.sort_order
      ) ORDER BY vli.sort_order)
      FROM public.job_variation_line_items vli
      WHERE vli.variation_request_id = vr.id
    ), '[]'::jsonb)
  ) ORDER BY vr.requested_at DESC), '[]'::jsonb) INTO v_variations
  FROM public.job_variation_requests vr
  WHERE vr.job_id = p_job_id;

  -- 7. Early Release Requests
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', er.id,
    'amount', er.amount,
    'request_type', er.request_type,
    'status', er.status,
    'requested_at', er.requested_at,
    'reviewed_at', er.reviewed_at,
    'reviewed_by', er.reviewed_by,
    'notes', er.notes,
    'rejection_reason', er.rejection_reason
  ) ORDER BY er.requested_at DESC), '[]'::jsonb) INTO v_early_releases
  FROM public.early_release_requests er
  WHERE er.job_id = p_job_id;

  -- 8. Invoices / Receipts
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ji.id,
    'invoice_type', ji.invoice_type,
    'invoice_number', ji.invoice_number,
    'amount_cents', ji.amount_cents,
    'issued_at', ji.issued_at,
    'line_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', jili.id,
        'source_type', jili.source_type,
        'label', jili.label,
        'description', jili.description,
        'quantity', jili.quantity,
        'unit_price', jili.unit_price,
        'line_total', jili.line_total,
        'line_type', jili.line_type
      ) ORDER BY jili.sort_order)
      FROM public.job_invoice_line_items jili
      WHERE jili.invoice_id = ji.id
    ), '[]'::jsonb)
  ) ORDER BY ji.issued_at DESC), '[]'::jsonb) INTO v_invoices
  FROM public.job_invoices ji
  WHERE ji.job_id = p_job_id;

  -- 9. Payments and Ledgers
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'amount', p.amount,
    'platform_fee', p.platform_fee,
    'status', p.status,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'ledger_entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pl.id,
        'transaction_type', pl.transaction_type,
        'amount_cents', pl.amount_cents,
        'stripe_transaction_id', pl.stripe_transaction_id,
        'created_at', pl.created_at
      ) ORDER BY pl.created_at ASC)
      FROM public.payment_ledger pl
      WHERE pl.payment_id = p.id
    ), '[]'::jsonb)
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO v_payments
  FROM public.payments p
  WHERE p.job_id = p_job_id;

  -- 10. Completion Proofs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', cp.id,
    'description', cp.description,
    'attachments', cp.attachments,
    'created_at', cp.created_at,
    'auto_release_at', cp.auto_release_at
  ) ORDER BY cp.created_at DESC), '[]'::jsonb) INTO v_proofs
  FROM public.job_completion_proofs cp
  WHERE cp.job_id = p_job_id;

  -- 11. Disputes / Issues
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ji.id,
    'proof_id', ji.proof_id,
    'raised_by', ji.raised_by,
    'description', ji.description,
    'attachments', ji.attachments,
    'status', ji.status,
    'created_at', ji.created_at,
    'resolved_at', ji.resolved_at,
    'resolved_by', ji.resolved_by,
    'admin_notes', ji.admin_notes
  ) ORDER BY ji.created_at DESC), '[]'::jsonb) INTO v_disputes
  FROM public.job_issues ji
  WHERE ji.job_id = p_job_id;

  -- 12. Timeline Events (reusing get_job_evidence_timeline)
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_timeline
  FROM public.get_job_evidence_timeline(p_job_id) t;

  -- 13. Conversation Messages
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'sender_id', m.sender_id,
    'sender_name', u.display_name,
    'text', m.text,
    'created_at', m.created_at,
    'metadata', m.metadata
  ) ORDER BY m.created_at ASC), '[]'::jsonb) INTO v_messages
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  LEFT JOIN public.users u ON u.id = m.sender_id
  WHERE c.job_id = p_job_id;

  -- Combine everything into a single JSON
  v_result := jsonb_build_object(
    'job', jsonb_build_object(
      'id', v_job.id,
      'title', v_job.title,
      'description', v_job.description,
      'status', v_job.status,
      'created_at', v_job.created_at,
      'updated_at', v_job.updated_at
    ),
    'customer', v_customer,
    'tradie', v_tradie,
    'quote', v_quote,
    'variations', v_variations,
    'early_releases', v_early_releases,
    'invoices', v_invoices,
    'payments', v_payments,
    'completion_proofs', v_proofs,
    'disputes', v_disputes,
    'timeline', v_timeline,
    'messages', v_messages
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
