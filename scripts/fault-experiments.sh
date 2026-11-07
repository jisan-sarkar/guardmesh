#!/usr/bin/env sh
set -eu

case "${1:-}" in
  broker-outage)
    docker compose stop rabbitmq
    echo "RabbitMQ stopped. Submit a synthetic order, verify the outbox remains pending, then run: $0 broker-recover"
    ;;
  broker-recover)
    docker compose start rabbitmq
    ;;
  policy-outage)
    docker compose stop opa
    echo "OPA stopped. Protected writes must fail closed. Run: $0 policy-recover"
    ;;
  policy-recover)
    docker compose start opa
    ;;
  worker-replay)
    docker compose restart inventory-api
    echo "Inventory API restarted. Redeliver a synthetic event and verify no duplicate reservation effect."
    ;;
  *)
    echo "usage: $0 {broker-outage|broker-recover|policy-outage|policy-recover|worker-replay}" >&2
    exit 2
    ;;
esac
