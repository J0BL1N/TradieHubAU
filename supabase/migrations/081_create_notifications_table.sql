-- Migration: 081_create_notifications_table.sql
-- Description: Create public.notifications table with RLS, indexes, and helper RPCs.

-- 1. Create the Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  job_id          UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at) WHERE (read_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_job_id ON public.notifications(job_id);
CREATE INDEX IF NOT EXISTS idx_notifications_conversation_id ON public.notifications(conversation_id);

-- 3. Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications read status"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 5. Safe Helper RPCs (SECURITY DEFINER with restricted execute access)
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND read_at IS NULL;
  
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_rows INTEGER;
BEGIN
  UPDATE public.notifications
  SET read_at = NOW()
  WHERE user_id = auth.uid()
    AND read_at IS NULL;
  
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  RETURN v_updated_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND read_at IS NULL;
  
  RETURN v_count;
END;
$$;

-- 6. Revoke PUBLIC execute from security definer helper functions and grant to authenticated
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_unread_notification_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;

-- 7. Enable Supabase Realtime for notifications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
