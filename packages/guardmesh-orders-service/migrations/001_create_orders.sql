CREATE TABLE orders_schema_migrations (
  migration_id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  location_id TEXT NOT NULL,
  items_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING_STOCK', 'CONFIRMED', 'REJECTED')),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (actor_id, request_fingerprint)
);

CREATE INDEX orders_actor_location_idx ON orders (actor_id, location_id);

CREATE TABLE orders_outbox (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE orders_inbox (
  event_id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL
);

INSERT INTO orders_schema_migrations (migration_id)
VALUES ('001_create_orders')
ON CONFLICT (migration_id) DO NOTHING;
