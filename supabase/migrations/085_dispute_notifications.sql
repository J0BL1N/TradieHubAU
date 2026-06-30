-- Migration: 085_dispute_notifications.sql
-- Description: Create AFTER INSERT OR UPDATE trigger on public.job_issues to generate in-app notifications for dispute openings and resolutions.

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
          'Dispute opened',
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

-- Create the trigger
DROP TRIGGER IF EXISTS trg_create_notification_on_dispute_change ON public.job_issues;
CREATE TRIGGER trg_create_notification_on_dispute_change
  AFTER INSERT OR UPDATE ON public.job_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_on_dispute_change();
