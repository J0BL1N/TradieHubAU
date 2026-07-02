-- Migration: 093_trade_specific_verification.sql
-- Description: Implement database schemas, RLS policies, views, indexes, and triggers for trade-specific verification.

-- 1. Table: trade_licence_types
CREATE TABLE public.trade_licence_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state_code varchar(3) NOT NULL CHECK (state_code IN ('VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),
  regulatory_body text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(name, state_code)
);

-- 2. Table: trade_requirement_rules
CREATE TABLE public.trade_requirement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id text REFERENCES public.trades(id) ON DELETE CASCADE NOT NULL,
  state_code varchar(3) NOT NULL CHECK (state_code IN ('VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),
  licence_requirement_level text NOT NULL CHECK (licence_requirement_level IN ('required', 'conditional', 'usually_not_required')),
  required_licence_type_id uuid REFERENCES public.trade_licence_types(id) ON DELETE SET NULL,
  min_experience_years numeric DEFAULT 0 NOT NULL,
  requires_experience_evidence boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(trade_id, state_code)
);

-- 3. Table: user_trade_credentials
CREATE TABLE public.user_trade_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  licence_type_id uuid REFERENCES public.trade_licence_types(id) NOT NULL,
  licence_number text NOT NULL,
  expiry_date date NOT NULL,
  document_storage_path text NOT NULL, -- secure bucket path
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'recheck')),
  recheck_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 4. Table: user_experience_evidence
CREATE TABLE public.user_experience_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  trade_id text REFERENCES public.trades(id) ON DELETE CASCADE NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN ('certificate', 'referee_letter', 'completion_log')),
  description text,
  file_storage_path text NOT NULL, -- secure bucket path
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================
CREATE TRIGGER update_trade_licence_types_updated_at
  BEFORE UPDATE ON public.trade_licence_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trade_requirement_rules_updated_at
  BEFORE UPDATE ON public.trade_requirement_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_trade_credentials_updated_at
  BEFORE UPDATE ON public.user_trade_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_experience_evidence_updated_at
  BEFORE UPDATE ON public.user_experience_evidence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX idx_trade_licence_types_state ON public.trade_licence_types(state_code);
CREATE INDEX idx_trade_requirement_rules_trade ON public.trade_requirement_rules(trade_id);
CREATE INDEX idx_trade_requirement_rules_state ON public.trade_requirement_rules(state_code);

CREATE INDEX idx_user_trade_credentials_user ON public.user_trade_credentials(user_id);
CREATE INDEX idx_user_trade_credentials_licence_type ON public.user_trade_credentials(licence_type_id);
CREATE INDEX idx_user_trade_credentials_status ON public.user_trade_credentials(status);
CREATE INDEX idx_user_trade_credentials_expiry ON public.user_trade_credentials(expiry_date);

CREATE INDEX idx_user_experience_evidence_user ON public.user_experience_evidence(user_id);
CREATE INDEX idx_user_experience_evidence_trade ON public.user_experience_evidence(trade_id);
CREATE INDEX idx_user_experience_evidence_status ON public.user_experience_evidence(status);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE public.trade_licence_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_requirement_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trade_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_experience_evidence ENABLE ROW LEVEL SECURITY;

-- Policies: trade_licence_types (Public readable, Admin editable)
CREATE POLICY "Public read licence types"
  ON public.trade_licence_types FOR SELECT
  USING (true);

CREATE POLICY "Admin write licence types"
  ON public.trade_licence_types FOR ALL
  USING (public.is_admin(auth.uid()));

-- Policies: trade_requirement_rules (Public readable, Admin editable)
CREATE POLICY "Public read requirement rules"
  ON public.trade_requirement_rules FOR SELECT
  USING (true);

CREATE POLICY "Admin write requirement rules"
  ON public.trade_requirement_rules FOR ALL
  USING (public.is_admin(auth.uid()));

