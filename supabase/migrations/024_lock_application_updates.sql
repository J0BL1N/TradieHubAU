-- Migration: 024_lock_application_updates.sql
-- Description: Resolve High Issue H-02 by restricting direct client UPDATE access to public.applications. 
-- Allows only the owning tradie to withdraw their own pending application, and enforces that no other columns are altered during withdrawal.

-- 1. Drop the old wide update policy
DROP POLICY IF EXISTS "Tradies can update own applications" ON public.applications;

-- 2. Create the replacement secure update policy
-- Restricts update visibility to own pending applications, and requires the new status to be 'withdrawn'
CREATE POLICY "Tradies can withdraw own applications"
  ON public.applications
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    status = 'withdrawn'
  );

-- 3. Create a BEFORE UPDATE trigger function to enforce column immutability during client updates
CREATE OR REPLACE FUNCTION public.protect_application_updates()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Superuser/postgres bypass (e.g., updates from SECURITY DEFINER functions like accept_quote)
  -- Or platform administrators bypass
  IF current_user = 'postgres' OR is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Ensure the client is the owner of the application
  IF auth.uid() IS DISTINCT FROM OLD.tradie_id THEN
    RAISE EXCEPTION 'Unauthorized to update this application.';
  END IF;

  -- Ensure status changes only from pending to withdrawn
  IF OLD.status IS DISTINCT FROM 'pending' OR NEW.status IS DISTINCT FROM 'withdrawn' THEN
    RAISE EXCEPTION 'Invalid status transition. Tradies can only withdraw pending applications.';
  END IF;

  -- Enforce that all other fields remain unchanged
  IF NEW.id IS DISTINCT FROM OLD.id OR
     NEW.job_id IS DISTINCT FROM OLD.job_id OR
     NEW.tradie_id IS DISTINCT FROM OLD.tradie_id OR
     NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
     (NEW.estimate IS DISTINCT FROM OLD.estimate) OR
     (NEW.availability IS DISTINCT FROM OLD.availability) OR
     (NEW.message IS DISTINCT FROM OLD.message) OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot modify immutable application fields upon withdrawal.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create the trigger on public.applications
DROP TRIGGER IF EXISTS protect_application_updates_trigger ON public.applications;
CREATE TRIGGER protect_application_updates_trigger
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_application_updates();

-- 5. Explanatory comments
COMMENT ON COLUMN public.applications.status IS 'Lifecycle status of the quote/application. Direct client updates are restricted to setting status = withdrawn on own pending records.';
COMMENT ON FUNCTION public.protect_application_updates() IS 'Trigger function enforcing that client-side updates can only withdraw pending applications and cannot modify immutable details.';
