-- Migration: 066_add_quote_line_items.sql
-- Description: Create public.quote_line_items table with appropriate foreign keys, CHECK constraints, indexes, and row-level security (RLS) policies.

-- 1. Create the Table
CREATE TABLE IF NOT EXISTS public.quote_line_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  tradie_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id         UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  
  label          TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
  description    TEXT,
  quantity       NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total     NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  line_type      TEXT NOT NULL DEFAULT 'labour' CHECK (line_type IN ('labour', 'materials', 'callout', 'disposal', 'other')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for Performance
CREATE INDEX idx_quote_line_items_application ON public.quote_line_items(application_id);
CREATE INDEX idx_quote_line_items_tradie      ON public.quote_line_items(tradie_id);
CREATE INDEX idx_quote_line_items_job         ON public.quote_line_items(job_id);

-- 3. Enable RLS
ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Policy for INSERT
CREATE POLICY "Tradies can insert own quote line items"
  ON public.quote_line_items FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.tradie_id = auth.uid()
        AND a.status = 'pending'
    )
  );

-- Policy for SELECT
CREATE POLICY "Users can select quote line items"
  ON public.quote_line_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      tradie_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = job_id
          AND j.customer_id = auth.uid()
      )
      OR public.is_admin(auth.uid())
    )
  );

-- Policy for UPDATE
CREATE POLICY "Tradies can update own pending quote line items"
  ON public.quote_line_items FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.tradie_id = auth.uid()
        AND a.status = 'pending'
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.tradie_id = auth.uid()
        AND a.status = 'pending'
    )
  );

-- Policy for DELETE
CREATE POLICY "Tradies can delete own pending quote line items"
  ON public.quote_line_items FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.tradie_id = auth.uid()
        AND a.status = 'pending'
    )
  );

-- 5. Updated At Trigger
CREATE TRIGGER update_quote_line_items_updated_at
  BEFORE UPDATE ON public.quote_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