-- Policies: user_trade_credentials (User managed, Admin reviewed)
CREATE POLICY "Users can select own credentials"
  ON public.user_trade_credentials FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can insert own credentials"
  ON public.user_trade_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id AND NOT public.is_admin(auth.uid()));

CREATE POLICY "Users can update own pending credentials"
  ON public.user_trade_credentials FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Users can delete own pending credentials"
  ON public.user_trade_credentials FOR DELETE
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can manage all credentials"
  ON public.user_trade_credentials FOR ALL
  USING (public.is_admin(auth.uid()));

-- Policies: user_experience_evidence (User managed, Admin reviewed)
CREATE POLICY "Users can select own evidence"
  ON public.user_experience_evidence FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can insert own evidence"
  ON public.user_experience_evidence FOR INSERT
  WITH CHECK (auth.uid() = user_id AND NOT public.is_admin(auth.uid()));

CREATE POLICY "Users can update own pending evidence"
  ON public.user_experience_evidence FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Users can delete own pending evidence"
  ON public.user_experience_evidence FOR DELETE
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can manage all evidence"
  ON public.user_experience_evidence FOR ALL
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- Public Sanitized Views (Do not expose secure bucket storage paths)
-- ============================================================================
CREATE OR REPLACE VIEW public.public_user_credentials AS
SELECT
  id,
  user_id,
  licence_type_id,
  licence_number,
  expiry_date,
  status,
  created_at
FROM public.user_trade_credentials
WHERE status = 'approved' AND expiry_date > now();

CREATE OR REPLACE VIEW public.public_user_experience_evidence AS
SELECT
  id,
  user_id,
  trade_id,
  evidence_type,
  description,
  status,
  created_at
FROM public.user_experience_evidence
WHERE status = 'approved';

-- Grant permissions to views
GRANT SELECT ON public.public_user_credentials TO authenticated, anon;
GRANT SELECT ON public.public_user_experience_evidence TO authenticated, anon;

-- ============================================================================
-- Explicit grants/revokes
-- ============================================================================
REVOKE ALL ON public.trade_licence_types FROM PUBLIC;
REVOKE ALL ON public.trade_requirement_rules FROM PUBLIC;
REVOKE ALL ON public.user_trade_credentials FROM PUBLIC;
REVOKE ALL ON public.user_experience_evidence FROM PUBLIC;

GRANT SELECT ON public.trade_licence_types TO authenticated, anon;
GRANT SELECT ON public.trade_requirement_rules TO authenticated, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_trade_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_experience_evidence TO authenticated;

GRANT ALL ON public.trade_licence_types TO service_role;
GRANT ALL ON public.trade_requirement_rules TO service_role;
GRANT ALL ON public.user_trade_credentials TO service_role;
GRANT ALL ON public.user_experience_evidence TO service_role;

