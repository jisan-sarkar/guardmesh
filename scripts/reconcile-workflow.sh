#!/usr/bin/env sh
set -eu

database_url="${DATABASE_URL:?DATABASE_URL is required}"

psql "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
WITH pending AS (
  SELECT 'orders_outbox' AS source, count(*) AS count FROM orders_outbox WHERE published_at IS NULL
  UNION ALL
  SELECT 'inventory_outbox', count(*) FROM inventory_outbox WHERE published_at IS NULL
), broken_orders AS (
  SELECT count(*) AS count
  FROM orders o
  LEFT JOIN reservations r ON r.order_id = o.order_id
  WHERE (o.status = 'CONFIRMED' AND (r.order_id IS NULL OR r.result <> 'RESERVED'))
     OR (o.status = 'REJECTED' AND (r.order_id IS NULL OR r.result <> 'REJECTED'))
), missing_results AS (
  SELECT count(*) AS count
  FROM orders o
  WHERE o.status = 'PENDING_STOCK'
    AND o.created_at < NOW() - INTERVAL '5 minutes'
)
SELECT source, count FROM pending
UNION ALL SELECT 'broken_orders', count FROM broken_orders
UNION ALL SELECT 'stuck_pending_orders', count FROM missing_results;

DO $$
DECLARE
  broken integer;
BEGIN
  SELECT count(*) INTO broken
  FROM orders o
  LEFT JOIN reservations r ON r.order_id = o.order_id
  WHERE (o.status = 'CONFIRMED' AND (r.order_id IS NULL OR r.result <> 'RESERVED'))
     OR (o.status = 'REJECTED' AND (r.order_id IS NULL OR r.result <> 'REJECTED'))
     OR (o.status = 'PENDING_STOCK' AND o.created_at < NOW() - INTERVAL '5 minutes');
  IF broken > 0 THEN
    RAISE EXCEPTION 'workflow reconciliation found % inconsistent or stuck orders', broken;
  END IF;
END $$;
SQL

echo "Workflow reconciliation passed."
