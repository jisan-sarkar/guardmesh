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
