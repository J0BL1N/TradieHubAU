-- Migration: 022_block_direct_client_payment_inserts.sql
-- Description: Resolve Critical Issue C-04 by dropping the direct client insert policy on public.payments. Payment records must only be created through trusted database RPC functions (like accept_quote) or backend provider integration flows.

-- 1. Drop the unsafe direct client-side insert policy
DROP POLICY IF EXISTS "Users initiate payments" ON public.payments;

-- 2. Explanatory comments:
-- Direct client-side INSERT statements on public.payments are blocked to prevent
-- malicious clients from forging payment records, choosing arbitrary amounts, or
-- blocking jobs with fake payment references.
--
-- Payment row creation is handled strictly within public.accept_quote() which
-- runs as SECURITY DEFINER and is therefore unaffected by client-side RLS rules.
--
-- Real provider payment settlement integration remains deferred to v0.2.x Real Payments Foundation.
