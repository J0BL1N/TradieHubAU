-- Migration: 042_lifecycle_system_messages.sql
-- Description: Add immutable system messages for key job messaging lifecycle
-- events and route them through trusted database functions only.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS system_event_type text NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.messages
  ALTER COLUMN sender_id DROP NOT NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check,
  ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('user', 'system'));

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_author_type_check,
  ADD CONSTRAINT messages_author_type_check
    CHECK (
      (
        message_type = 'user'
        AND sender_id IS NOT NULL
        AND system_event_type IS NULL
      )
      OR
      (
        message_type = 'system'
        AND sender_id IS NULL
        AND system_event_type IS NOT NULL
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS messages_unique_system_event_per_conversation
  ON public.messages (conversation_id, system_event_type)
  WHERE message_type = 'system';

-- Keep cancelled/refunded dispute-result conversations readable to the same
-- canonical participants. Sending remains restricted by send_job_message().
DROP POLICY IF EXISTS "Job participants view conversations" ON public.conversations;
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
          'completed',
          'cancelled'
        )
    )
  );

DROP POLICY IF EXISTS "Job participants view messages" ON public.messages;
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
          'completed',
          'cancelled'
        )
    )
  );

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
      'completed',
      'cancelled'
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.protect_message_read_updates()
RETURNS trigger
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = OLD.sender_id THEN
    RAISE EXCEPTION 'Only the message recipient can mark a message as read.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR
     NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
     NEW.sender_id IS DISTINCT FROM OLD.sender_id OR
     NEW.text IS DISTINCT FROM OLD.text OR
     NEW.message_type IS DISTINCT FROM OLD.message_type OR
     NEW.system_event_type IS DISTINCT FROM OLD.system_event_type OR
     NEW.metadata IS DISTINCT FROM OLD.metadata OR
     NEW.created_at IS DISTINCT FROM OLD.created_at OR
     NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'Message content, authorship, linkage, type, metadata, and timestamps are immutable.';
  END IF;

  IF OLD.read IS TRUE OR NEW.read IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Messages may only transition from unread to read.';
  END IF;

  IF NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'Message read_at is system-managed.';
  END IF;

  NEW.read_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.insert_system_message_for_job(
  p_job_id uuid,
  p_system_event_type text,
  p_text text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer_id uuid;
  v_payee_id uuid;
  v_job_title text;
  v_conversation_id uuid;
  v_message_id uuid;
  v_metadata jsonb;
BEGIN
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Job id is required for system messages.';
  END IF;

  IF btrim(COALESCE(p_system_event_type, '')) = '' THEN
    RAISE EXCEPTION 'System event type is required.';
  END IF;

  IF btrim(COALESCE(p_text, '')) = '' THEN
    RAISE EXCEPTION 'System message text is required.';
  END IF;

  SELECT j.customer_id, p.payee_id, j.title
  INTO v_customer_id, v_payee_id, v_job_title
  FROM public.jobs j
  JOIN public.payments p ON p.job_id = j.id
  WHERE j.id = p_job_id
    AND p.payer_id = j.customer_id;

  IF v_customer_id IS NULL OR v_payee_id IS NULL THEN
    RAISE EXCEPTION 'A canonical job payment relationship is required for system messages.';
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
      RETURNING id INTO v_conversation_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT c.id
      INTO v_conversation_id
      FROM public.conversations c
      WHERE c.job_id = p_job_id
        AND c.user1_id = v_customer_id
        AND c.user2_id = v_payee_id;
    END;
  END IF;

  SELECT m.id
  INTO v_message_id
  FROM public.messages m
  WHERE m.conversation_id = v_conversation_id
    AND m.message_type = 'system'
    AND m.system_event_type = p_system_event_type;

  IF v_message_id IS NOT NULL THEN
    RETURN v_message_id;
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'job_id', p_job_id,
      'event_type', p_system_event_type
    );

  BEGIN
    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      text,
      read,
      read_at,
      message_type,
      system_event_type,
      metadata
    )
    VALUES (
      v_conversation_id,
      NULL,
      btrim(p_text),
      TRUE,
      now(),
      'system',
      p_system_event_type,
      v_metadata
    )
    RETURNING id INTO v_message_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT m.id
    INTO v_message_id
    FROM public.messages m
    WHERE m.conversation_id = v_conversation_id
      AND m.message_type = 'system'
      AND m.system_event_type = p_system_event_type;
  END;

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_system_message_for_job(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_quote(p_job_id uuid, p_application_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_tradie_id uuid;
  v_estimate numeric;
  v_amount_cents integer;
  v_fee_cents integer;
BEGIN
  SELECT customer_id INTO v_customer_id FROM public.jobs WHERE id = p_job_id;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;
  IF v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can accept a quote.';
  END IF;

  SELECT tradie_id, estimate INTO v_tradie_id, v_estimate
  FROM public.applications
  WHERE id = p_application_id AND job_id = p_job_id;
  IF v_tradie_id IS NULL THEN
    RAISE EXCEPTION 'Quote not found for this job.';
  END IF;

  IF v_estimate IS NULL OR v_estimate <= 0 THEN
    RAISE EXCEPTION 'Cannot accept a quote without a valid, positive estimate.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND status <> 'open') THEN
    RAISE EXCEPTION 'Job is not open for quotes.';
  END IF;

  UPDATE public.applications
  SET status = 'accepted', updated_at = now()
  WHERE id = p_application_id;

  UPDATE public.applications
  SET status = 'declined', updated_at = now()
  WHERE job_id = p_job_id AND id <> p_application_id AND status = 'pending';

  UPDATE public.jobs
  SET status = 'accepted', updated_at = now()
  WHERE id = p_job_id;

  v_amount_cents := (v_estimate * 100)::integer;
  v_fee_cents := calculate_platform_fee(v_amount_cents);

  PERFORM set_config('app.authorized_payment_update', 'true', true);

  INSERT INTO public.payments (job_id, payer_id, payee_id, amount, platform_fee, status)
  VALUES (p_job_id, v_customer_id, v_tradie_id, v_amount_cents, v_fee_cents, 'pending')
  ON CONFLICT (job_id) DO UPDATE
  SET amount = EXCLUDED.amount, platform_fee = EXCLUDED.platform_fee, status = 'pending';

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    'quote_accepted',
    'Quote accepted - protected payment is required before work should begin.',
    jsonb_build_object('application_id', p_application_id)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.simulate_payment_funding(p_job_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_payment_id uuid;
  v_payment_status text;
  v_amount_cents integer;
  v_ledger_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT j.customer_id, j.status
  INTO v_customer_id, v_job_status
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  IF v_customer_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the job owner or staff administrators can fund this job payment.';
  END IF;

  SELECT p.id, p.status, p.amount
  INTO v_payment_id, v_payment_status, v_amount_cents
  FROM public.payments p
  WHERE p.job_id = p_job_id
  FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;

  IF v_job_status = 'payment_held' AND v_payment_status = 'held' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.payment_ledger pl
      WHERE pl.payment_id = v_payment_id
        AND pl.transaction_type = 'charge'
    )
    INTO v_ledger_exists;

    IF v_ledger_exists THEN
      RETURN;
    END IF;
  END IF;

  IF v_job_status <> 'accepted' THEN
    RAISE EXCEPTION 'Job status must be accepted to simulate payment funding.';
  END IF;

  IF v_payment_status <> 'pending' THEN
    RAISE EXCEPTION 'Payment status must be pending to simulate payment funding.';
  END IF;

  PERFORM set_config('app.authorized_payment_update', 'true', true);

  UPDATE public.payments
  SET status = 'held', updated_at = now()
  WHERE id = v_payment_id
    AND status = 'pending';

  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'charge', v_amount_cents);

  UPDATE public.jobs
  SET status = 'payment_held', updated_at = now()
  WHERE id = p_job_id
    AND status = 'accepted';

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    'payment_funded',
    'Protected payment funded - contract active.',
    jsonb_build_object('payment_id', v_payment_id)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.submit_completion_proof(
  p_job_id uuid,
  p_description text,
  p_attachments text[]
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tradie_id uuid;
  v_job_status text;
  v_proof_id uuid;
BEGIN
  SELECT j.status, p.payee_id
  INTO v_job_status, v_tradie_id
  FROM public.jobs j
  JOIN public.payments p ON p.job_id = j.id
  WHERE j.id = p_job_id;

  IF v_tradie_id IS NULL THEN
    RAISE EXCEPTION 'No active contract/payment record found for this job.';
  END IF;
  IF v_tradie_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned contractor can submit completion proof.';
  END IF;
  IF v_job_status <> 'payment_held' THEN
    RAISE EXCEPTION 'Job is not in progress / funded. Current status: %', v_job_status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.job_completion_proofs WHERE job_id = p_job_id) THEN
    RAISE EXCEPTION 'A completion proof has already been submitted for this job.';
  END IF;

  INSERT INTO public.job_completion_proofs (job_id, tradie_id, description, attachments, auto_release_at)
  VALUES (p_job_id, v_tradie_id, p_description, COALESCE(p_attachments, '{}'), now() + interval '72 hours')
  RETURNING id INTO v_proof_id;

  UPDATE public.jobs
  SET status = 'completed_pending_review', updated_at = now()
  WHERE id = p_job_id;

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    'completion_proof_submitted',
    'Completion proof submitted - 72-hour customer review started.',
    jsonb_build_object('proof_id', v_proof_id)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.approve_job_completion(p_job_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_payment_id uuid;
  v_payment_status text;
  v_total_funded integer;
  v_fee_cents integer;
BEGIN
  SELECT j.status, j.customer_id
  INTO v_job_status, v_customer_id
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;
  IF auth.uid() IS NULL OR v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can approve completion.';
  END IF;
  IF v_job_status = 'disputed' THEN
    RAISE EXCEPTION 'Disputed jobs must be resolved by an administrator.';
  END IF;
  IF v_job_status <> 'completed_pending_review' THEN
    RAISE EXCEPTION 'Job must be awaiting completion review before it can be approved.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.job_issues ji
    WHERE ji.job_id = p_job_id
      AND ji.status = 'open'
  ) THEN
    RAISE EXCEPTION 'This job has an active dispute and requires administrator resolution.';
  END IF;

  SELECT p.id, p.status
  INTO v_payment_id, v_payment_status
  FROM public.payments p
  WHERE p.job_id = p_job_id
  FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;
  IF v_payment_status <> 'held' THEN
    RAISE EXCEPTION 'Payment must be held before completion can be approved.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_ledger pl
    WHERE pl.payment_id = v_payment_id
      AND pl.transaction_type IN ('payout', 'refund', 'fee')
  ) THEN
    RAISE EXCEPTION 'Payment has already been settled.';
  END IF;

  SELECT COALESCE(SUM(pl.amount_cents), 0)
  INTO v_total_funded
  FROM public.payment_ledger pl
  WHERE pl.payment_id = v_payment_id
    AND pl.transaction_type = 'charge';

  IF v_total_funded <= 0 THEN
    RAISE EXCEPTION 'Cannot complete job: No funded payments exist in ledger.';
  END IF;

  v_fee_cents := calculate_platform_fee(v_total_funded);

  PERFORM set_config('app.authorized_payment_update', 'true', true);

  UPDATE public.payments
  SET
    status = 'released',
    amount = v_total_funded,
    platform_fee = v_fee_cents,
    updated_at = now()
  WHERE id = v_payment_id
    AND status = 'held';

  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'payout', v_total_funded - v_fee_cents);

  INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
  VALUES (v_payment_id, 'fee', v_fee_cents);

  UPDATE public.jobs
  SET status = 'completed', updated_at = now()
  WHERE id = p_job_id
    AND status = 'completed_pending_review';

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    'work_approved',
    'Work approved - payment release recorded.',
    jsonb_build_object('payment_id', v_payment_id)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.raise_job_issue(
  p_job_id uuid,
  p_description text,
  p_attachments text[] DEFAULT '{}'
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_status text;
  v_proof_id uuid;
  v_issue_id uuid;
BEGIN
  SELECT j.status, j.customer_id
  INTO v_job_status, v_customer_id
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;
  IF auth.uid() IS NULL OR v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the job owner can raise an issue.';
  END IF;
  IF v_job_status <> 'completed_pending_review' THEN
    RAISE EXCEPTION 'Job is not in review phase.';
  END IF;

  SELECT jcp.id
  INTO v_proof_id
  FROM public.job_completion_proofs jcp
  WHERE jcp.job_id = p_job_id
  ORDER BY jcp.created_at DESC
  LIMIT 1;

  INSERT INTO public.job_issues (
    job_id,
    proof_id,
    raised_by,
    description,
    attachments,
    status
  )
  VALUES (
    p_job_id,
    v_proof_id,
    auth.uid(),
    p_description,
    p_attachments,
    'open'
  )
  RETURNING id INTO v_issue_id;

  UPDATE public.jobs
  SET status = 'disputed', updated_at = now()
  WHERE id = p_job_id
    AND status = 'completed_pending_review';

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    'dispute_opened',
    'Completion disputed - case moved to admin review.',
    jsonb_build_object('issue_id', v_issue_id, 'proof_id', v_proof_id)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.raise_job_issue(
  p_job_id uuid,
  p_description text
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.raise_job_issue(p_job_id, p_description, ARRAY[]::text[]);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.resolve_dispute(p_job_id uuid, p_resolution text, p_split_percentage integer)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payer_id uuid;
  v_payee_id uuid;
  v_payment_id uuid;
  v_total_funded integer;
  v_platform_fee integer;
  v_split_payout integer;
  v_split_fee integer;
  v_split_refund integer;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can resolve disputes.';
  END IF;

  SELECT id, payer_id, payee_id
  INTO v_payment_id, v_payer_id, v_payee_id
  FROM public.payments
  WHERE job_id = p_job_id;

  IF v_payer_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for this job.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND status = 'disputed') THEN
    RAISE EXCEPTION 'Job is not in disputed status.';
  END IF;

  IF p_split_percentage < 0 OR p_split_percentage > 100 THEN
    RAISE EXCEPTION 'Split percentage must be between 0 and 100.';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0)
  INTO v_total_funded
  FROM public.payment_ledger
  WHERE payment_id = v_payment_id AND transaction_type = 'charge';

  IF v_total_funded <= 0 THEN
    RAISE EXCEPTION 'Cannot resolve dispute: No funded payments exist in ledger.';
  END IF;

  v_platform_fee := calculate_platform_fee(v_total_funded);

  PERFORM set_config('app.authorized_payment_update', 'true', true);

  IF p_split_percentage = 100 THEN
    UPDATE public.payments
    SET
      status = 'released',
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now()
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;

    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'payout', v_total_funded - v_platform_fee);
    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'fee', v_platform_fee);

  ELSIF p_split_percentage = 0 THEN
    UPDATE public.payments
    SET
      status = 'refunded',
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now()
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'cancelled', updated_at = now() WHERE id = p_job_id;

    INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
    VALUES (v_payment_id, 'refund', v_total_funded);

  ELSE
    UPDATE public.payments
    SET
      status = 'released',
      amount = v_total_funded,
      platform_fee = v_platform_fee,
      updated_at = now()
    WHERE id = v_payment_id;

    UPDATE public.jobs SET status = 'completed', updated_at = now() WHERE id = p_job_id;

    v_split_payout := ROUND((v_total_funded - v_platform_fee) * (p_split_percentage / 100.0))::integer;
    v_split_fee := ROUND(v_platform_fee * (p_split_percentage / 100.0))::integer;
    v_split_refund := v_total_funded - (v_split_payout + v_split_fee);

    IF v_split_payout > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'payout', v_split_payout);
    END IF;

    IF v_split_fee > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'fee', v_split_fee);
    END IF;

    IF v_split_refund > 0 THEN
      INSERT INTO public.payment_ledger (payment_id, transaction_type, amount_cents)
      VALUES (v_payment_id, 'refund', v_split_refund);
    END IF;
  END IF;

  UPDATE public.job_issues
  SET
    status = CASE
      WHEN p_split_percentage = 100 THEN 'resolved_payout'::text
      WHEN p_split_percentage = 0 THEN 'resolved_refund'::text
      ELSE 'resolved_split'::text
    END,
    resolved_at = now(),
    resolved_by = auth.uid(),
    admin_notes = p_resolution || ' (Split: ' || p_split_percentage::text || '% to tradie)'
  WHERE job_id = p_job_id AND status = 'open';

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    'admin_dispute_resolved',
    'Admin resolved the dispute.',
    jsonb_build_object(
      'payment_id', v_payment_id,
      'split_percentage', p_split_percentage
    )
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.record_admin_dispute_action(
  p_job_id uuid,
  p_action text,
  p_admin_notes text
)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue_id uuid;
  v_message_text text;
  v_event_type text;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can update dispute actions.';
  END IF;

  IF p_action NOT IN ('request_evidence', 'escalate') THEN
    RAISE EXCEPTION 'Unsupported admin dispute action.';
  END IF;

  IF btrim(COALESCE(p_admin_notes, '')) = '' THEN
    RAISE EXCEPTION 'Admin notes are required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND status = 'disputed') THEN
    RAISE EXCEPTION 'Job is not in disputed status.';
  END IF;

  UPDATE public.job_issues
  SET admin_notes = btrim(p_admin_notes)
  WHERE job_id = p_job_id
    AND status = 'open'
  RETURNING id INTO v_issue_id;

  IF v_issue_id IS NULL THEN
    RAISE EXCEPTION 'This dispute is no longer open. Refresh the case before adding notes.';
  END IF;

  IF p_action = 'request_evidence' THEN
    v_event_type := 'admin_requested_more_evidence';
    v_message_text := 'Admin requested more evidence.';
  ELSE
    v_event_type := 'admin_escalated_dispute';
    v_message_text := 'Admin escalated the dispute.';
  END IF;

  PERFORM public.insert_system_message_for_job(
    p_job_id,
    v_event_type,
    v_message_text,
    jsonb_build_object('issue_id', v_issue_id)
  );
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.accept_quote(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_completion_proof(uuid, text, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.raise_job_issue(uuid, text, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.raise_job_issue(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_job_completion(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.simulate_payment_funding(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_dispute(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_admin_dispute_action(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.accept_quote(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_completion_proof(uuid, text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.raise_job_issue(uuid, text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.raise_job_issue(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_job_completion(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_payment_funding(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_admin_dispute_action(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.insert_system_message_for_job(uuid, text, text, jsonb) IS
  'Internal trusted helper for idempotent immutable system messages in canonical job conversations. Direct client execution is revoked.';
COMMENT ON FUNCTION public.record_admin_dispute_action(uuid, text, text) IS
  'Admin-only dispute soft-action RPC that records admin notes and inserts an idempotent job conversation system message.';
