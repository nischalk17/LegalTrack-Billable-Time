-- ============================================================
-- Billable Time Tracker - PostgreSQL Schema
-- ============================================================

-- Enable UUID and Pgcrypto extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS TABLE
-- Basic ownership + JWT auth
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRACKED ACTIVITIES TABLE
-- Raw events from browser extension + desktop tracker
-- ============================================================
CREATE TABLE IF NOT EXISTS tracked_activities (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type     VARCHAR(20) NOT NULL CHECK (source_type IN ('browser', 'desktop')),
  app_name        VARCHAR(255),           -- e.g. "Chrome", "Microsoft Word"
  window_title    TEXT,                   -- e.g. "Westlaw - Search Results"
  domain          VARCHAR(255),           -- e.g. "westlaw.com" (browser only)
  file_name       VARCHAR(500),           -- e.g. "Motion_Draft_v2.docx" (desktop)
  url             TEXT,                   -- full URL (browser only)
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds >= 0),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracked_activities_user_id ON tracked_activities(user_id);
CREATE INDEX idx_tracked_activities_start_time ON tracked_activities(start_time DESC);
CREATE INDEX idx_tracked_activities_source_type ON tracked_activities(source_type);

-- ============================================================
-- MANUAL TIME ENTRIES TABLE
-- Full CRUD by user
-- ============================================================
CREATE TABLE IF NOT EXISTS manual_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client          VARCHAR(255) NOT NULL,
  matter          VARCHAR(255),
  description     TEXT NOT NULL,
  date            DATE NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  source_type     VARCHAR(50) DEFAULT 'manual' CHECK (
                    source_type IN ('manual', 'browser', 'desktop', 'suggestion')
                  ),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_manual_entries_user_id ON manual_entries(user_id);
CREATE INDEX idx_manual_entries_date ON manual_entries(date DESC);
CREATE INDEX idx_manual_entries_client ON manual_entries(client);

-- ============================================================
-- BILLABLE SUGGESTIONS TABLE
-- Auto-generated from tracked_activities
-- ============================================================
CREATE TABLE IF NOT EXISTS billable_suggestions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id     UUID REFERENCES tracked_activities(id) ON DELETE SET NULL,
  description     TEXT NOT NULL,          -- e.g. "Legal Research on Westlaw"
  category        VARCHAR(100) NOT NULL,  -- e.g. "legal_research", "drafting"
  app_name        VARCHAR(255),
  domain          VARCHAR(255),
  duration_minutes INT NOT NULL,
  date            DATE NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending' CHECK (
                    status IN ('pending', 'accepted', 'dismissed')
                  ),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_billable_suggestions_user_id ON billable_suggestions(user_id);
CREATE INDEX idx_billable_suggestions_status ON billable_suggestions(status);
CREATE INDEX idx_billable_suggestions_date ON billable_suggestions(date DESC);

-- ============================================================
-- TRIGGER: auto-update updated_at columns
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_manual_entries_updated_at
  BEFORE UPDATE ON manual_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED: Demo user (password: "demo1234")
-- Using pgcrypto crypt() for hashing
-- ============================================================
INSERT INTO users (email, name, password_hash) VALUES (
  'demo@legaltrack.com',
  'Demo Lawyer',
  crypt('demo1234', gen_salt('bf'))
) ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- CLIENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  pan_number VARCHAR(20),
  default_hourly_rate INT NOT NULL DEFAULT 5000,
  is_vat_applicable BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Modify manual_entries
ALTER TABLE manual_entries ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION lookup_client_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client IS NOT NULL THEN
    NEW.client_id := (SELECT id FROM clients WHERE name = NEW.client AND user_id = NEW.user_id LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lookup_client_id ON manual_entries;
CREATE TRIGGER trigger_lookup_client_id
  BEFORE INSERT OR UPDATE ON manual_entries
  FOR EACH ROW EXECUTE FUNCTION lookup_client_id();

-- ============================================================
-- BILLS & LINE ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  bill_number VARCHAR(50),
  matter VARCHAR(255),
  date_from DATE,
  date_to DATE,
  subtotal_npr INT,
  vat_amount_npr INT,
  total_npr INT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS bill_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES manual_entries(id) ON DELETE SET NULL,
  description TEXT,
  date DATE,
  duration_minutes INT,
  hourly_rate_npr INT,
  amount_npr INT
);
