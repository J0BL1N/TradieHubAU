-- ============================================================================
-- TradieHub Database Schema - Initial Migration
-- Supabase PostgreSQL
-- Version: 1.0.0
-- ============================================================================

-- UUID generation helper used below:
-- gen_random_uuid() comes from pgcrypto (Supabase supports this)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- (Optional) keep uuid-ossp if you ever want uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Trigger helper: keep updated_at current on updates
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE: users
-- Core user profiles for customers, tradies, and dual-role users
-- ============================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'tradie', 'dual')),
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,

  -- Location
  suburb TEXT,
  state TEXT,
  postcode TEXT,

  -- Tradie-specific fields
  trades TEXT[], -- Array of trade IDs from trades table
  abn TEXT,
  license_number TEXT,
  verified BOOLEAN DEFAULT FALSE,

  -- Privacy settings
  show_location BOOLEAN DEFAULT TRUE,
  address_rule TEXT DEFAULT 'afterAccepted'
    CHECK (address_rule IN ('never', 'afterAccepted', 'afterJobStarts')),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_trades ON users USING GIN(trades);
CREATE INDEX idx_users_state ON users(state);
CREATE INDEX idx_users_verified ON users(verified) WHERE verified = TRUE;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: trades
-- Master list of trade categories
-- ============================================================================
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT, -- Feather icon name
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed trade categories
INSERT INTO trades (id, label, icon) VALUES
  ('electrical', 'Electrical', 'zap'),
  ('plumbing', 'Plumbing', 'droplet'),
  ('carpentry', 'Carpentry', 'box'),
  ('painting', 'Painting', 'brush'),
  ('tiling', 'Tiling', 'grid'),
  ('building', 'Building', 'home'),
  ('gardening', 'Gardening', 'tree'),
  ('cleaning', 'Cleaning', 'wind'),
  ('handyman', 'Handyman', 'tool'),
  ('other', 'Other', 'more-horizontal');

-- ============================================================================
-- TABLE: jobs
-- Job listings posted by customers
-- ============================================================================
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Job details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  categories TEXT[] NOT NULL, -- Trade categories (references trades.id)

  -- Location
  location TEXT NOT NULL,
  state TEXT NOT NULL,

  -- Budget
  budget_min INTEGER,
  budget_max INTEGER,

  -- Timeline
  timeline TEXT,
  urgency TEXT CHECK (urgency IN ('urgent', 'week', 'flexible')),
  type TEXT CHECK (type IN ('one-off', 'contract', 'ongoing')),

  -- Status
  status TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  quotes_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_state ON jobs(state);
CREATE INDEX idx_jobs_categories ON jobs USING GIN(categories);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_urgency ON jobs(urgency) WHERE status = 'open';

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: conversations
-- Message threads between two users
-- ============================================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Job context (optional)
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  job_title TEXT, -- Denormalized for performance

  -- Last message cache (for conversation list)
  last_message_text TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_from UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Optional: prevent self-conversations
  CONSTRAINT conversations_not_self CHECK (user1_id <> user2_id)
);

-- ✅ Enforce "unique conversation regardless of user order" using a UNIQUE INDEX on expressions
CREATE UNIQUE INDEX conversations_unique_pair
ON conversations (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));

-- Indexes
CREATE INDEX idx_conversations_user1 ON conversations(user1_id);
CREATE INDEX idx_conversations_user2 ON conversations(user2_id);
CREATE INDEX idx_conversations_job_id ON conversations(job_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC NULLS LAST);

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: messages
-- Individual messages within conversations
-- ============================================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Content
  text TEXT NOT NULL,

  -- Read status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_unread ON messages(conversation_id, read) WHERE NOT read;

CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update conversation last_message cache
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    last_message_text = NEW.text,
    last_message_at = NEW.created_at,
    last_message_from = NEW.sender_id
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- ============================================================================
-- TABLE: reviews
-- Double-blind mutual reviews between users on completed jobs
-- ============================================================================
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Review content
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT,

  -- Double-blind unlock logic
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  unlocked BOOLEAN DEFAULT FALSE,
  unlocked_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one review per person per job
  CONSTRAINT unique_review UNIQUE (job_id, reviewer_id, reviewee_id)
);

-- Indexes
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX idx_reviews_job ON reviews(job_id);
CREATE INDEX idx_reviews_unlocked ON reviews(unlocked, unlocked_at);

CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to unlock reviews when both parties have submitted
CREATE OR REPLACE FUNCTION check_and_unlock_reviews()
RETURNS TRIGGER AS $$
DECLARE
  counterpart_review_id UUID;
BEGIN
  -- Find the matching review from the other person
  SELECT id INTO counterpart_review_id
  FROM reviews
  WHERE job_id = NEW.job_id
    AND reviewer_id = NEW.reviewee_id
    AND reviewee_id = NEW.reviewer_id
    AND id <> NEW.id;

  -- If both reviews exist, unlock them
  IF counterpart_review_id IS NOT NULL THEN
    UPDATE reviews
    SET unlocked = TRUE, unlocked_at = NOW()
    WHERE id IN (NEW.id, counterpart_review_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER unlock_reviews_on_submit
  AFTER INSERT ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION check_and_unlock_reviews();

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next step: Row Level Security policies
