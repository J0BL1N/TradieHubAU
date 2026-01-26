-- ============================================================================
-- MIGRATION: Job Variations, Disputes, and Escrow Flow
-- ============================================================================
-- 1. Job Variations (Change Orders)
CREATE TABLE IF NOT EXISTS public.job_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    tradie_id UUID NOT NULL REFERENCES public.users(id),
    customer_id UUID NOT NULL REFERENCES public.users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    time_impact_days INT,
    status TEXT NOT NULL DEFAULT 'pending_customer' CHECK (
        status IN (
            'pending_customer',
            'approved',
            'declined',
            'cancelled'
        )
    ),
    created_at TIMESTAMPTZ DEFAULT now(),
    decided_at TIMESTAMPTZ,
    decision_reason TEXT
);
-- 2. Disputes
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES public.users(id),
    against_party UUID NOT NULL REFERENCES public.users(id),
    reason TEXT NOT NULL CHECK (
        reason IN (
            'tradie_abandoned',
            'job_not_feasible',
            'variation_disagreement',
            'scope_disagreement',
            'quality_issue',
            'payment_release_issue'
        )
    ),
    description TEXT NOT NULL,
    evidence_urls TEXT [],
    status TEXT NOT NULL DEFAULT 'open' CHECK (
        status IN (
            'open',
            'under_review',
            'resolved_refund',
            'resolved_partial',
            'resolved_release',
            'closed'
        )
    ),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);
-- 3. Conversation Jobs (Sidebar Context)
CREATE TABLE IF NOT EXISTS public.conversation_jobs (
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (conversation_id, job_id)
);
-- 4. Update Invoices Table (New columns & Check Constraint)
-- Add columns for approval flow
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
-- Update status check constraint to support new statuses
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices
ADD CONSTRAINT invoices_status_check CHECK (
        status IN (
            'draft',
            'sent',
            'submitted',
            'approved',
            'paid',
            'disputed',
            'void'
        )
    );
-- 5. Update Job Assignments (Status Check)
ALTER TABLE public.job_assignments DROP CONSTRAINT IF EXISTS job_assignments_status_check;
ALTER TABLE public.job_assignments
ADD CONSTRAINT job_assignments_status_check CHECK (
        status IN (
            'active',
            'paused_pending_resolution',
            'completed',
            'cancelled',
            'disputed'
        )
    );
-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_job_variations_job_id ON public.job_variations(job_id);
CREATE INDEX IF NOT EXISTS idx_job_variations_status ON public.job_variations(status);
CREATE INDEX IF NOT EXISTS idx_disputes_job_id ON public.disputes(job_id);
-- 7. RLS Policies
-- Enable RLS
ALTER TABLE public.job_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_jobs ENABLE ROW LEVEL SECURITY;
-- Job Variations Policies
CREATE POLICY "Participants can view variations" ON public.job_variations FOR
SELECT USING (
        auth.uid() = customer_id
        OR auth.uid() = tradie_id
    );
CREATE POLICY "Tradies can request variations" ON public.job_variations FOR
INSERT WITH CHECK (auth.uid() = tradie_id);
CREATE POLICY "Participants can update variations" ON public.job_variations FOR
UPDATE USING (
        auth.uid() = customer_id
        OR auth.uid() = tradie_id
    );
-- Disputes Policies
CREATE POLICY "Participants can view disputes" ON public.disputes FOR
SELECT USING (
        auth.uid() = opened_by
        OR auth.uid() = against_party
    );
CREATE POLICY "Participants can open disputes" ON public.disputes FOR
INSERT WITH CHECK (auth.uid() = opened_by);
-- Conversation Jobs Policies
CREATE POLICY "Chat participants can view context" ON public.conversation_jobs FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.conversation_participants
            WHERE conversation_id = conversation_jobs.conversation_id
                AND user_id = auth.uid()
        )
    );
CREATE POLICY "System can link jobs" ON public.conversation_jobs FOR
INSERT WITH CHECK (true);
-- Update Invoice Policies (Allow customer approval)
DROP POLICY IF EXISTS "Customer can update invoice status" ON public.invoices;
CREATE POLICY "Customer can approve invoices" ON public.invoices FOR
UPDATE USING (
        auth.uid() = customer_id
        AND status = 'submitted'
    );
-- Helper policy for tradie submitting
CREATE POLICY "Tradie can submit invoices" ON public.invoices FOR
UPDATE USING (
        auth.uid() = tradie_id
        AND status = 'draft'
    );