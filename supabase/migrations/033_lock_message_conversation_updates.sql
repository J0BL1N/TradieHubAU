-- Migration: 033_lock_message_conversation_updates.sql
-- Description: Resolve Medium Issue M-05 by locking conversation linkage/cache
-- fields and restricting message updates to recipient read-state transitions.

DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;

-- Conversation participants cannot directly rewrite participants, job linkage,
-- or last-message evidence. This trusted insert trigger maintains the cache.
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS trigger
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_text = NEW.text,
    last_message_at = NEW.created_at,
    last_message_from = NEW.sender_id
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.update_conversation_last_message() FROM PUBLIC;

-- Only the recipient may select an incoming message for a read-state update.
CREATE POLICY "Recipients can mark messages read" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  )
  WITH CHECK (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Enforce a one-way unread-to-read transition and keep all message evidence,
-- linkage, authorship, content, and timestamps immutable to direct clients.
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
     NEW.created_at IS DISTINCT FROM OLD.created_at OR
     NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'Message content, authorship, linkage, and metadata are immutable.';
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

DROP TRIGGER IF EXISTS protect_message_read_updates_trigger ON public.messages;
CREATE TRIGGER protect_message_read_updates_trigger
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_message_read_updates();

COMMENT ON POLICY "Recipients can mark messages read" ON public.messages IS
  'Allows only conversation recipients to perform the trigger-enforced unread-to-read transition.';

COMMENT ON FUNCTION public.protect_message_read_updates() IS
  'Prevents direct changes to message evidence and permits only recipient read-state updates with server-managed read_at.';
