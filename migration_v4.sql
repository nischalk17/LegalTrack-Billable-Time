-- Migration V4: Multi-tenant organizations & roles
--
-- Every "created by a user" table gets an organization_id alongside its
-- existing user_id (which becomes the audit "created_by" field). Isolation
-- moves from per-user to per-organization so a law firm's lawyers can share
-- clients, bills, and time entries.

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'lawyer', 'paralegal')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

-- The organization a user is currently acting within (switchable if they
-- belong to more than one, e.g. an invited paralegal working with two firms).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_organization_id UUID REFERENCES organizations(id);

ALTER TABLE clients             ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE bills               ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE bill_line_items     ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE manual_entries      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE tracked_activities  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE tracking_rules      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE billable_suggestions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE active_sessions     ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Backfill: give every existing user a personal organization (owner role) so
-- current single-user usage keeps working unchanged after this migration.
DO $$
DECLARE
  u RECORD;
  new_org_id UUID;
BEGIN
  FOR u IN SELECT id, name FROM users WHERE active_organization_id IS NULL LOOP
    INSERT INTO organizations (name) VALUES (u.name || '''s Organization') RETURNING id INTO new_org_id;
    INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (new_org_id, u.id, 'owner')
      ON CONFLICT (organization_id, user_id) DO NOTHING;
    UPDATE users SET active_organization_id = new_org_id WHERE id = u.id;
  END LOOP;
END $$;

-- Backfill organization_id on every tenant table from the creating user's org.
UPDATE clients c SET organization_id = u.active_organization_id
  FROM users u WHERE c.user_id = u.id AND c.organization_id IS NULL;
UPDATE bills b SET organization_id = u.active_organization_id
  FROM users u WHERE b.user_id = u.id AND b.organization_id IS NULL;
UPDATE bill_line_items bli SET organization_id = b.organization_id
  FROM bills b WHERE bli.bill_id = b.id AND bli.organization_id IS NULL;
UPDATE manual_entries m SET organization_id = u.active_organization_id
  FROM users u WHERE m.user_id = u.id AND m.organization_id IS NULL;
UPDATE tracked_activities t SET organization_id = u.active_organization_id
  FROM users u WHERE t.user_id = u.id AND t.organization_id IS NULL;
UPDATE tracking_rules r SET organization_id = u.active_organization_id
  FROM users u WHERE r.user_id = u.id AND r.organization_id IS NULL;
UPDATE billable_suggestions s SET organization_id = u.active_organization_id
  FROM users u WHERE s.user_id = u.id AND s.organization_id IS NULL;
UPDATE active_sessions a SET organization_id = u.active_organization_id
  FROM users u WHERE a.user_id = u.id AND a.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_bills_org ON bills(organization_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_org ON bill_line_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_manual_entries_org ON manual_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_tracked_activities_org ON tracked_activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_tracking_rules_org ON tracking_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_billable_suggestions_org ON billable_suggestions(organization_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_org ON active_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
