CREATE TABLE inventory_items (
  sku TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  available INTEGER NOT NULL CHECK (available >= 0),
  version INTEGER NOT NULL CHECK (version > 0)
);

CREATE TABLE reservations (
  order_id TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  location_id TEXT NOT NULL,
  items_json JSONB NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('RESERVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (order_id, request_fingerprint)
);

CREATE INDEX inventory_items_location_idx ON inventory_items (location_id);

CREATE TABLE inventory_inbox (
  event_id TEXT PRIMARY KEY,
  result_event_json JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE inventory_outbox (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
