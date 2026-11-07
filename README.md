# GuardMesh

GuardMesh is a security-focused distributed-systems reference implementation for protecting applications built from independent services.

It demonstrates how to combine standard identity, service-side authorization, replay-safe asynchronous workflows, security telemetry, and observable failure handling in a small, reproducible system.

## Status

**Current status:** local reference implementation on `dev`; core verification is automated.

GuardMesh is a working reference implementation. It includes shared authentication and authorization code, three service APIs, replay-safe domain logic, event and outbox primitives, security telemetry, local infrastructure, and repeatable evaluation scenarios. It is not a production deployment; production readiness still requires environment-specific security, capacity, and operations review.

## Planned architecture

- Keycloak for OIDC identity and token issuance
- NestJS services with the shared `@guardmesh/nest` GuardMesh enforcement adapter
- Open Policy Agent (OPA) and Rego for resource-aware authorization
- Traefik for ingress and baseline rate limiting
- PostgreSQL with service-owned data and transactional outbox/inbox patterns
- RabbitMQ for durable order-to-inventory workflow events
- A security service for sanitized audit events and explainable alerts
- React/Vite for a small demonstration UI
- OpenTelemetry, Prometheus, Grafana, and Jaeger for observability
- Docker Compose for reproducible local environments

## MVP focus

The first release will prove, with tests and documented experiments:

1. Strict authentication and resource-level authorization, including direct service access.
2. Fail-closed behavior when policy decisions are unavailable or invalid.
3. Replay-safe order and inventory coordination with bounded retries and dead-letter handling.
4. Structured, redacted security events and explainable alert rules.
5. Opt-in OTLP telemetry for service HTTP work, application metrics, and W3C trace-context propagation; end-to-end trace backend evidence remains an evaluation item.

To enable the optional telemetry stack, set `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` in `.env` and run `docker compose --profile observability --env-file .env up --build`. Jaeger is available at `http://localhost:16686`; telemetry export is opt-in so the core profile does not require the collector.

6. Reproducible setup, failure experiments, and performance evidence.

Operational checks are available through `/orders/health/live`, `/orders/health/ready`,
`/inventory/health/live`, `/inventory/health/ready`, `/security/health/live`, and
`/security/health/ready`. Each API also exposes an internal `/metrics` endpoint.
Run `RECONCILIATION_AGE_MINUTES=5 DATABASE_URL=... pnpm workflow:reconcile` to
produce a read-only report of pending outboxes and inconsistent or stuck orders,
including correlated event IDs, likely cause, and an approved recovery action.

The restaurant workflow is only a replaceable demonstration domain. GuardMesh is not a restaurant, payment, or full POS product.

## Current development phase

The core local implementation is on `dev`. The public repository intentionally excludes the private project and development-plan documents. Production deployment hardening, full acceptance-test automation, load evidence, and generated API-contract publication remain separate release activities.

## Local verification

Prerequisites: Node 24.22.x, pnpm 12.18.0, Docker Compose, and the pinned OPA CLI for policy tests.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm policy:test
pnpm compose:config
pnpm audit --audit-level high
scripts/runtime-smoke.sh
```

`scripts/runtime-smoke.sh` expects a running local Compose stack and verifies API readiness, broker queues/permissions, and one synthetic outbox-to-reservation workflow. Override `BASE_URL`, `POSTGRES_CONTAINER`, and `RABBITMQ_CONTAINER` for an isolated Compose project.

## Local environment

Copy `.env.example` to `.env`, then start the stack:

```sh
cp .env.example .env
docker compose --env-file .env up --build
```

The first PostgreSQL startup applies the service migrations and synthetic inventory seed. Each service records its migration ID and refuses workflow readiness when the expected schema version is missing. Keycloak imports the local `guardmesh` realm with the `demo-web` client and synthetic users. The named PostgreSQL volume is initialized only once; use a fresh isolated volume when testing a complete schema bootstrap. Existing volumes must be migrated deliberately; workers do not create or repair schema objects at runtime.

An accepted order is written as `PENDING_STOCK`, published through the durable Orders outbox, reserved atomically by Inventory, and finalized by the Orders inbox consumer. Duplicate event delivery is intentionally safe and does not decrement stock twice.

Host ports are configurable through `POSTGRES_PORT`, `RABBITMQ_PORT`, `RABBITMQ_MANAGEMENT_PORT`, `KEYCLOAK_PORT`, `OPA_PORT`, and `TRAEFIK_PORT` when a default port is already in use. Local-only dependencies bind to loopback by default; set the corresponding `*_BIND_ADDRESS` variable only when a controlled development environment needs another interface. The Traefik gateway is the only service published broadly by default.

Health endpoints are available through the gateway at `/api/orders/health/live`, `/api/inventory/health/live`, and `/api/security/health/live`. API routes are `/api/orders`, `/api/inventory`, and `/api/security`.

The browser demo completes the PKCE authorization flow and keeps access tokens in memory. The imported local users use the password shown in `.env.example`; change all credentials before using any shared environment.

The internal inventory catalogue is available at `/api/inventory/internal/catalogue` only to the confidential `orders-service` client, the `inventory.catalog.read` scope, and the dedicated `inventory-reader` policy role. Its local secret and actor mapping are synthetic development credentials only.

Backup/restore uses an explicit target for safety. Run `DATABASE_URL=... BACKUP_DIR=... scripts/backup-restore.sh backup`, then restore with `RESTORE_DATABASE_URL=... scripts/backup-restore.sh restore <dump-file>`. A backup includes the database dump, source commit, and non-secret realm, broker, policy, migration, and Compose configuration bundle.

Generated OpenAPI JSON is opt-in for local contract inspection. Set `ENABLE_API_DOCS=true` before starting Compose, then use `/api/orders/docs/openapi.json`, `/api/inventory/docs/openapi.json`, or `/api/security/docs/openapi.json`. Documentation routes remain disabled in production and by default.

For recovery, security evidence, and performance evidence, see [`evaluation/scenarios.md`](evaluation/scenarios.md), [`docs/security/adapter-contract.md`](docs/security/adapter-contract.md), [`docs/security/verification-matrix.md`](docs/security/verification-matrix.md), [`docs/release-checklist.md`](docs/release-checklist.md), and the scripts under `scripts/`.

## Engineering principles

- Enforce authorization at the resource-owning service, not only at the gateway.
- Treat authentication and authorization as separate concerns.
- Fail closed when policy evaluation cannot produce a valid decision.
- Assume messages may be duplicated, delayed, or delivered out of order.
- Keep service data ownership explicit and avoid sharing databases across services.
- Use synthetic data only; never commit credentials or secrets.
- Prefer measured, reproducible evidence over unsupported performance or production claims.
- Keep the system small enough to understand, test, and operate locally.

## Documentation

The commands and endpoints above describe the verified local workflow. Environment-specific production procedures must add TLS, secret injection, capacity limits, backup policy, and operator access controls.

`dev` is the integration branch. `main` holds reviewed release baselines.

## License

To be decided before public release.
