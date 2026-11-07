# GuardMesh NestJS enforcement adapter

`@guardmesh/nest` is the shared enforcement boundary used by the Orders and
Inventory APIs. It owns the mechanics that must remain identical across those
services:

- strict bearer-token extraction and shared `401` behavior;
- issuer, audience, expiry, algorithm, and trusted-JWKS verification through
  `@guardmesh/auth`;
- server-owned actor resolution from `sub`, with the explicit machine-client
  `azp` fallback;
- common accepted/rejected authentication metrics;
- fail-closed behavior when verification or actor resolution fails.

The package deliberately does not own business repositories, resource
locations, action names, or state transitions. Each service supplies its own
actor directory and keeps its own OPA actions and business authorization
calls. The package re-exports the shared OPA client/enforcement types so API
modules can depend on one integration boundary without sharing service data.

The contract is exercised by `packages/guardmesh-nest/test/access-token.guard.test.ts`
and consumed by both `apps/orders-api` and `apps/inventory-api`. Security API
event-specific guards remain local because their producer/operator semantics
are service-owned.
