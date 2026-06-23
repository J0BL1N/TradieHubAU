-- Migration: 020_fix_proof_dispute_rls_shadowing.sql
-- Description: Resolve Critical Issue C-02 by replacing SELECT policies on job_completion_proofs and job_issues with aliased table queries that eliminate outer-column shadowing.

-- ============================================================================
-- 1. Redefine SELECT policy on public.job_completion_proofs
-- ============================================================================
-- Shadowing bug context: The original policy used "WHERE job_id = job_id" in a subquery on payments.
-- Since payments has a job_id column, PostgreSQL evaluated it as "payments.job_id = payments.job_id",
-- which is always true. This allowed any user with at least one payment record to read any job completion proof.
-- Resolving this requires explicit table aliases and referencing the outer table column explicitly.

DROP POLICY IF EXISTS "Users view completion proofs for own jobs" ON public.job_completion_proofs;

CREATE POLICY "Users view completion proofs for own jobs" ON public.job_completion_proofs
  FOR SELECT USING (
    auth.uid() IN (
      -- Customer who owns the job
      SELECT j.customer_id 
      FROM public.jobs j 
      WHERE j.id = job_completion_proofs.job_id
      
      UNION
      
      -- Contracted tradie (payee) on the job payment
      SELECT p.payee_id 
      FROM public.payments p 
      WHERE p.job_id = job_completion_proofs.job_id
    )
  );

-- ============================================================================
-- 2. Redefine SELECT policy on public.job_issues
-- ============================================================================
-- Shadowing bug context: Same as above. Unqualified "job_id = job_id" inside the payments subquery
-- evaluated to true for every row. Re-defined here to use explicit table aliases and qualifiers.

DROP POLICY IF EXISTS "Users view issues for own jobs" ON public.job_issues;

CREATE POLICY "Users view issues for own jobs" ON public.job_issues
  FOR SELECT USING (
    auth.uid() IN (
      -- Customer who owns the job
      SELECT j.customer_id 
      FROM public.jobs j 
      WHERE j.id = job_issues.job_id
      
      UNION
      
      -- Contracted tradie (payee) on the job payment
      SELECT p.payee_id 
      FROM public.payments p 
      WHERE p.job_id = job_issues.job_id
    )
  );

-- ============================================================================
-- 3. SQL Regression Test Cases Reference
-- ============================================================================
-- The following cases describe the expected RLS behavior:
--
-- Case A: Job Owner (Customer)
--   - SELECT from job_completion_proofs where job_id matches a job where customer_id = auth.uid()
--   - Result: ALLOWED
--
-- Case B: Contracted Tradie (Payee)
--   - SELECT from job_completion_proofs where job_id matches a job where payments payee_id = auth.uid()
--   - Result: ALLOWED
--
-- Case C: Unrelated Tradie (Wrong Payee)
--   - SELECT from job_completion_proofs where job_id matches a job where auth.uid() has no payments row
--   - Result: BLOCKED
--
-- Case D: Unrelated Customer (Wrong Owner)
--   - SELECT from job_completion_proofs where job_id matches a job where customer_id <> auth.uid()
--   - Result: BLOCKED
--
-- Case E: Staff Administrator (Admin Override)
--   - Handled separately by "Admins view all completion proofs" and "Admins view all job issues" policies.
--   - Result: ALLOWED
