-- Migration: 086_verification_notifications.sql
-- Description: Create AFTER UPDATE trigger on public.verifications to generate in-app notifications for verification document approval, rejection, and recheck requests.

CREATE OR REPLACE FUNCTION public.create_notification_on_verification_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_label TEXT;
BEGIN
  -- Convert document_type code to a reader-friendly label
  v_doc_label := REPLACE(NEW.document_type, '_', ' ');
  v_doc_label := UPPER(SUBSTRING(v_doc_label FROM 1 FOR 1)) || SUBSTRING(v_doc_label FROM 2);

  -- 1. Document Approved
  IF OLD.status <> NEW.status AND NEW.status = 'approved' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE entity_type = 'verification'
        AND entity_id = NEW.id
        AND event_type = 'verification_approved'
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        event_type,
        title,
        body,
        entity_type,
        entity_id
      ) VALUES (
        NEW.user_id,
        'verification_approved',
        'Verification document approved',
        v_doc_label || ' document has been approved.',
        'verification',
        NEW.id
      );
    END IF;

  -- 2. Document Rejected
  ELSIF OLD.status <> NEW.status AND NEW.status = 'rejected' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE entity_type = 'verification'
        AND entity_id = NEW.id
        AND event_type = 'verification_rejected'
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        event_type,
        title,
        body,
        entity_type,
        entity_id
      ) VALUES (
        NEW.user_id,
        'verification_rejected',
        'Verification document rejected',
        v_doc_label || ' document was rejected. ' || COALESCE('Notes: ' || NEW.admin_notes, ''),
        'verification',
        NEW.id
      );
    END IF;

  -- 3. Recheck Requested
  ELSIF (OLD.recheck_requested_at IS NULL AND NEW.recheck_requested_at IS NOT NULL) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE entity_type = 'verification'
        AND entity_id = NEW.id
        AND event_type = 'verification_recheck_requested'
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        event_type,
        title,
        body,
        entity_type,
        entity_id
      ) VALUES (
        NEW.user_id,
        'verification_recheck_requested',
        'Verification recheck requested',
        'Admin requested a recheck of your ' || LOWER(v_doc_label) || ' document. ' || COALESCE('Reason: ' || NEW.recheck_reason, ''),
        'verification',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_create_notification_on_verification_change ON public.verifications;
CREATE TRIGGER trg_create_notification_on_verification_change
  AFTER UPDATE ON public.verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_on_verification_change();
