# GuardMesh

GuardMesh is a security-focused distributed-systems reference implementation for protecting applications built from independent services.

It demonstrates how to combine standard identity, service-side authorization, replay-safe asynchronous workflows, security telemetry, and observable failure handling in a small, reproducible system.

## Status

**Phase implementation complete on `dev`; local verification is automated.**

GuardMesh is a working reference implementation. It includes shared authentication and authorization code, three service APIs, replay-safe domain logic, event and outbox primitives, security telemetry, local infrastructure, and repeatable evaluation scenarios. It is not a production deployment; production readiness still requires environment-specific security, capacity, and operations review.

## Planned architecture

- Keycloak for OIDC identity and token issuance
- NestJS services with a shared GuardMesh enforcement adapter
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
5. Correlated traces, metrics, and logs across synchronous and asynchronous work.

6. Reproducible setup, failure experiments, and performance evidence.

Operational checks are available through `/orders/health/live`, `/orders/health/ready`,
`/inventory/health/live`, `/inventory/health/ready`, `/security/health/live`, and
`/security/health/ready`. Each API also exposes an internal `/metrics` endpoint.
Run `DATABASE_URL=... pnpm workflow:reconcile` to detect pending outboxes and
inconsistent or stuck orders without mutating data.

The restaurant workflow is only a replaceable demonstration domain. GuardMesh is not a restaurant, payment, or full POS product.

## Current development phase

All planned implementation phases are complete on `dev`. The public repository intentionally excludes the private project and development-plan documents.

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
```

## Local environment

Copy `.env.example` to `.env`, then start the stack:

```sh
cp .env.example .env
docker compose --env-file .env up --build
```

The first PostgreSQL startup applies the service migrations and synthetic inventory seed. The Orders and Inventory workers also ensure their inbox/outbox tables exist when an older local volume is reused. Keycloak imports the local `guardmesh` realm with the `demo-web` client and synthetic users. The named PostgreSQL volume is initialized only once; use a fresh isolated volume when testing a complete schema bootstrap.

An accepted order is written as `PENDING_STOCK`, published through the durable Orders outbox, reserved atomically by Inventory, and finalized by the Orders inbox consumer. Duplicate event delivery is intentionally safe and does not decrement stock twice.

Host ports are configurable through `POSTGRES_PORT`, `RABBITMQ_PORT`, `RABBITMQ_MANAGEMENT_PORT`, `KEYCLOAK_PORT`, `OPA_PORT`, and `TRAEFIK_PORT` when a default port is already in use.

Health endpoints are available through the gateway at `/api/orders/health/live`, `/api/inventory/health/live`, and `/api/security/health/live`. API routes are `/api/orders`, `/api/inventory`, and `/api/security`.

The browser demo completes the PKCE authorization flow and keeps access tokens in memory. The imported local users use the password shown in `.env.example`; change all credentials before using any shared environment.

For recovery and performance evidence, see [`evaluation/scenarios.md`](evaluation/scenarios.md), [`docs/release-checklist.md`](docs/release-checklist.md), and the scripts under `scripts/`.

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

The README will be expanded with verified prerequisites, ports, environment setup, first-run steps, and test commands as the implementation makes them real.

`dev` is the integration branch. `main` holds reviewed release baselines.

## License

To be decided before public release.
