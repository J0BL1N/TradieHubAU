-- MODIFIED SCHEMAS & POLICIES FOR CODEX PASS
-- Targets: FAIL A, B, G, H
-- 1. EXTEND INVOICES STATUS
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices
ADD CONSTRAINT invoices_status_check CHECK (
        status IN ('draft', 'submitted', 'approved', 'disputed')
    );
-- 2. CREATE CONVERSATION_JOBS MAPPING (Target FAIL H)
CREATE TABLE IF NOT EXISTS public.conversation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(conversation_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_jobs_conv ON public.conversation_jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_jobs_job ON public.conversation_jobs(job_id);
-- 3. CREATE JOB_VARIATIONS (Target FAIL E)
CREATE TABLE IF NOT EXISTS public.job_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    tradie_id UUID NOT NULL REFERENCES public.users(id),
    customer_id UUID NOT NULL REFERENCES public.users(id),
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending_customer' CHECK (
        status IN (
            'pending_customer',
            'approved',
            'declined',
            'cancelled'
        )
    ),
    decision_reason TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
-- 4. CREATE DISPUTES (Target FAIL G)
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES public.users(id),
    against_party UUID NOT NULL REFERENCES public.users(id),
    reason TEXT NOT NULL,
    description TEXT,
    evidence_urls TEXT [],
    -- Array of data URLs or storage paths
    status TEXT NOT NULL DEFAULT 'open' CHECK (
        status IN (
            'open',
            'resolving',
            'resolved_refunded',
            'resolved_released'
        )
    ),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
-- 5. GRANULAR RLS POLICIES (Target FAIL B)
-- Enable RLS
ALTER TABLE public.conversation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
-- CLEANUP OLD POLICIES (to re-apply strictly)
DROP POLICY IF EXISTS "Participants can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Tradies can create invoices for their assigned jobs" ON public.invoices;
DROP POLICY IF EXISTS "Tradies can update draft invoices" ON public.invoices;
DROP POLICY IF EXISTS "Participants can view items" ON public.invoice_items;
DROP POLICY IF EXISTS "Tradies can manage items for draft/sent invoices" ON public.invoice_items;
-- INVOICES: STRICT
CREATE POLICY "Participant SELECT invoices" ON public.invoices FOR
SELECT USING (
        auth.uid() = customer_id
        OR auth.uid() = tradie_id
    );
CREATE POLICY "Tradie INSERT invoices" ON public.invoices FOR
INSERT WITH CHECK (
        auth.uid() = tradie_id
        AND EXISTS (
            SELECT 1
            FROM public.job_assignments
            WHERE job_id = invoices.job_id
                AND tradie_id = auth.uid()
        )
    );
CREATE POLICY "Tradie UPDATE draft invoices" ON public.invoices FOR
UPDATE USING (
        auth.uid() = tradie_id
        AND status = 'draft'
    ) WITH CHECK (status IN ('draft', 'submitted'));
CREATE POLICY "Customer APPROVE invoices" ON public.invoices FOR
UPDATE USING (
        auth.uid() = customer_id
        AND status = 'submitted'
    ) WITH CHECK (status = 'approved');
-- INVOICE_ITEMS: STRICT
CREATE POLICY "Participant SELECT items" ON public.invoice_items FOR
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
CREATE POLICY "Tradie MANAGE items in draft" ON public.invoice_items FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM public.invoices
        WHERE id = invoice_items.invoice_id
            AND tradie_id = auth.uid()
            AND status = 'draft'
    )
);
-- VARIATIONS: STRICT
CREATE POLICY "Participant SELECT variations" ON public.job_variations FOR
SELECT USING (
        auth.uid() = customer_id
        OR auth.uid() = tradie_id
    );
CREATE POLICY "Tradie INSERT variations" ON public.job_variations FOR
INSERT WITH CHECK (auth.uid() = tradie_id);
CREATE POLICY "Tradie CANCEL variations" ON public.job_variations FOR
UPDATE USING (
        auth.uid() = tradie_id
        AND status = 'pending_customer'
    ) WITH CHECK (status = 'cancelled');
CREATE POLICY "Customer DECIDE variations" ON public.job_variations FOR
UPDATE USING (
        auth.uid() = customer_id
        AND status = 'pending_customer'
    ) WITH CHECK (status IN ('approved', 'declined'));
-- DISPUTES: STRICT
CREATE POLICY "Participant SELECT disputes" ON public.disputes FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.job_assignments
            WHERE job_id = disputes.job_id
                AND (
                    customer_id = auth.uid()
                    OR tradie_id = auth.uid()
                )
        )
    );
CREATE POLICY "Participant INSERT disputes" ON public.disputes FOR
INSERT WITH CHECK (auth.uid() = opened_by);
-- CONVERSATION_JOBS: STRICT
CREATE POLICY "Participant SELECT mapping" ON public.conversation_jobs FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.conversations
            WHERE id = conversation_jobs.conversation_id
                AND (
                    user1_id = auth.uid()
                    OR user2_id = auth.uid()
                )
        )
    );
CREATE POLICY "System INSERT mapping" ON public.conversation_jobs FOR
INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.conversations
            WHERE id = conversation_id
                AND (
                    user1_id = auth.uid()
                    OR user2_id = auth.uid()
                )
        )
    );
-- 6. UPDATED_AT TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now();
RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_job_variations_updated_at BEFORE
UPDATE ON public.job_variations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_disputes_updated_at BEFORE
UPDATE ON public.disputes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE
UPDATE ON public.invoices FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_job_assignments_updated_at BEFORE
UPDATE ON public.job_assignments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();