-- ============================================================================
-- Notifications Trigger for user_trade_credentials
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_notification_on_trade_credential_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_lic_name TEXT;
BEGIN
  SELECT name INTO v_lic_name FROM public.trade_licence_types WHERE id = NEW.licence_type_id;

  IF OLD.status <> NEW.status AND NEW.status = 'approved' THEN
    INSERT INTO public.notifications (
      user_id,
      event_type,
      title,
      body,
      entity_type,
      entity_id
    ) VALUES (
      NEW.user_id,
      'verification_approved',
      'Trade licence approved',
      'Your licence "' || COALESCE(v_lic_name, 'Trade Licence') || '" has been approved.',
      'verification',
      NEW.id
    );
  ELSIF OLD.status <> NEW.status AND NEW.status = 'rejected' THEN
    INSERT INTO public.notifications (
      user_id,
      event_type,
      title,
      body,
      entity_type,
      entity_id
    ) VALUES (
      NEW.user_id,
      'verification_rejected',
      'Trade licence rejected',
      'Your licence "' || COALESCE(v_lic_name, 'Trade Licence') || '" was rejected. ' || COALESCE('Reason: ' || NEW.recheck_reason, ''),
      'verification',
      NEW.id
    );
  ELSIF OLD.status <> NEW.status AND NEW.status = 'recheck' THEN
    INSERT INTO public.notifications (
      user_id,
      event_type,
      title,
      body,
      entity_type,
      entity_id
    ) VALUES (
      NEW.user_id,
      'verification_recheck_requested',
      'Trade licence recheck requested',
      'Admin requested a recheck of your licence "' || COALESCE(v_lic_name, 'Trade Licence') || '". ' || COALESCE('Reason: ' || NEW.recheck_reason, ''),
      'verification',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_notification_on_trade_credential_change
  AFTER UPDATE ON public.user_trade_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.create_notification_on_trade_credential_change();

-- ============================================================================
-- Seed data: Trade categories, licence types, and requirement rules
-- ============================================================================

-- 1. Ensure master trade categories exist in trades table
INSERT INTO public.trades (id, label, icon) VALUES
  ('electrician', 'Electrician', 'zap'),
  ('electrical_contractor', 'Electrical Contractor', 'zap'),
  ('plumber', 'Plumber', 'droplet'),
  ('gasfitter', 'Gasfitter', 'flame'),
  ('roof_plumber', 'Roof Plumber', 'home'),
  ('builder', 'Builder', 'home'),
  ('carpenter', 'Carpenter', 'hammer'),
  ('painter', 'Painter', 'brush'),
  ('tiler', 'Tiler', 'grid'),
  ('waterproofer', 'Waterproofer', 'shield'),
  ('concreter', 'Concreter', 'layers'),
  ('landscaper', 'Landscaper', 'compass'),
  ('hvac', 'HVAC / Refrigeration / Air Conditioning', 'thermometer'),
  ('pest_control', 'Pest Control', 'bug'),
  ('asbestos_removal', 'Asbestos Removal', 'shield-alert'),
  ('demolition', 'Demolition', 'trash-2'),
  ('cleaner', 'Cleaner / Pressure Washing', 'wind'),
  ('gardener', 'Gardener / Lawn Mowing', 'tree'),
  ('arborist', 'Arborist / Tree Work', 'scissors'),
  ('solar_installer', 'Solar Installer', 'sun'),
  ('security_installer', 'Security Installer / Locksmith', 'key')
ON CONFLICT (id) DO NOTHING;

-- 2. Seed basic licence types for VIC, NSW, QLD
INSERT INTO public.trade_licence_types (id, name, state_code, regulatory_body) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'A-Grade Electrician Licence', 'VIC', 'EnergySafe Victoria'),
  ('a2222222-2222-2222-2222-222222222222', 'Registered Electrical Contractor (REC)', 'VIC', 'EnergySafe Victoria'),
  ('a3333333-3333-3333-3333-333333333333', 'Licensed Plumber registration', 'VIC', 'Victorian Building Authority'),
  ('a4444444-4444-4444-4444-444444444444', 'Gasfitting Endorsement', 'VIC', 'Victorian Building Authority'),
  ('a5555555-5555-5555-5555-555555555555', 'Registered Builder (Domestic Builder)', 'VIC', 'Victorian Building Authority'),
  ('a6666666-6666-6666-6666-666666666666', 'Refrigerant Handling Licence', 'VIC', 'Australian Refrigeration Council'),
  ('a7777777-7777-7777-7777-777777777777', 'Pest Control Operator Licence', 'VIC', 'Department of Health & Human Services'),
  ('a8888888-8888-8888-8888-888888888888', 'Asbestos Removal Licence Class A/B', 'VIC', 'WorkSafe Victoria'),
  ('a9999999-9999-9999-9999-999999999999', 'Demolition Licence Class 1/2', 'VIC', 'WorkSafe Victoria'),
  ('ab111111-1111-1111-1111-111111111111', 'Clean Energy Council Accredited Installer', 'VIC', 'Clean Energy Regulator'),
  ('ab222222-2222-2222-2222-222222222222', 'Security Equipment Installer Licence', 'VIC', 'Victoria Police Licensing Services Division'),
  
  -- NSW
  ('b1111111-1111-1111-1111-111111111111', 'Electrician Contractor Licence', 'NSW', 'NSW Fair Trading'),
  ('b2222222-2222-2222-2222-222222222222', 'Plumber Contractor Licence', 'NSW', 'NSW Fair Trading'),
  ('b3333333-3333-3333-3333-b33333333333', 'Gasfitter Contractor Licence', 'NSW', 'NSW Fair Trading'),
  ('b4444444-4444-4444-4444-b44444444444', 'Builder Contractor Licence', 'NSW', 'NSW Fair Trading'),
  
  -- QLD
  ('c1111111-1111-1111-1111-111111111111', 'Electrical Work Licence', 'QLD', 'Electrical Safety Office'),
  ('c2222222-2222-2222-2222-222222222222', 'Plumbing and Drainage Licence', 'QLD', 'Queensland Building and Construction Commission'),
  ('c3333333-3333-3333-3333-c33333333333', 'Gasfitting Licence', 'QLD', 'Queensland Building and Construction Commission'),
  ('c4444444-4444-4444-4444-c44444444444', 'Builder Licence', 'QLD', 'Queensland Building and Construction Commission')
