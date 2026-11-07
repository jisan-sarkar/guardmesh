CREATE TABLE security_events (
  event_id TEXT PRIMARY KEY,
  event_json JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE security_inbox (
  event_id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE security_alerts (
  alert_id TEXT PRIMARY KEY,
  alert_json JSONB NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED')),
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN';

CREATE INDEX security_events_occurred_at_idx ON security_events (occurred_at);
CREATE INDEX security_alerts_created_at_idx ON security_alerts (created_at);
