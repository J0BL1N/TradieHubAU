-- Migration: 083_quote_lifecycle_notifications.sql
-- Description: Create AFTER INSERT OR UPDATE trigger on public.applications to generate in-app notifications for quote submissions, acceptances, and declines.

CREATE OR REPLACE FUNCTION public.create_notification_on_application_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title TEXT;
  v_tradie_name TEXT;
BEGIN
  -- Fetch job title
  SELECT title INTO v_job_title
  FROM public.jobs
  WHERE id = NEW.job_id;

  -- Fetch tradie display name
  SELECT display_name INTO v_tradie_name
  FROM public.users
  WHERE id = NEW.tradie_id;

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
        'New quote application',
        COALESCE(v_tradie_name, 'A tradie') || ' submitted a quote for ' || COALESCE(v_job_title, 'your job'),
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
          'Quote accepted',
          'Your quote for ' || COALESCE(v_job_title, 'the job') || ' was accepted',
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
          'Quote declined',
          'Your quote for ' || COALESCE(v_job_title, 'the job') || ' was declined',
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

-- Create the trigger
DROP TRIGGER IF EXISTS trg_create_notification_on_application_change ON public.applications;
CREATE TRIGGER trg_create_notification_on_application_change
  AFTER INSERT OR UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_on_application_change();
