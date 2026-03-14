-- Migration V2: Active Sessions & Tracking Rules

ALTER TABLE tracked_activities
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS matter VARCHAR(255);

ALTER TABLE manual_entries
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

CREATE TABLE IF NOT EXISTS tracking_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  matter VARCHAR(255),
  rule_type VARCHAR(20) CHECK (rule_type IN ('domain', 'app_name', 'window_title', 'file_extension')),
  pattern VARCHAR(255) NOT NULL,
  match_type VARCHAR(10) DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'starts_with')),
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  matter VARCHAR(255),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

ALTER TABLE bill_line_items
  ADD COLUMN IF NOT EXISTS source VARCHAR(10) CHECK (source IN ('manual', 'tracked'));
