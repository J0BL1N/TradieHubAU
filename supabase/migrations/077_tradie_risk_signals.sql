-- Migration: 077_tradie_risk_signals.sql
-- Description: Create public.tradie_risk_signals table, RLS policies, and get_admin_tradie_risk_summary calculator function.

-- 1. Create the Table
CREATE TABLE IF NOT EXISTS public.tradie_risk_signals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  signal_type    text NOT NULL CHECK (signal_type IN ('verification_recheck_open', 'active_enforcement', 'dispute_opened', 'dispute_escalated', 'repeated_rejections', 'early_release_overuse', 'variation_overuse', 'manual_admin_flag', 'evidence_preservation', 'account_review_hold')),
  severity       text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source_type    text NOT NULL, -- e.g. 'manual', 'dispute', 'enforcement'
  source_id      uuid,
  related_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  reason         text NOT NULL CHECK (char_length(btrim(reason)) > 0),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'ignored')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at    timestamptz,
  resolved_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolution_note text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_risk_signals_tradie ON public.tradie_risk_signals(tradie_id);
CREATE INDEX IF NOT EXISTS idx_risk_signals_status ON public.tradie_risk_signals(status);

-- 2. Enable Row Level Security
ALTER TABLE public.tradie_risk_signals ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "Admins have full access to tradie_risk_signals" ON public.tradie_risk_signals;
CREATE POLICY "Admins have full access to tradie_risk_signals"
  ON public.tradie_risk_signals
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4. Create risk calculator RPC
CREATE OR REPLACE FUNCTION public.get_admin_tradie_risk_summary(p_tradie_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score INTEGER := 0;
  v_signal_rec RECORD;
  v_active_signal_count INTEGER := 0;
  v_high_or_critical_signal_count INTEGER := 0;
  v_open_dispute_count INTEGER := 0;
  v_active_enforcement_count INTEGER := 0;
  v_verification_recheck_count INTEGER := 0;
  v_recent_early_release_request_count INTEGER := 0;
  v_recent_variation_request_count INTEGER := 0;
  v_latest_signals jsonb;
  v_risk_level TEXT;
BEGIN
  -- Strict Admin check
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  -- Verify target user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_tradie_id) THEN
    RAISE EXCEPTION 'Tradie profile not found.';
  END IF;

  -- 1. Active signals from tradie_risk_signals
  SELECT COUNT(*) INTO v_active_signal_count
  FROM public.tradie_risk_signals
  WHERE tradie_id = p_tradie_id AND status = 'active';

  SELECT COUNT(*) INTO v_high_or_critical_signal_count
  FROM public.tradie_risk_signals
  WHERE tradie_id = p_tradie_id AND status = 'active' AND severity IN ('high', 'critical');

  FOR v_signal_rec IN 
    SELECT severity FROM public.tradie_risk_signals
    WHERE tradie_id = p_tradie_id AND status = 'active'
  LOOP
    IF v_signal_rec.severity = 'low' THEN
      v_score := v_score + 5;
    ELSIF v_signal_rec.severity = 'medium' THEN
      v_score := v_score + 15;
    ELSIF v_signal_rec.severity = 'high' THEN
      v_score := v_score + 30;
    ELSIF v_signal_rec.severity = 'critical' THEN
      v_score := v_score + 50;
    END IF;
  END LOOP;

  -- 2. Active enforcements from admin_enforcement_actions
  SELECT COUNT(*) INTO v_active_enforcement_count
  FROM public.admin_enforcement_actions
  WHERE target_user_id = p_tradie_id AND status = 'active';

  -- Holds: +40
  IF EXISTS (
    SELECT 1 FROM public.admin_enforcement_actions
    WHERE target_user_id = p_tradie_id AND status = 'active' AND action_type = 'account_review_hold'
  ) THEN
    v_score := v_score + 40;
  END IF;

  -- Quote restriction: +25
  IF EXISTS (
    SELECT 1 FROM public.admin_enforcement_actions
    WHERE target_user_id = p_tradie_id AND status = 'active' AND action_type = 'tradie_quote_restricted'
  ) THEN
    v_score := v_score + 25;
  END IF;

  -- Application restriction: +25
  IF EXISTS (
    SELECT 1 FROM public.admin_enforcement_actions
    WHERE target_user_id = p_tradie_id AND status = 'active' AND action_type = 'tradie_application_restricted'
  ) THEN
    v_score := v_score + 25;
  END IF;

  -- 3. Open Disputes: +20 each
  SELECT COUNT(*) INTO v_open_dispute_count
  FROM public.job_issues ji
  WHERE ji.status = 'open'
    AND ji.job_id IN (
      SELECT a.job_id FROM public.applications a
      WHERE a.tradie_id = p_tradie_id AND a.status = 'accepted'
    );
  v_score := v_score + (v_open_dispute_count * 20);

  -- 4. Unresolved verification rechecks: +15 each
  SELECT COUNT(*) INTO v_verification_recheck_count
  FROM public.verifications
  WHERE user_id = p_tradie_id
    AND recheck_requested_at IS NOT NULL
    AND status <> 'approved';
  v_score := v_score + (v_verification_recheck_count * 15);

  -- 5. Recent early release requests (last 60 days):
  -- 2 requests: +10, 3+ requests: +20
  SELECT COUNT(*) INTO v_recent_early_release_request_count
  FROM public.early_release_requests
  WHERE tradie_id = p_tradie_id AND requested_at >= now() - interval '60 days';

  IF v_recent_early_release_request_count = 2 THEN
    v_score := v_score + 10;
  ELSIF v_recent_early_release_request_count >= 3 THEN
    v_score := v_score + 20;
  END IF;

  -- 6. Recent variation requests (last 60 days):
  -- 2 requests: +10, 3+ requests: +20
  SELECT COUNT(*) INTO v_recent_variation_request_count
  FROM public.job_variation_requests
  WHERE tradie_id = p_tradie_id AND requested_at >= now() - interval '60 days';

  IF v_recent_variation_request_count = 2 THEN
    v_score := v_score + 10;
  ELSIF v_recent_variation_request_count >= 3 THEN
    v_score := v_score + 20;
  END IF;

  -- 7. Calculate risk level
  -- - 0–19: low
  -- - 20–49: medium
  -- - 50–79: high
  -- - 80+: critical
  IF v_score >= 80 THEN
    v_risk_level := 'critical';
  ELSIF v_score >= 50 THEN
    v_risk_level := 'high';
  ELSIF v_score >= 20 THEN
    v_risk_level := 'medium';
  ELSE
    v_risk_level := 'low';
  END IF;

  -- 8. Fetch latest 5 signals details
  SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json)::jsonb INTO v_latest_signals
  FROM (
    SELECT id, signal_type, severity, reason, status, created_at
    FROM public.tradie_risk_signals
    WHERE tradie_id = p_tradie_id
    ORDER BY created_at DESC
    LIMIT 5
  ) s;

  RETURN jsonb_build_object(
    'tradie_id', p_tradie_id,
    'risk_level', v_risk_level,
    'risk_score', v_score,
    'active_signal_count', v_active_signal_count,
    'high_or_critical_signal_count', v_high_or_critical_signal_count,
    'open_dispute_count', v_open_dispute_count,
    'active_enforcement_count', v_active_enforcement_count,
    'verification_recheck_count', v_verification_recheck_count,
    'recent_early_release_request_count', v_recent_early_release_request_count,
    'recent_variation_request_count', v_recent_variation_request_count,
    'latest_signals', v_latest_signals,
    'last_updated_at', now()
  );
END;
$$;

-- 5. Revoke all public execute permissions
REVOKE ALL ON FUNCTION public.get_admin_tradie_risk_summary(uuid) FROM public;
