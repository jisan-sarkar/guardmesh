#!/usr/bin/env sh
set -eu

database_url="${DATABASE_URL:?DATABASE_URL is required}"
age_minutes="${RECONCILIATION_AGE_MINUTES:-5}"

case "$age_minutes" in
  ''|*[!0-9]*) echo "RECONCILIATION_AGE_MINUTES must be a non-negative integer" >&2; exit 1 ;;
esac

echo "Workflow reconciliation report (read-only; threshold=${age_minutes}m)"

psql "$database_url" -v ON_ERROR_STOP=1 -v age_minutes="$age_minutes" <<'SQL'
SELECT 'pending_outbox' AS category, 'orders_outbox' AS source, count(*) AS count
FROM orders_outbox WHERE published_at IS NULL
UNION ALL
SELECT 'pending_outbox', 'inventory_outbox', count(*)
FROM inventory_outbox WHERE published_at IS NULL;

\echo 'Anomalies: order_id | state | reservation | age | event_ids | likely_cause | approved_recovery'
WITH order_events AS (
  SELECT payload_json #>> '{payload,orderId}' AS order_id,
         string_agg(event_id, ', ' ORDER BY created_at) AS event_ids
  FROM orders_outbox
  GROUP BY payload_json #>> '{payload,orderId}'
), anomalies AS (
  SELECT o.order_id,
         o.status,
         COALESCE(r.result, 'MISSING') AS reservation_result,
         NOW() - o.created_at AS age,
         COALESCE(e.event_ids, 'NONE') AS event_ids,
         CASE
           WHEN o.status = 'PENDING_STOCK' THEN 'outbox, broker, or worker lag'
           WHEN o.status = 'CONFIRMED' AND (r.order_id IS NULL OR r.result <> 'RESERVED') THEN 'terminal order disagrees with inventory'
           WHEN o.status = 'REJECTED' AND (r.order_id IS NULL OR r.result <> 'REJECTED') THEN 'terminal order disagrees with inventory'
         END AS likely_cause,
         CASE
           WHEN o.status = 'PENDING_STOCK' THEN 'inspect outbox/inbox and replay only through an authorized path'
           ELSE 'quarantine and review correlated events; do not edit service state directly'
         END AS approved_recovery
  FROM orders o
  LEFT JOIN reservations r ON r.order_id = o.order_id
  LEFT JOIN order_events e ON e.order_id = o.order_id
  WHERE (o.status = 'CONFIRMED' AND (r.order_id IS NULL OR r.result <> 'RESERVED'))
     OR (o.status = 'REJECTED' AND (r.order_id IS NULL OR r.result <> 'REJECTED'))
     OR (o.status = 'PENDING_STOCK' AND o.created_at < NOW() - make_interval(mins => :'age_minutes'::integer))
)
SELECT order_id, status, reservation_result, age, event_ids, likely_cause, approved_recovery
FROM anomalies
ORDER BY age DESC, order_id;

SQL

anomaly_count="$(psql "$database_url" -v ON_ERROR_STOP=1 -v age_minutes="$age_minutes" -At <<'SQL'
SELECT count(*)
FROM orders o
LEFT JOIN reservations r ON r.order_id = o.order_id
WHERE (o.status = 'CONFIRMED' AND (r.order_id IS NULL OR r.result <> 'RESERVED'))
   OR (o.status = 'REJECTED' AND (r.order_id IS NULL OR r.result <> 'REJECTED'))
   OR (o.status = 'PENDING_STOCK' AND o.created_at < NOW() - make_interval(mins => :'age_minutes'::integer));
SQL
)"

if [ "$anomaly_count" -gt 0 ]; then
  echo "workflow reconciliation found $anomaly_count inconsistent or stuck orders" >&2
  exit 1
fi

echo "Workflow reconciliation passed."
