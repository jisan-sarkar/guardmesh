# GuardMesh

GuardMesh is a security-focused distributed-systems reference implementation for protecting applications built from independent services.

It demonstrates how to combine standard identity, service-side authorization, replay-safe asynchronous workflows, security telemetry, and observable failure handling in a small, reproducible system.

## Status

**Implementation in progress — Phase 0 documentation and governance alignment.**

The repository contains the workspace foundation and initial shared authorization contracts. The detailed project specification and development plan are maintained outside the public repository. Features are not considered implemented, verified, measured, or production-ready until code and repeatable evidence exist.

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

The restaurant workflow is only a replaceable demonstration domain. GuardMesh is not a restaurant, payment, or full POS product.

## Current development phase

The project is implementing the approved plan one module at a time. Phase 0 restores the project documents; the next development step is the secure Orders vertical slice.

Until those steps are complete, there are no executable setup or test commands to promise.

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
