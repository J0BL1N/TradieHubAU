-- Migration: 013_restore_payment_ledger_if_missing.sql
-- Description: Re-create the public.payment_ledger table if missing, along with indexes, RLS enablement, and SELECT policies.

CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('charge', 'payout', 'refund', 'fee')),
  amount_cents INTEGER NOT NULL,
  stripe_transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_payment_id ON public.payment_ledger(payment_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON public.payment_ledger(transaction_type);

ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view ledger entries for own payments" ON public.payment_ledger;
CREATE POLICY "Users view ledger entries for own payments" ON public.payment_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_id
        AND (p.payer_id = auth.uid() OR p.payee_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins view all ledger entries" ON public.payment_ledger;
CREATE POLICY "Admins view all ledger entries" ON public.payment_ledger
  FOR SELECT USING (is_admin(auth.uid()));
