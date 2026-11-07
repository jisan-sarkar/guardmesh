# Release evidence checklist

- [ ] `pnpm test` passes on the release commit.
- [ ] `pnpm typecheck` passes on the release commit.
- [ ] `pnpm build` passes on the release commit.
- [ ] OPA policy tests pass with the pinned CLI.
- [ ] `pnpm audit --audit-level high` reports no high-severity vulnerabilities or has an explicit reviewed exception.
- [ ] `docker compose --env-file .env.example config` passes.
- [ ] No real secrets, customer data, or generated credentials are committed.
- [ ] Authorization-negative, duplicate-message, and dependency-outage evidence is recorded.
- [ ] Backup/restore evidence is recorded in an isolated synthetic environment.
- [ ] Performance results include method, environment, raw data, and limitations.
- [ ] Production readiness is not claimed without a separate security and operations assessment.
