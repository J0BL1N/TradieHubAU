-- Migration: 039_enable_message_realtime.sql
-- Description: Enable Supabase Realtime events for job messages so active
-- conversation views can receive new message/read-status changes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
