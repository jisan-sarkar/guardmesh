# GuardMesh development plan

D0 requirements approved by the owner. D1 design and D2 planning reviewed in one pass under the owner's instruction to proceed without separate manual design reviews. This is the implementation backlog and verification plan. All runtime evidence is pending. The master specification and its planning closure in §37 govern this plan.

## User stories and boundaries

| ID | User story | Completion |
|---|---|---|
| US-01 | As a cashier, I can sign in, create an order for my assigned location and check its status. | M1 secure entry point, M2 durable stock outcome |
| US-02 | As an inventory manager, I can view and adjust stock at my assigned locations with an audit trail. | M1 protected operation, M3 end-to-end audit visibility |
| US-03 | As a security operator, I can inspect redacted events and acknowledge explainable alerts. | M3 filtering, two rules, attribution |
| US-04 | As a platform operator, I can find stalled work and verify recovery after an outage. | M2 reconciliation, M4 evidence and restore |
| US-05 | As a developer or reviewer, I can launch the demo, verify the controls, and reproduce the experiments. | M0 bootstrap, M4 reports, M5 release |

Use one synthetic organization and two locations. Reserve-only workflow, no fulfillment or payment. The operator acknowledges alerts. Alert resolution, multi-tenant SaaS, AI detection, production availability guarantees, and optional infrastructure upgrades are outside this release. Keep the three service codebases and existing stack.

## Repository setup and work loop

**R-01.** Before remote bootstrap, resolve owner/account, access, visibility, license and write authorization. Proposed repository name is `guardmesh` and proposed visibility is private. Check for an existing matching repository first. Seed `main` with approved documentation and a minimal README. Create `dev` from the exact same verified remote commit and set `dev` as the default branch. Protect both branches from force pushes and deletion. Require a PR to `main` and configure only existing CI checks. Keep ordinary merge commits and allow authorized task pushes to `dev`. Keep release approval under §36.

**R-02.** Put the source under `apps/{orders-api,inventory-api,security-service,demo-web}`, shared interfaces and mechanics under `packages/{api-contracts,event-contracts,guardmesh-nest,telemetry}`, and keep policies, infrastructure definitions, verification, and runbooks in their own folders. Create directories as the work needs them. Add the issue and PR templates and milestone labels on `dev`.

For every work item below, assign the named module to the implementer and keep one primary task in progress. Open one issue per independently verifiable item, or split a numbered substep into a child issue when it produces its own acceptance evidence. Record dependencies, related requirements, acceptance cases, security impact and evidence. Use `planned → ready → in progress → in review → done` and `blocked` when needed. Before an authorized push, inspect the diff, run applicable checks, scan for secrets, commit one coherent change with Conventional Commits, and verify the remote SHA. For promotion, inspect all of `main...dev`, run the relevant suite on the PR head, capture owner release approval, merge with a merge commit, verify `main` and synchronize `dev` without rewriting history. A failed check blocks promotion.

## M0 · Foundation and compatibility

| ID and module | Depends on | Implementation subtasks | Acceptance and evidence |
|---|---|---|---|
| M0-01 Workspace and CI | R-02 | 1. Pin Node and pnpm. 2. Create buildable app/package shells as needed. 3. Add lockfile, strict TS, lint, format, unit, secret checks. 4. Add CI jobs and issue/PR conventions. | Clean install and jobs succeed in ephemeral CI. No secrets in history or logs. Capture actual job names before requiring them. |
| M0-02 Local infrastructure | M0-01 | 1. Define core Compose and isolated TLS test profile. 2. Split public ingress and private app/data networks. 3. Define Keycloak test realm, three adjacent OPA instances, PostgreSQL, RabbitMQ, secrets and health checks. 4. Seed two locations, least-privilege identities and deterministic data. | Core starts from empty volumes. Only approved routes are reachable. Capture host architecture, versions, CPU/RAM/disk footprint and teardown steps. |
| M0-03 SQL ownership | M0-02 | 1. Give each service its own logical database and migration history. 2. Separate runtime and migration credentials. 3. Bootstrap Kysely/pg migration and seed commands. | AT-46. Clean migration and rerun are reproducible. Runtime roles cannot read/write other service databases. |
| M0-04 Runtime and schemas | M0-01 | 1. Pin the Nest/Fastify and Zod candidate combination. 2. Exercise middleware, runtime schema, OpenAPI parity, malformed bodies, request limits, CORS and trace propagation. 3. Record compatibility or select a supported fallback through ADR-019. | AT-49. Preserve actual versions, fixtures and failure output. Repeat the same probe against any fallback. |
| M0-05 Identity and policy contract | M0-02, M0-04 | 1. Probe browser PKCE and issuer/JWKS routing. 2. Fix claim mappings and machine audience/scope. 3. Exercise OPA envelope and failure variants with the actual runtime. 4. Validate public OIDC and private management exposure in the TLS profile. | Early AT-26/41 fixtures. Exact routes, JWT fixtures and OPA responses recorded. Full protected-route evidence follows in M1. |
| M0-06 Broker permissions probe | M0-02 | 1. Load baseline exchanges/queues and separated principals. 2. Check exchange and routing-key denies. 3. Probe mandatory returns, confirms and queue-full behavior with the selected client. | Save fixtures and negative results. Final AT-30/42–43/48 run with the real workflow in M2. |
| M0-07 First-run gate | M0-03–06 | 1. Complete setup, reset and troubleshooting instructions. 2. Run health, login, `opa test`, static and core smoke checks. 3. Record ADRs and close or assign every failed compatibility check before dependent work. | Fresh environment is reproducible. Version matrix, topology and synthetic credentials procedure are documented. |

