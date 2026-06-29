-- Migration: 067_lock_accepted_quote_lines.sql
-- Description: Create public.accepted_quote_line_items table, triggers to snapshot accepted quote lines, triggers to prevent modifying lines for non-pending applications, and perform historical backfill.

-- 1. Create the Snapshot Table
CREATE TABLE IF NOT EXISTS public.accepted_quote_line_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                      UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id              UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  original_quote_line_item_id UUID REFERENCES public.quote_line_items(id) ON DELETE SET NULL,
  tradie_id                   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  label                       TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
  description                 TEXT,
  quantity                    NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price                  NUMERIC NOT NULL CHECK (unit_price >= 0),
  line_total                  NUMERIC NOT NULL CHECK (line_total >= 0),
  line_type                   TEXT NOT NULL CHECK (line_type IN ('labour', 'materials', 'callout', 'disposal', 'other')),
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  
  accepted_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for Query Performance and Duplication Prevention
CREATE INDEX idx_accepted_quote_line_items_job ON public.accepted_quote_line_items(job_id);
CREATE INDEX idx_accepted_quote_line_items_application ON public.accepted_quote_line_items(application_id);
CREATE INDEX idx_accepted_quote_line_items_tradie ON public.accepted_quote_line_items(tradie_id);
CREATE INDEX idx_accepted_quote_line_items_customer ON public.accepted_quote_line_items(customer_id);

-- Ensure a single original quote line item cannot be snapshotted multiple times for the same application
CREATE UNIQUE INDEX idx_accepted_quote_line_items_unique_original
  ON public.accepted_quote_line_items(application_id, original_quote_line_item_id)
  WHERE original_quote_line_item_id IS NOT NULL;

-- 3. Enable RLS
ALTER TABLE public.accepted_quote_line_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy (Read-only for clients, write-only via system triggers)
CREATE POLICY "Users can select accepted quote line items"
  ON public.accepted_quote_line_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      customer_id = auth.uid()
      OR tradie_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

-- 5. Trigger Function: Snapshot accepted quote lines automatically
CREATE OR REPLACE FUNCTION public.handle_accepted_application_snapshot()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status <> 'accepted') THEN
    -- Ensure we only snapshot once per application
    IF NOT EXISTS (
      SELECT 1 FROM public.accepted_quote_line_items
      WHERE application_id = NEW.id
    ) THEN
      INSERT INTO public.accepted_quote_line_items (
        job_id,
        application_id,
        original_quote_line_item_id,
        tradie_id,
        customer_id,
        label,
        description,
        quantity,
        unit_price,
        line_total,
        line_type,
        sort_order
      )
      SELECT 
        q.job_id,
        q.application_id,
        q.id as original_quote_line_item_id,
        q.tradie_id,
        j.customer_id,
        q.label,
        q.description,
        q.quantity,
        q.unit_price,
        q.line_total,
        q.line_type,
        q.sort_order
      FROM public.quote_line_items q
      JOIN public.jobs j ON j.id = q.job_id
      WHERE q.application_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snapshot_accepted_quote_lines_trigger ON public.applications;
CREATE TRIGGER snapshot_accepted_quote_lines_trigger
  AFTER UPDATE OF status ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_accepted_application_snapshot();

-- 6. Trigger Function: Lock quote line items after quote is accepted/declined/withdrawn (non-pending)
CREATE OR REPLACE FUNCTION public.protect_quote_line_items()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_app_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_app_id := OLD.application_id;
  ELSE
    v_app_id := NEW.application_id;
  END IF;

  SELECT status INTO v_status FROM public.applications WHERE id = v_app_id;
  
  -- If the parent application is deleted (e.g. cascading deletes), allow deleting the quote lines
  IF v_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RAISE EXCEPTION 'Parent application not found.';
    END IF;
  END IF;

  -- Block any mutations unless the application status is pending
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot modify quote line items for an application that is not pending (current status: %).', v_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_quote_line_items_trigger ON public.quote_line_items;
CREATE TRIGGER protect_quote_line_items_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.quote_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_quote_line_items();

-- 7. Backfill existing accepted applications
INSERT INTO public.accepted_quote_line_items (
  job_id,
  application_id,
  original_quote_line_item_id,
  tradie_id,
  customer_id,
  label,
  description,
  quantity,
  unit_price,
  line_total,
  line_type,
  sort_order,
  accepted_at
)
SELECT 
  q.job_id,
  q.application_id,
  q.id as original_quote_line_item_id,
  q.tradie_id,
  j.customer_id,
  q.label,
  q.description,
  q.quantity,
  q.unit_price,
  q.line_total,
  q.line_type,
  q.sort_order,
  a.updated_at as accepted_at
FROM public.quote_line_items q
JOIN public.applications a ON a.id = q.application_id
JOIN public.jobs j ON j.id = q.job_id
WHERE a.status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM public.accepted_quote_line_items aq
    WHERE aq.application_id = a.id
  )
ON CONFLICT DO NOTHING;
