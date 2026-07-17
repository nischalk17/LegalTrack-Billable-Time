-- Migration V3: Billing safety, extension pairing

-- Prevent an entry from being pulled into two bills (bills.generate previously
-- filtered by date range only, with no "already billed" tracking).
ALTER TABLE manual_entries
  ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ;

-- entryConverter.js does INSERT ... ON CONFLICT (activity_id), which requires
-- a unique constraint that was never added in a prior migration. Partial index
-- since activity_id is NULL for manual/suggestion-sourced entries.
CREATE UNIQUE INDEX IF NOT EXISTS manual_entries_activity_id_key
  ON manual_entries(activity_id) WHERE activity_id IS NOT NULL;

-- Short-lived codes for pairing the browser extension to a logged-in web session.
CREATE TABLE IF NOT EXISTS extension_pairing_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(8) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extension_pairing_codes_code ON extension_pairing_codes(code);
