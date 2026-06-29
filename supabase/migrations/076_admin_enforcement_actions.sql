-- Migration: 076_admin_enforcement_actions.sql
-- Description: Implement database columns and tables to support admin-only user restrictions and enforcement action tracking.

-- 1. Alter public.users table to support restriction periods
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS application_restricted_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quote_restricted_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS account_review_hold_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS enforcement_status text DEFAULT NULL CHECK (enforcement_status IS NULL OR enforcement_status IN ('active_restrictions', 'clean'));

-- 2. Create public.admin_enforcement_actions table to track logs
CREATE TABLE IF NOT EXISTS public.admin_enforcement_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  related_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  related_dispute_id uuid REFERENCES public.job_issues(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('warning', 'verification_recheck_required', 'tradie_quote_restricted', 'tradie_application_restricted', 'account_review_hold', 'dispute_escalation_flag', 'evidence_preservation_flag', 'manual_review_note')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) > 0),
  internal_note text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'superseded')),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES public.users(id),
  resolved_at timestamptz,
  resolution_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_enforcement_target_user ON public.admin_enforcement_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_enforcement_status ON public.admin_enforcement_actions(status);

-- 3. Enable Row Level Security
ALTER TABLE public.admin_enforcement_actions ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies for admin_enforcement_actions
DROP POLICY IF EXISTS "Admins have full access to enforcement actions" ON public.admin_enforcement_actions;
CREATE POLICY "Admins have full access to enforcement actions"
  ON public.admin_enforcement_actions
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. Helper RPC to create an enforcement action
CREATE OR REPLACE FUNCTION public.create_admin_enforcement_action(
  p_target_user_id uuid,
  p_action_type text,
  p_severity text,
  p_reason text,
  p_internal_note text DEFAULT NULL,
  p_related_job_id uuid DEFAULT NULL,
  p_related_dispute_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_id uuid;
  v_result jsonb;
BEGIN
  -- Strict Admin check
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  -- Insert tracking action record
  INSERT INTO public.admin_enforcement_actions (
    target_user_id,
    related_job_id,
    related_dispute_id,
    action_type,
    severity,
    reason,
    internal_note,
    status,
    created_by,
    metadata
  )
  VALUES (
    p_target_user_id,
    p_related_job_id,
    p_related_dispute_id,
    p_action_type,
    p_severity,
    p_reason,
    p_internal_note,
    'active',
    auth.uid(),
    jsonb_build_object('expires_at', p_expires_at)
  )
  RETURNING id INTO v_action_id;

  -- Apply active restriction states
  IF p_action_type = 'tradie_quote_restricted' THEN
    UPDATE public.users
    SET quote_restricted_until = COALESCE(p_expires_at, now() + interval '99 years'),
        enforcement_status = 'active_restrictions'
    WHERE id = p_target_user_id;
  ELSIF p_action_type = 'tradie_application_restricted' THEN
    UPDATE public.users
    SET application_restricted_until = COALESCE(p_expires_at, now() + interval '99 years'),
        enforcement_status = 'active_restrictions'
    WHERE id = p_target_user_id;
  ELSIF p_action_type = 'account_review_hold' THEN
    UPDATE public.users
    SET account_review_hold_until = COALESCE(p_expires_at, now() + interval '99 years'),
        enforcement_status = 'active_restrictions'
    WHERE id = p_target_user_id;
  ELSIF p_action_type = 'verification_recheck_required' THEN
    -- Mark active verifications for recheck under chunk C schema
    UPDATE public.verifications
    SET recheck_requested_at = now(),
        recheck_reason = p_reason,
        recheck_requested_by = auth.uid()
    WHERE user_id = p_target_user_id;

    -- De-whitelist immediately
    UPDATE public.users
    SET identity_verified = false,
        tradie_verified = false,
        enforcement_status = 'active_restrictions'
    WHERE id = p_target_user_id;
  END IF;

  -- Return complete json representation
  SELECT row_to_json(aea)::jsonb INTO v_result
  FROM public.admin_enforcement_actions aea
  WHERE aea.id = v_action_id;

  RETURN v_result;
END;
$$;

-- 6. Helper RPC to resolve an active enforcement action
CREATE OR REPLACE FUNCTION public.resolve_admin_enforcement_action(
  p_action_id uuid,
  p_resolution_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id uuid;
  v_action_type text;
  v_result jsonb;
  v_has_active_quote BOOLEAN;
  v_has_active_app BOOLEAN;
  v_has_active_hold BOOLEAN;
BEGIN
  -- Strict Admin check
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  -- Resolve the action
  UPDATE public.admin_enforcement_actions
  SET status = 'resolved',
      resolved_by = auth.uid(),
      resolved_at = now(),
      resolution_note = p_resolution_note
  WHERE id = p_action_id AND status = 'active'
  RETURNING target_user_id, action_type INTO v_target_user_id, v_action_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enforcement action not found or already resolved.';
  END IF;

  -- Determine if other active restrictions remain
  SELECT EXISTS (
    SELECT 1 FROM public.admin_enforcement_actions
    WHERE target_user_id = v_target_user_id
      AND action_type = 'tradie_quote_restricted'
      AND status = 'active'
  ) INTO v_has_active_quote;

  SELECT EXISTS (
    SELECT 1 FROM public.admin_enforcement_actions
    WHERE target_user_id = v_target_user_id
      AND action_type = 'tradie_application_restricted'
      AND status = 'active'
  ) INTO v_has_active_app;

  SELECT EXISTS (
    SELECT 1 FROM public.admin_enforcement_actions
    WHERE target_user_id = v_target_user_id
      AND action_type = 'account_review_hold'
      AND status = 'active'
  ) INTO v_has_active_hold;

  -- Clear users table flags as appropriate
  IF NOT v_has_active_quote THEN
    UPDATE public.users SET quote_restricted_until = NULL WHERE id = v_target_user_id;
  END IF;

  IF NOT v_has_active_app THEN
    UPDATE public.users SET application_restricted_until = NULL WHERE id = v_target_user_id;
  END IF;

  IF NOT v_has_active_hold THEN
    UPDATE public.users SET account_review_hold_until = NULL WHERE id = v_target_user_id;
  END IF;

  IF NOT (v_has_active_quote OR v_has_active_app OR v_has_active_hold) THEN
    UPDATE public.users SET enforcement_status = NULL WHERE id = v_target_user_id;
  END IF;

  -- Return complete json representation
  SELECT row_to_json(aea)::jsonb INTO v_result
  FROM public.admin_enforcement_actions aea
  WHERE aea.id = p_action_id;

  RETURN v_result;
END;
$$;

-- 7. Helper RPC to retrieve action history
CREATE OR REPLACE FUNCTION public.get_admin_user_enforcement_history(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Strict Admin check
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(aea) ORDER BY aea.created_at DESC), '[]'::json)::jsonb INTO v_result
  FROM public.admin_enforcement_actions aea
  WHERE aea.target_user_id = p_target_user_id;

  RETURN v_result;
END;
$$;

-- 8. Revoke all public execute permissions
REVOKE ALL ON FUNCTION public.create_admin_enforcement_action(uuid, text, text, text, text, uuid, uuid, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.resolve_admin_enforcement_action(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.get_admin_user_enforcement_history(uuid) FROM public;

-- 9. Recreate applications insert policy to block restricted users
DROP POLICY IF EXISTS "Verified tradies can create applications" ON public.applications;
CREATE POLICY "Verified tradies can create applications"
  ON public.applications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('tradie', 'dual')
        AND u.identity_verified = true
        AND u.tradie_verified = true
        AND (u.application_restricted_until IS NULL OR u.application_restricted_until < now())
        AND (u.account_review_hold_until IS NULL OR u.account_review_hold_until < now())
    )
    AND customer_id = (
      SELECT j.customer_id
      FROM public.jobs j
      WHERE j.id = job_id
    )
    AND auth.uid() <> (
      SELECT j.customer_id
      FROM public.jobs j
      WHERE j.id = job_id
    )
  );

-- 10. Recreate quote line items policies to check quote and review holds
DROP POLICY IF EXISTS "Tradies can insert own quote line items" ON public.quote_line_items;
CREATE POLICY "Tradies can insert own quote line items"
  ON public.quote_line_items FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.tradie_id = auth.uid()
        AND a.status = 'pending'
    )
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.quote_restricted_until IS NULL OR u.quote_restricted_until < now())
        AND (u.account_review_hold_until IS NULL OR u.account_review_hold_until < now())
    )
  );

DROP POLICY IF EXISTS "Tradies can update own pending quote line items" ON public.quote_line_items;
CREATE POLICY "Tradies can update own pending quote line items"
  ON public.quote_line_items FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.tradie_id = auth.uid()
        AND a.status = 'pending'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.quote_restricted_until IS NULL OR u.quote_restricted_until < now())
        AND (u.account_review_hold_until IS NULL OR u.account_review_hold_until < now())
    )
  );