## M1 · Secure vertical slice

| ID and module | Depends on | Implementation subtasks | Acceptance and evidence |
|---|---|---|---|
| M1-01 Browser and ingress | M0-07 | 1. Build SPA sign-in/logout and role-based navigation. 2. Route approved APIs and OIDC only. 3. Enforce body limits and configured ingress rate limit. | AT-38/41, X-AT-01. Real browser login works through TLS test ingress. Private endpoints and bypass probes fail. |
| M1-02 GuardMesh enforcement adapter | M0-07 | 1. Verify JWT issuer/signature/algorithm/audience/time/type using bounded JWKS. 2. Resolve service-owned context. 3. Invoke fixed OPA rule and validate strict result/version. 4. Add sanitized audit interface and dependency error mapping. | AT-01–03/07–08/26–29/37/45/47. Direct calls enforce the same rules. Malformed policy and stale assignment races produce no protected write. |
| M1-03 Orders | M1-02 | 1. Add order/line/assignment/key/outbox migrations. 2. Implement scoped POST/GET, input limits and canonical fingerprint. 3. Atomically write order, key and outgoing intent before `202`. 4. Reauthorize replay and mask inaccessible reads. | AT-05 and early AT-11/12/50. Crash after commit and before response can be retried. No broker-dependent claim during this slice. |
| M1-04 Inventory API | M1-02 | 1. Add item/location schemas and constraints. 2. Implement stock list and manager adjustments with audit intent. 3. Implement private catalogue and narrow machine token. | AT-04/06/09/10. Cross-location adjustment and browser tokens at the machine route fail. Durable audit delivery is verified in M3. |
| M1-05 Secure slice gate | M1-01–04 | 1. Exercise login → JWT → policy → pending order. 2. Run adversarial matrix and dependency failures. 3. Publish OpenAPI drafts aligned to behavior and denial evidence. | M1 acceptance cases pass. Pending orders are deliberate until M2 activates the workflow. |

## M2 · Durable order and stock workflow

| ID and module | Depends on | Implementation subtasks | Acceptance and evidence |
|---|---|---|---|
| M2-01 Event contracts and topology | M1-05, M0-06 | 1. Version envelopes and payload schemas. 2. Encode exchanges, bindings, queues and least-privilege publisher/consumer identities. 3. Add producer/consumer contract fixtures. | AT-30/42/43. Verify broker-denied writes and consumer rejection of invalid content from an allowed publisher separately. |
| M2-02 Outbox relay | M2-01 | 1. Implement bounded claim leases and attempts. 2. Correlate mandatory returns and publisher confirms. 3. Persist sent or failed states and expose backlog age. | AT-16/17/48. No sent mark on unroutable/uncertain publish. Broker restart preserves eligible work. |
| M2-03 Inventory reservation worker | M2-01 | 1. Validate event and recompute fingerprint. 2. Dedup by event and business order. 3. Lock stock deterministically and reserve all lines or reject. 4. Save immutable outcome and outbox in one transaction. 5. Ack after commit. | AT-13–15/31/32/51. Two concurrent contenders cannot oversell. Crash/replay never applies a second stock effect. |
| M2-04 Orders outcome worker | M2-02–03 | 1. Validate source routing, order/location/hash/result version. 2. Update only pending state with inbox and history atomically. 3. Quarantine conflict and preserve pending state when the result is mismatched. | AT-19/52. One valid terminal transition. Later valid outcome can finalize an order after rejected mismatched input. |
| M2-05 Retry, quarantine and reconciliation | M2-04 | 1. Classify transient and permanent failures. 2. Bound retries and retain diagnostic evidence. 3. Implement read-only report and authorized audited replay procedure. 4. Run outage and replay matrix. | AT-18/33 plus final AT-11–19/30–33/42–43/48/50–52. No silent loss or guessed outcomes. |

## M3 · Security events, alerts and demo UI

| ID and module | Depends on | Implementation subtasks | Acceptance and evidence |
|---|---|---|---|
| M3-01 Audit publication | M2-05 | 1. Wire access denials, policy errors and dead-letter diagnostics to sanitized events. 2. Deliver privileged adjustment intent via outbox. 3. Instrument loss and lag. | AT-22/24/36. Security outage leaves authorization effective and the durable intent recoverable. |
| M3-02 Event ingestion and rule engine | M3-01 | 1. Add event, inbox, rule state and alert migrations. 2. Apply rolling processing-time rules with serialized updates per actor/service key. 3. Persist event and alert evidence atomically, then ack. | AT-20/21/53 and X-AT-02. Prove threshold, boundary, replay and crash behavior for both rules. |
| M3-03 Security API | M3-02, M1-02 | 1. Reuse adapter with operator policy. 2. Implement event/alert filters and paginated views. 3. Add attributed, replay-safe acknowledgment. | AT-23/35 and X-AT-03. Operators see redacted records only. Acknowledgment is authorized and repeat-safe. |
| M3-04 Demo UI | M3-03, M2-05 | 1. Add cashier order and status screens. 2. Add manager stock and adjustment screens. 3. Add operator event and alert views. 4. Escape event text and cover keyboard navigation and loading/error states. | Playwright role-based smoke. Links and displays match authorization. Render injected text as text. |

