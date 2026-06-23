-- Migration: 019_protect_user_fields_trigger.sql
-- Description: Create BEFORE INSERT OR UPDATE trigger on public.users to protect security-sensitive, admin-only, system, and payment provider columns from unauthorized updates by ordinary authenticated users, while preserving legitimate admin/service-role updates and user profile edits.

-- 1. Redefine the protect_user_fields trigger function with comprehensive checks
CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only restrict if the query comes from the client API (auth.uid() is not null)
  -- Background system tasks and service-role calls (which have auth.uid() as NULL) are allowed to bypass these restrictions.
  IF auth.uid() IS NOT NULL THEN
    -- If caller is not a staff administrator, enforce column protection
    IF NOT is_admin(auth.uid()) THEN
      
      -- On INSERT:
      IF TG_OP = 'INSERT' THEN
        -- Prevent setting admin status or verification flags directly on signup
        IF NEW.verified IS TRUE OR 
           NEW.identity_verified IS TRUE OR 
           NEW.tradie_verified IS TRUE OR 
           NEW.is_admin IS TRUE THEN
          RAISE EXCEPTION 'Only staff administrators can grant verification status or admin permissions.';
        END IF;

        -- Prevent signing up with a tradie or dual role directly
        IF NEW.role IN ('tradie', 'dual') THEN
          RAISE EXCEPTION 'Direct signup as a tradie is blocked. Submit credentials on the profile tab.';
        END IF;

        -- Prevent setting Stripe/payment provider identifiers directly
        IF NEW.stripe_account_id IS NOT NULL OR 
           NEW.stripe_customer_id IS NOT NULL THEN
          RAISE EXCEPTION 'Payment provider identifiers cannot be set directly.';
        END IF;

      -- On UPDATE:
      ELSIF TG_OP = 'UPDATE' THEN
        -- Prevent modifying verification flags or admin permissions
        IF NEW.verified IS DISTINCT FROM OLD.verified OR 
           NEW.identity_verified IS DISTINCT FROM OLD.identity_verified OR 
           NEW.tradie_verified IS DISTINCT FROM OLD.tradie_verified OR 
           NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
          RAISE EXCEPTION 'Only staff administrators can modify verification flags or administrative status.';
        END IF;

        -- Prevent modifying the user role directly
        IF NEW.role IS DISTINCT FROM OLD.role THEN
          RAISE EXCEPTION 'Only staff administrators can modify user roles.';
        END IF;

        -- Prevent modifying payment provider identifiers directly
        IF NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id OR 
           NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
          RAISE EXCEPTION 'Only staff administrators or system integration paths can modify payment provider identifiers.';
        END IF;

        -- Prevent changing the email directly (must go through Supabase Auth lifecycle)
        IF NEW.email IS DISTINCT FROM OLD.email THEN
          RAISE EXCEPTION 'Email updates must be initiated via account settings.';
        END IF;

        -- Prevent changing metadata fields
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'Metadata fields like created_at are read-only.';
        END IF;

        -- DB Gating: Prevent regular users from modifying ABN, Licence Number, or Trades 
        -- if they are already whitelisted OR if they currently have a pending tradie verification file.
        IF OLD.tradie_verified IS TRUE OR EXISTS (
          SELECT 1 FROM public.verifications 
          WHERE user_id = auth.uid() 
            AND document_type IN ('contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential')
            AND status = 'pending'
        ) THEN
          IF NEW.abn IS DISTINCT FROM OLD.abn OR 
             NEW.license_number IS DISTINCT FROM OLD.license_number OR 
             NEW.trades IS DISTINCT FROM OLD.trades THEN
            RAISE EXCEPTION 'Your ABN, licence ID, and trade category selections are locked while your tradie application is pending or approved.';
          END IF;
        END IF;

      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop the trigger if it already exists to ensure idempotency
DROP TRIGGER IF EXISTS protect_user_fields_trigger ON public.users;

-- 3. Attach the trigger as a BEFORE INSERT OR UPDATE trigger on public.users
CREATE TRIGGER protect_user_fields_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_fields();
