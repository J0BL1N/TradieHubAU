-- ============================================================================
-- Row-Level Security (RLS) Policies
-- Supabase PostgreSQL
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Public can view basic user info (for browse pages and profiles)
CREATE POLICY "Public can view user profiles"
  ON users FOR SELECT
  USING (TRUE);

-- Authenticated users can create their profile
CREATE POLICY "Authenticated users can create profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id AND auth.role() = 'authenticated');

-- ============================================================================
-- TRADES TABLE POLICIES
-- ============================================================================

-- Everyone can view trades (read-only reference data)
CREATE POLICY "Everyone can view trades"
  ON trades FOR SELECT
  USING (TRUE);

-- ============================================================================
-- JOBS TABLE POLICIES
-- ============================================================================

-- Anyone can view open jobs
CREATE POLICY "Anyone can view open jobs"
  ON jobs FOR SELECT
  USING (status = 'open' OR customer_id = auth.uid());

-- Job owner can view their jobs (all statuses)
CREATE POLICY "Owner can view own jobs"
  ON jobs FOR SELECT
  USING (customer_id = auth.uid());

-- Authenticated users can create jobs
CREATE POLICY "Authenticated users can create jobs"
  ON jobs FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' 
    AND customer_id = auth.uid()
  );

-- Only job owner can update jobs
CREATE POLICY "Owner can update jobs"
  ON jobs FOR UPDATE
  USING (customer_id = auth.uid());

-- Only job owner can delete jobs
CREATE POLICY "Owner can delete jobs"
  ON jobs FOR DELETE
  USING (customer_id = auth.uid());

-- ============================================================================
-- CONVERSATIONS TABLE POLICIES
-- ============================================================================

-- Users can view conversations they're part of
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (
    auth.uid() = user1_id 
    OR auth.uid() = user2_id
  );

-- Users can create conversations they're part of
CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (auth.uid() = user1_id OR auth.uid() = user2_id)
  );

-- Users can update conversations they're part of
CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (
    auth.uid() = user1_id 
    OR auth.uid() = user2_id
  );

-- ============================================================================
-- MESSAGES TABLE POLICIES
-- ============================================================================

-- Users can view messages in their conversations
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id
        AND (user1_id = auth.uid() OR user2_id = auth.uid())
    )
  );

-- Users can send messages in their conversations
CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id
        AND (user1_id = auth.uid() OR user2_id = auth.uid())
    )
  );

-- Users can update messages they sent (e.g., mark as read)
CREATE POLICY "Users can update own messages"
  ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id
        AND (user1_id = auth.uid() OR user2_id = auth.uid())
    )
  );

-- ============================================================================
-- REVIEWS TABLE POLICIES
-- ============================================================================

-- Users can view reviews where they are the reviewer or reviewee
CREATE POLICY "Users can view own reviews"
  ON reviews FOR SELECT
  USING (
    reviewer_id = auth.uid() 
    OR reviewee_id = auth.uid()
  );

-- Users can view unlocked reviews for any user (public display)
CREATE POLICY "Public can view unlocked reviews"
  ON reviews FOR SELECT
  USING (unlocked = TRUE);

-- Users can create reviews where they are the reviewer
CREATE POLICY "Users can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND reviewer_id = auth.uid()
  );

-- Users cannot update reviews (immutable once submitted)
-- No update policy = no updates allowed

-- Users cannot delete reviews
-- No delete policy = no deletes allowed

-- ============================================================================
-- RLS Setup Complete
-- ============================================================================
