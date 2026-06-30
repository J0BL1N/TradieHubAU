-- Migration: 084_payment_status_notifications.sql
-- Description: Create triggers on public.payments and public.job_completion_proofs to generate notifications for payment funding/release and completion proof submissions.

-- 1. Trigger for Payments
CREATE OR REPLACE FUNCTION public.create_notification_on_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title TEXT;
BEGIN
  -- Fetch job title
  SELECT title INTO v_job_title
  FROM public.jobs
  WHERE id = NEW.job_id;

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
        'Payment funded',
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
        'Payment released',
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

DROP TRIGGER IF EXISTS trg_create_notification_on_payment_change ON public.payments;
CREATE TRIGGER trg_create_notification_on_payment_change
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_on_payment_change();

-- 2. Trigger for Completion Proofs
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
        'Completion proof submitted',
        COALESCE(v_tradie_name, 'The tradie') || ' submitted proof of completion for ' || COALESCE(v_job_title, 'your job') || '. Please review it.',
        'completion_proof',
        NEW.id,
        NEW.job_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_notification_on_completion_proof ON public.job_completion_proofs;
CREATE TRIGGER trg_create_notification_on_completion_proof
  AFTER INSERT ON public.job_completion_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_on_completion_proof();
