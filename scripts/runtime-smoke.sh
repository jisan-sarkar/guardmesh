#!/usr/bin/env sh
set -eu

base_url="${BASE_URL:-http://127.0.0.1:${TRAEFIK_PORT:-80}}"
postgres_container="${POSTGRES_CONTAINER:-guardmesh-postgres-1}"
rabbitmq_container="${RABBITMQ_CONTAINER:-guardmesh-rabbitmq-1}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "required command not found: $1" >&2; exit 1; }
}

need curl
need docker

for path in api/orders/health/ready api/inventory/health/ready api/security/health/ready; do
  attempt=0
  while ! curl --connect-timeout 2 --max-time 5 -fsS "$base_url/$path" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 30 ] || {
      echo "readiness check timed out: $path" >&2
      exit 1
    }
    sleep 1
  done
done

queue_names="$(docker exec "$rabbitmq_container" rabbitmqctl list_queues -p guardmesh 2>/dev/null | awk 'NR > 1 { print $1 }')"
for queue in inventory.orders orders.stock-results security.events inventory.orders.failed orders.stock-results.failed security.events.failed; do
  printf '%s\n' "$queue_names" | grep -Fx "$queue" >/dev/null || {
    echo "missing RabbitMQ queue: $queue" >&2
    exit 1
  }
done

permission_names="$(docker exec "$rabbitmq_container" rabbitmqctl list_permissions -p guardmesh 2>/dev/null)"
for user in orders-service inventory-service security-service; do
  printf '%s\n' "$permission_names" | awk -v user="$user" '$1 == user { found = 1 } END { exit found ? 0 : 1 }' || {
    echo "missing RabbitMQ permission: $user" >&2
    exit 1
  }
done

order_id="guardmesh-smoke-$(date +%s)"
event_id="guardmesh-smoke-event-$(date +%s)"
before_available="$(docker exec "$postgres_container" psql -U guardmesh -d guardmesh -At -c "SELECT available FROM inventory_items WHERE sku = 'sku-2' AND location_id = 'loc-a';")"
[ -n "$before_available" ] || { echo "seed inventory item sku-2 is missing" >&2; exit 1; }

PGPASSWORD=orders-change-me-local-only docker exec -i -e PGPASSWORD=orders-change-me-local-only "$postgres_container" \
  psql -h 127.0.0.1 -U orders_app -d guardmesh -v ON_ERROR_STOP=1 -v order_id="$order_id" -v event_id="$event_id" <<'SQL'
INSERT INTO orders (order_id, actor_id, request_fingerprint, location_id, items_json, status, version, created_at)
VALUES (:'order_id', 'runtime-smoke', :'event_id', 'loc-a', '[{"sku":"sku-2","quantity":1}]'::jsonb, 'PENDING_STOCK', 1, NOW());
INSERT INTO orders_outbox (event_id, event_type, payload_json, created_at)
VALUES (
  :'event_id',
  'orders.order-created.v1',
  jsonb_build_object(
    'version', 1,
    'eventId', :'event_id',
    'type', 'orders.order-created.v1',
    'occurredAt', to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'correlationId', :'order_id',
    'producer', 'orders-api',
    'payload', jsonb_build_object(
      'orderId', :'order_id',
      'requestFingerprint', :'event_id',
      'locationId', 'loc-a',
      'items', jsonb_build_array(jsonb_build_object('sku', 'sku-2', 'quantity', 1))
    )
  ),
  NOW()
);
SQL

attempt=0
while [ "$attempt" -lt 30 ]; do
  state="$(docker exec "$postgres_container" psql -U guardmesh -d guardmesh -At -F '|' -c "SELECT o.status, i.available, CASE WHEN r.order_id IS NULL THEN 0 ELSE 1 END, CASE WHEN ob.published_at IS NULL THEN 0 ELSE 1 END FROM orders o JOIN inventory_items i ON i.sku = 'sku-2' AND i.location_id = 'loc-a' LEFT JOIN reservations r ON r.order_id = o.order_id LEFT JOIN orders_outbox ob ON ob.event_id = '$event_id' WHERE o.order_id = '$order_id';")"
  if printf '%s' "$state" | awk -F '|' -v before="$before_available" '$1 == "CONFIRMED" && $2 == before - 1 && $3 == 1 && $4 == 1 { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "runtime smoke passed: $order_id"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "runtime smoke timed out: $order_id" >&2
exit 1