ON CONFLICT (id) DO NOTHING;

-- 3. Seed rules for VIC
INSERT INTO public.trade_requirement_rules (trade_id, state_code, licence_requirement_level, required_licence_type_id, min_experience_years) VALUES
  ('electrician', 'VIC', 'required', 'a1111111-1111-1111-1111-111111111111', 4),
  ('electrical', 'VIC', 'required', 'a1111111-1111-1111-1111-111111111111', 4),
  ('electrical_contractor', 'VIC', 'required', 'a2222222-2222-2222-2222-222222222222', 4),
  ('plumber', 'VIC', 'required', 'a3333333-3333-3333-3333-333333333333', 4),
  ('plumbing', 'VIC', 'required', 'a3333333-3333-3333-3333-333333333333', 4),
  ('gasfitter', 'VIC', 'required', 'a4444444-4444-4444-4444-444444444444', 4),
  ('builder', 'VIC', 'required', 'a5555555-5555-5555-5555-555555555555', 5),
  ('building', 'VIC', 'required', 'a5555555-5555-5555-5555-555555555555', 5),
  ('hvac', 'VIC', 'required', 'a6666666-6666-6666-6666-666666666666', 3),
  ('pest_control', 'VIC', 'required', 'a7777777-7777-7777-7777-777777777777', 2),
  ('asbestos_removal', 'VIC', 'required', 'a8888888-8888-8888-8888-888888888888', 2),
  ('demolition', 'VIC', 'required', 'a9999999-9999-9999-9999-999999999999', 3),
  ('solar_installer', 'VIC', 'required', 'ab111111-1111-1111-1111-111111111111', 4),
  ('security_installer', 'VIC', 'required', 'ab222222-2222-2222-2222-222222222222', 2),
  
  -- Conditional / Low risk trades
  ('carpenter', 'VIC', 'conditional', NULL, 3),
  ('carpentry', 'VIC', 'conditional', NULL, 3),
  ('painter', 'VIC', 'conditional', NULL, 2),
  ('painting', 'VIC', 'conditional', NULL, 2),
  ('tiler', 'VIC', 'conditional', NULL, 2),
  ('tiling', 'VIC', 'conditional', NULL, 2),
  ('waterproofer', 'VIC', 'conditional', NULL, 3),
  ('concreter', 'VIC', 'conditional', NULL, 2),
  ('landscaper', 'VIC', 'conditional', NULL, 2),
  ('handyman', 'VIC', 'usually_not_required', NULL, 1),
  ('cleaner', 'VIC', 'usually_not_required', NULL, 0),
  ('cleaning', 'VIC', 'usually_not_required', NULL, 0),
  ('gardener', 'VIC', 'usually_not_required', NULL, 0),
  ('gardening', 'VIC', 'usually_not_required', NULL, 0),
  ('arborist', 'VIC', 'conditional', NULL, 3)
