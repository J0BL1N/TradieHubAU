-- Migration: 003_phase3_trust_money.sql
-- Description: Adds tables for Payment (Stripe) and Identity Verification

-- 1. Update Users table for Stripe Connect
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_account_id text, -- Connected Account ID (for Tradies)
ADD COLUMN IF NOT EXISTS stripe_customer_id text, -- Customer ID (for paying Customers)
ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;

-- 2. Create Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  payer_id uuid REFERENCES users(id), -- User who pays (Customer)
  payee_id uuid REFERENCES users(id), -- User who receives (Tradie)
  amount integer NOT NULL, -- Amount in cents
  currency text DEFAULT 'aud',
  stripe_payment_intent_id text,
  status text CHECK (status IN ('pending', 'held_in_escrow', 'released', 'refunded', 'failed')),
  platform_fee integer DEFAULT 0, -- Application fee in cents
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create Verifications Table (ID Checks)
CREATE TABLE IF NOT EXISTS verifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  document_type text CHECK (document_type IN ('license', 'passport', 'other')),
  document_url text, -- Path in private 'verifications' bucket
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes text,
  submitted_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id)
);

-- 4. Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Payments
-- Users can see payments they made or received
CREATE POLICY "Users view own payments" ON payments
  FOR SELECT USING (auth.uid() = payer_id OR auth.uid() = payee_id);

-- Only system/admin typically creates payments via API, but for MVP let users initiate
CREATE POLICY "Users initiate payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = payer_id);

-- 6. RLS Policies for Verifications
-- Users can see their own verifications
CREATE POLICY "Users view own verifications" ON verifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can submit verifications
CREATE POLICY "Users submit verifications" ON verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. Add trigger for updated_at on payments
CREATE TRIGGER set_payments_timestamp
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