## M4 · Observability, experiments and recovery

| ID and module | Depends on | Implementation subtasks | Acceptance and evidence |
|---|---|---|---|
| M4-01 Telemetry | M3-04 | 1. Connect HTTP and async trace context. 2. Add Prometheus, Grafana and Jaeger profile. 3. Measure backlog, age, failures, drops and decision latency with bounded labels. | X-AT-04. Representative trace spans HTTP and broker processing. No credentials, sensitive bodies or high-cardinality IDs in metric labels. |
| M4-02 Benchmark harness | M4-01 | 1. Pin fixtures, load, timing and budgets. 2. Record environment, commit and versions. 3. Save scripts and raw results for repeat runs. | EX-01 policy overhead, EX-02 fixed-budget replica scaling, EX-03 broker recovery. Report latency distributions, throughput/errors, resources and recovery. Keep any bypass benchmark isolated from release artifacts. |
| M4-03 Recovery and reproducibility | M4-01, M2-05 | 1. Capture a consistent synthetic backup of DBs/config. 2. Restore into isolation and reconcile broker assumptions. 3. Run clean checkout and documented failure drills. 4. Record observed recovery, gaps and runbooks. | AT-25/34. Verify representative order, reservation, event, replay safety and a fresh order. Publish core/observability footprint. |

## M5 · Harden and release

| ID and module | Depends on | Implementation subtasks | Acceptance and evidence |
|---|---|---|---|
| M5-01 Security and supply chain | M4-02–03 | 1. Run dependency/image/secret scans and selected ASVS mapping. 2. Verify credential rotation and private management access. 3. Link selected findings, exceptions and fixes. | AT-39/40/44. Old credentials denied. No unresolved violation of an authorization or state invariant. |
| M5-02 Full verification and handoff | M5-01 | 1. Run complete suite on clean candidate. 2. Publish quick start, architecture/ADRs, technical report, demo, provenance and limitations. 3. Verify rollout, migrations and rollback. | Every required acceptance ID has evidence linked to the exact candidate. Experiments have raw evidence. Any failure blocks release until resolved and rerun. |
| M5-03 Controlled release | M5-02 | 1. Open full `dev → main` PR. 2. Record passing checks and owner release authorization. 3. Merge with merge commit and verify resulting SHA. 4. Tag only the approved release and resync `dev`. | Release, tag and evidence point to verified commits. Visibility change and deployment remain separate owner decisions. |

## Traceability and verification in one run

| Requirements and features | Owning modules | Design decisions |
|---|---|---|
| FR-01–03, FR-11. F-01–04, F-06, F-26, F-28 | M0-05, M1-01–02/04, M3-03 | ADR-003/004/010–012/019–021 |
| FR-04, FR-13. F-05 | M1-03–05, M2-05 | ADR-002/007/012/017 |
| FR-05–07, FR-14–15. F-07/08/22/24/27 | M0-03/06, M1-04, M2-01–05, M3-01 | ADR-005/006/013–015/017/018 |
| FR-08–10, FR-16. F-09–12/15 | M3-01–04 | ADR-008/013/016/020 |
| FR-12. F-13/14/23 | M0-07, M4-01–03, M5-01–03 | ADR-001/009/015/022 |

- **X-AT-01** reaches the configured ingress limit and verifies the documented rate-limit response. **X-AT-02** covers both detection thresholds, processing-time bucket crossings, quiet-window resets, duplicate events and concurrent delivery. **X-AT-03** verifies operator-only acknowledgment, attribution, filtering and harmless repeats. **X-AT-04** verifies cross-hop trace correlation and redaction.
- Execute all mandatory AT-01–53 and X-AT-01–04 through one candidate verification entry point. D2 selects the target name `pnpm verify:release`. M0/M5 implement the underlying jobs and the entry point. Stage static and unit checks before starting infrastructure, then run policy, contract, integration, TLS/browser, fault/restore and security jobs in isolated profiles. Collect experiment evidence via EX-01–03 jobs on a controlled host. A missing, skipped, failed or stale required result blocks promotion. Use separate synthetic environments for destructive fault and restore cases. EX-04–06 are optional research comparisons and do not replace mandatory cases.
- Record acceptance ID, commit, versions, environment, command, exit status, logs or raw data, and cleanup outcome. Cite why exclusions or exceptions are applicable. Never substitute planned tests for executed results.
- Document checks performed during planning are recorded in the handoff. The first implementation action after authorized repository bootstrap is M0-01, the pinned workspace and CI foundation.