ON CONFLICT (trade_id, state_code) DO NOTHING;

-- 4. Seed rules for NSW
INSERT INTO public.trade_requirement_rules (trade_id, state_code, licence_requirement_level, required_licence_type_id, min_experience_years) VALUES
  ('electrician', 'NSW', 'required', 'b1111111-1111-1111-1111-111111111111', 4),
  ('electrical', 'NSW', 'required', 'b1111111-1111-1111-1111-111111111111', 4),
  ('plumber', 'NSW', 'required', 'b2222222-2222-2222-2222-222222222222', 4),
  ('plumbing', 'NSW', 'required', 'b2222222-2222-2222-2222-222222222222', 4),
  ('gasfitter', 'NSW', 'required', 'b3333333-3333-3333-3333-b33333333333', 4),
  ('builder', 'NSW', 'required', 'b4444444-4444-4444-4444-b44444444444', 5),
  ('building', 'NSW', 'required', 'b4444444-4444-4444-4444-b44444444444', 5)
ON CONFLICT (trade_id, state_code) DO NOTHING;

-- ============================================================================
-- Database-level quote/application gating by trade licences
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_user_has_required_licences(p_user_id uuid, p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_state varchar(3);
  v_job_categories text[];
  v_category text;
  v_req_licence_id uuid;
  v_level text;
  v_has_approved_unexpired boolean;
  v_user_trades text[];
  v_hard_gated_categories text[] := ARRAY[
    'electrical', 'electrician', 'electrical_contractor',
    'plumbing', 'plumber', 'gasfitting', 'gasfitter', 'roof_plumbing',
    'building', 'builder', 'hvac', 'pest_control', 'asbestos_removal',
    'demolition', 'solar_installer', 'security_installer'
  ];
BEGIN
  -- 1. Get user state & trades
  SELECT state, trades INTO v_user_state, v_user_trades FROM public.users WHERE id = p_user_id;
  IF v_user_state IS NULL THEN
    v_user_state := 'VIC'; -- fallback
  END IF;

  -- 2. Get job categories
  SELECT categories INTO v_job_categories FROM public.jobs WHERE id = p_job_id;
  IF v_job_categories IS NULL OR array_length(v_job_categories, 1) IS NULL THEN
    RETURN true;
  END IF;

  -- 3. Loop through categories
  FOREACH v_category IN ARRAY v_job_categories LOOP
    -- Handyman block: Handyman cannot quote on hard-gated categories
    IF (v_user_trades && ARRAY['handyman']) AND (v_category = ANY(v_hard_gated_categories)) THEN
      RETURN false;
    END IF;

    -- Check if there's a rule requiring a licence
    SELECT licence_requirement_level, required_licence_type_id
    INTO v_level, v_req_licence_id
    FROM public.trade_requirement_rules
    WHERE trade_id = v_category AND state_code = v_user_state;

    IF v_level = 'required' AND v_req_licence_id IS NOT NULL THEN
      -- Check if user has an approved, unexpired credential of this type
      SELECT EXISTS (
        SELECT 1
        FROM public.user_trade_credentials
        WHERE user_id = p_user_id
          AND licence_type_id = v_req_licence_id
          AND status = 'approved'
          AND expiry_date > CURRENT_DATE
      ) INTO v_has_approved_unexpired;

      IF NOT v_has_approved_unexpired THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- Revoke and grant explicit permissions on the gating check function
REVOKE ALL ON FUNCTION public.check_user_has_required_licences(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_user_has_required_licences(uuid, uuid) TO authenticated, service_role;

-- Recreate applications insert policy to enforce trade licensing check
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
    -- Enforce the database-level trade licence gating
    AND public.check_user_has_required_licences(auth.uid(), job_id)
  );
