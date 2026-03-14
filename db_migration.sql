-- Part 1: Schema Adjustments for Client Management & Billing

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

-- Trigger to auto-update updated_at for clients
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE manual_entries ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Trigger to auto lookup client_id based on client name without changing existing routes
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
