# GuardMesh evaluation scenarios

All measurements must use synthetic identities/data and record the commit SHA, host resources, dependency versions, workload, duration, result counts, and limitations.

## Required scenarios

1. **Authorization correctness** — valid same-location requests succeed; missing, malformed, cross-location, and wrong-role requests fail.
2. **Policy outage** — stop OPA and verify protected writes do not commit.
3. **Broker outage** — stop RabbitMQ after an order commit and verify outbox intent remains available for later publication.
4. **Duplicate delivery** — redeliver the same order event and verify one effective reservation.
5. **Worker replay** — restart Inventory while processing and verify inbox/event deduplication.
6. **Load baseline** — run `k6 run evaluation/k6/orders.js` with explicit `BASE_URL`, `ACCESS_TOKEN`, `RATE`, and `DURATION` values.
7. **Backup/restore** — run `scripts/backup-restore.sh` against an isolated synthetic database and verify representative records after restore.

## Evidence template

- Commit SHA:
- Date/time and timezone:
- Host CPU/RAM/disk:
- Container image versions:
- Dataset and seed:
- Command:
- Expected invariant:
- Observed result:
- Raw artifact path:
- Limitations and follow-up:
