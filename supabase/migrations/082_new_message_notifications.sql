-- Migration: 082_new_message_notifications.sql
-- Description: Create AFTER INSERT trigger on public.messages to generate in-app notifications for message recipients.

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
BEGIN
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

    -- Insert notification for the recipient (avoiding self-notification and duplicates)
    IF v_recipient_id IS NOT NULL AND NEW.sender_id <> v_recipient_id THEN
      -- Use a NOT EXISTS check to prevent duplicate notifications for the same message entity_id
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
          'New message',
          'You have a new message about ' || COALESCE(v_job_title, 'your job'),
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

-- Create the trigger
DROP TRIGGER IF EXISTS trg_create_notification_on_new_message ON public.messages;
CREATE TRIGGER trg_create_notification_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_on_new_message();
