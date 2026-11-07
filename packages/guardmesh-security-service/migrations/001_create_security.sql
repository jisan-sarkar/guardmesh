CREATE TABLE security_events (
  event_id TEXT PRIMARY KEY,
  event_json JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE security_alerts (
  alert_id TEXT PRIMARY KEY,
  alert_json JSONB NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX security_events_occurred_at_idx ON security_events (occurred_at);
CREATE INDEX security_alerts_created_at_idx ON security_alerts (created_at);
