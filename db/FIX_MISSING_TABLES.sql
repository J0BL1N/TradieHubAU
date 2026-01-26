-- FIX: Run this in Supabase SQL Editor to create missing tables
-- Source: migrations_codex.sql
-- 1. Conversation Jobs Mapping (Fixes 404 error)
CREATE TABLE IF NOT EXISTS public.conversation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(conversation_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_jobs_conv ON public.conversation_jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_jobs_job ON public.conversation_jobs(job_id);
-- Enable RLS for conversation_jobs
ALTER TABLE public.conversation_jobs ENABLE ROW LEVEL SECURITY;
-- Policies for conversation_jobs
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
-- 2. Job Variations (Missing table)
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
ALTER TABLE public.job_variations ENABLE ROW LEVEL SECURITY;
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
-- 3. Disputes (Missing table)
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES public.users(id),
    against_party UUID NOT NULL REFERENCES public.users(id),
    reason TEXT NOT NULL,
    description TEXT,
    evidence_urls TEXT [],
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
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
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
-- 4. Update Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now();
RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_job_variations_updated_at BEFORE
UPDATE ON public.job_variations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_disputes_updated_at BEFORE
UPDATE ON public.disputes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();