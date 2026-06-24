-- Migration: 030_lock_variation_writes.sql
-- Description: Resolve Medium Issue M-02.
-- Direct client INSERT/UPDATE on public.variations is locked down.
-- All variation workflow (request, approve, reject, fund) must go through
-- the validated SECURITY DEFINER RPCs: submit_variation_request,
-- approve_variation, reject_variation, simulate_variation_funding.
-- Only one pending variation per job/application contract is permitted.

-- Drop direct client INSERT policy (bypassed job-state and amount validation)
DROP POLICY IF EXISTS "Tradies request variations for own jobs" ON public.variations;

-- Drop direct client UPDATE policy (no column or status-transition guard)
DROP POLICY IF EXISTS "Customers update variations for own jobs" ON public.variations;

-- Prevent duplicate pending variations per job/application contract
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_variation_per_contract
  ON public.variations (job_id, application_id)
  WHERE status = 'pending';
