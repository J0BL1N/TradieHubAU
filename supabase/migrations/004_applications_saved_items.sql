-- ============================================================================
-- Migration: 004_applications_saved_items.sql
-- Description: Adds job applications and saved items tables with RLS
-- ============================================================================

-- ============================================================================
-- TABLE: applications
-- Quote/application submitted by a tradie against a job
-- ============================================================================
CREATE TABLE IF NOT EXISTS applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tradie_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES users(id),

  -- Quote details
  estimate      NUMERIC,           -- Optional dollar estimate
  availability  TEXT,              -- When the tradie can start
  message       TEXT NOT NULL,     -- Cover message / pitch

  -- Lifecycle
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),

  -- Metadata
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One application per tradie per job
  CONSTRAINT unique_application UNIQUE (job_id, tradie_id)
);

CREATE INDEX idx_applications_job     ON applications(job_id);
CREATE INDEX idx_applications_tradie  ON applications(tradie_id);
CREATE INDEX idx_applications_status  ON applications(status);

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: saved_items
-- Generic user bookmark / favourites (jobs, tradies, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS saved_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL,   -- e.g. 'job', 'tradie', 'customer'
  item_id     UUID NOT NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One save per user per item
  CONSTRAINT unique_saved UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX idx_saved_items_user ON saved_items(user_id);
CREATE INDEX idx_saved_items_type ON saved_items(item_type, item_id);

-- ============================================================================
-- RLS: applications
-- ============================================================================
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Tradies can create their own applications
CREATE POLICY "Tradies can create applications"
  ON applications FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND tradie_id = auth.uid()
  );

-- Tradies can view their own applications
CREATE POLICY "Tradies can view own applications"
  ON applications FOR SELECT
  USING (tradie_id = auth.uid());

-- Tradies can update (withdraw) their own applications
CREATE POLICY "Tradies can update own applications"
  ON applications FOR UPDATE
  USING (tradie_id = auth.uid());

-- Job owners can view applications on their jobs
CREATE POLICY "Job owners can view applications"
  ON applications FOR SELECT
  USING (customer_id = auth.uid());

-- ============================================================================
-- RLS: saved_items
-- ============================================================================
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

-- Users can view only their own saved items
CREATE POLICY "Users can view own saved items"
  ON saved_items FOR SELECT
  USING (user_id = auth.uid());

-- Users can save items
CREATE POLICY "Users can save items"
  ON saved_items FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND user_id = auth.uid()
  );

-- Users can delete (unsave) their own saved items
CREATE POLICY "Users can unsave items"
  ON saved_items FOR DELETE
  USING (user_id = auth.uid());
