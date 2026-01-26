-- Migration: Ongoing Jobs & Invoicing
-- Features: job_assignments, invoices, invoice_items, job_events
-- 1. Create Tables
-- A1) job_assignments (accepted job record)
CREATE TABLE IF NOT EXISTS public.job_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.users(id),
    tradie_id UUID NOT NULL REFERENCES public.users(id),
    accepted_quote_id UUID REFERENCES public.proposals(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'completed', 'cancelled', 'disputed')
    ),
    accepted_at TIMESTAMPTZ DEFAULT now(),
    start_date DATE,
    target_end_date DATE,
    agreed_scope_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(job_id)
);
-- A2) invoices
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    tradie_id UUID NOT NULL REFERENCES public.users(id),
    customer_id UUID NOT NULL REFERENCES public.users(id),
    invoice_number BIGSERIAL,
    -- Auto-incrementing global sequence
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
    issue_date DATE DEFAULT current_date,
    due_date DATE,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    tax NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    notes_payment_terms TEXT,
    notes_inclusions TEXT,
    notes_exclusions TEXT,
    notes_warranty TEXT,
    accompanying_message TEXT,
    gst_enabled BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    void_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
-- A3) invoice_items
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    qty NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    line_total NUMERIC NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
-- A4) job_events (activity timeline)
CREATE TABLE IF NOT EXISTS public.job_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    -- quote_accepted|invoice_created|invoice_sent|invoice_paid|status_changed|note_added
    actor_id UUID NOT NULL REFERENCES public.users(id),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);
-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON public.job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_customer_id ON public.job_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_tradie_id ON public.job_assignments(tradie_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON public.invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tradie_id ON public.invoices(tradie_id);
CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON public.job_events(job_id);
-- 3. RLS - Enable Row Level Security
ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;
-- 4. RLS Policies
-- Participant Rule: auth.uid() is customer or tradie
-- Job Assignments
CREATE POLICY "Participants can view their assignments" ON public.job_assignments FOR
SELECT USING (
        auth.uid() = customer_id
        OR auth.uid() = tradie_id
    );
CREATE POLICY "System/Customer can create assignments" ON public.job_assignments FOR
INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Participants can update assignments" ON public.job_assignments FOR
UPDATE USING (
        auth.uid() = customer_id
        OR auth.uid() = tradie_id
    );
-- Invoices
CREATE POLICY "Participants can view invoices" ON public.invoices FOR
SELECT USING (
        auth.uid() = customer_id
        OR auth.uid() = tradie_id
    );
CREATE POLICY "Tradies can create invoices for their assigned jobs" ON public.invoices FOR
INSERT WITH CHECK (
        auth.uid() = tradie_id
        AND EXISTS (
            SELECT 1
            FROM public.job_assignments
            WHERE job_id = invoices.job_id
                AND tradie_id = auth.uid()
        )
    );
CREATE POLICY "Tradies can update draft invoices" ON public.invoices FOR
UPDATE USING (
        (
            auth.uid() = tradie_id
            AND status = 'draft'
        )
        OR (
            auth.uid() = customer_id
            AND status = 'sent'
        ) -- Customer marking paid
    );
-- Invoice Items
CREATE POLICY "Participants can view items" ON public.invoice_items FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.invoices
            WHERE id = invoice_items.invoice_id
                AND (
                    customer_id = auth.uid()
                    OR tradie_id = auth.uid()
                )
        )
    );
CREATE POLICY "Tradies can manage items for draft/sent invoices" ON public.invoice_items FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM public.invoices
        WHERE id = invoice_items.invoice_id
            AND tradie_id = auth.uid()
            AND status IN ('draft', 'sent')
    )
);
-- Job Events
CREATE POLICY "Participants can view events" ON public.job_events FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.job_assignments
            WHERE job_id = job_events.job_id
                AND (
                    customer_id = auth.uid()
                    OR tradie_id = auth.uid()
                )
        )
    );
CREATE POLICY "Participants can log events" ON public.job_events FOR
INSERT WITH CHECK (auth.uid() = actor_id);
-- 5. Extend Messages Table (for Invoice Cards)
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;