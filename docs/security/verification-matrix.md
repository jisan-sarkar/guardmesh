# GuardMesh selective security verification matrix

Status: working evidence ledger for the local synthetic reference implementation.
This is not an OWASP ASVS certification, penetration test, or production-readiness
assessment. Requirement identifiers are pinned to OWASP ASVS 5.0.0.

Evidence labels:

- **Verified** means a checked-in test, script, or runtime observation directly covers the control.
- **Partial** means the control is implemented for the local reference path but lacks deployment-level evidence.
- **Gap** means the control is not implemented or the required evidence is missing.
- **N/A** means the capability is outside this reference implementation; the reason is recorded.

| ASVS 5.0.0 requirement | GuardMesh control and evidence | Status | Follow-up / limitation |
| --- | --- | --- | --- |
| V1.2.4 | Kysely/`pg` queries and migrations use parameterized SQL; workspace tests and `pnpm typecheck` cover the data-access code. | Verified | Add a dedicated SQL injection negative suite before production use. |
| V2.1.1 | API schemas and validation rules are represented by Zod contracts and OpenAPI generation. | Verified | Review every published contract at release time. |
| V2.2.1 | Zod validation rejects malformed order, inventory, and security inputs; API tests cover bad requests. | Verified | Full abuse/fuzz corpus remains release work. |
| V2.3.3 | Orders, inventory reservation, inbox, outbox, and security updates use database transactions; service tests cover rollback/idempotency paths. | Verified | Crash/fault evidence is still narrower than a production outage drill. |
| V2.3.4 | Inventory reservation uses conditional updates/locking and concurrent reservation tests. | Verified | Multi-replica load evidence is not yet recorded. |
| V3.4.2 | No permissive application CORS policy is configured for the local API. | Partial | A deployed origin allowlist and browser-origin test are required. |
| V3.4.3 | The local demo does not claim a production CSP. | Gap | Add and test a deployment-specific CSP before internet exposure. |
| V3.4.4 | The local Compose gateway is HTTP-only and does not provide a production header baseline. | Gap | Add TLS/security headers in the deployment profile and verify them externally. |
| V4.1.1 | Nest/Fastify responses and the global exception filter emit JSON content types; runtime smoke exercises health and API responses. | Verified | Expand response-header assertions to every public route. |
| V4.1.3 | Service authorization does not trust caller-supplied identity headers; actor identity comes from verified token claims and server mapping. | Partial | Forwarded-header trust must be verified at the real TLS ingress. |
| V6.8.2 | `packages/guardmesh-auth/test/jwt-verifier.test.ts` rejects invalid signatures and accepts only configured issuer/audience/algorithm claims. | Verified | Exercise live Keycloak key rotation in CI. |
| V7.2.1 | JWT verification runs in the API process through the shared auth package; browser tokens remain in memory. | Verified | The SPA architecture is local-demo scope, not a BFF. |
| V8.1.1 | Authorization rules are documented in Rego and service/controller tests; resource and location attributes are part of each decision. | Verified | Keep policy and API contract changes in the same reviewed change. |
| V8.2.1 | Protected controllers use guards and the service layer calls OPA before business effects. | Verified | Add a shared adapter package conformance suite for future services. |
| V8.2.2 | Cross-location and wrong-role tests cover object-level authorization; direct service calls remain protected. | Verified | Full gateway/direct-bypass matrix is still a release evidence task. |
| V8.3.1 | Orders, Inventory, and Security enforce decisions in trusted service code rather than relying on the React client or gateway. | Verified | Production network isolation remains separate work. |
| V9.1.1 | `jose` verifies JWT signatures with the configured remote JWKS; forged/untrusted-key tests pass. | Verified | Key rotation refresh behavior needs a live provider test. |
| V9.1.2 | Verification restricts accepted algorithms to `RS256`; unsigned and wrong-algorithm tokens are rejected by the verifier configuration. | Verified | Keep the algorithm allowlist reviewed with the IdP configuration. |
| V9.1.3 | JWKS URI is operator-configured and never taken from token headers; issuer and key-source configuration are explicit. | Verified | Validate issuer/JWKS HTTPS and trust boundaries in deployment. |
| V9.2.1 | Expiry and required claims are enforced; expired-token tests pass. | Verified | Add explicit `nbf` and clock-skew cases. |
| V9.2.3 | The configured audience is validated for every API verifier; wrong-audience tests pass. | Verified | Keep per-service audience policy explicit if audiences split later. |
| V10.2.1 | The demo uses Authorization Code + PKCE; state and nonce validation tests pass. | Verified | Browser Playwright evidence is still missing. |
| V10.3.1 | Resource servers validate the access-token audience before authorization. | Verified | Verify the same behavior through the deployed ingress profile. |
| V10.3.2 | Scope, subject/authorized-party mapping, roles, and location are used in protected decisions. | Verified | Service-token rotation and revocation evidence remains open. |

## Release blockers still visible

The matrix intentionally records unresolved release work rather than hiding it:

1. Production TLS, CSP, CORS, trusted-proxy, and private management-path verification.
2. Live Keycloak/JWKS rotation and service-credential rotation tests.
3. Playwright browser smoke, k6 results with raw artifacts, and fault/recovery reports.
4. A complete external-ingress/direct-service bypass matrix and selected ASVS retest.

Until those items have evidence, GuardMesh remains a local reference implementation
and must not be described as production-ready.
