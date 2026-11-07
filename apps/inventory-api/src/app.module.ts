import { Module } from "@nestjs/common";

import { createAccessTokenVerifier } from "@guardmesh/auth";
import type { InventoryState } from "@guardmesh/inventory-domain";
import { InventoryService, InMemoryInventoryStore, PostgresInventoryStore, createInventoryDatabase } from "@guardmesh/inventory-service";
import { OpaPolicyClient, PolicyEnforcementAdapter } from "@guardmesh/policy";

import { actorDirectoryFromEnvironment } from "./actor-directory.js";
import { AccessTokenGuard } from "./auth.guard.js";
import { HealthController, InventoryController } from "./inventory.controller.js";

const policyToken = "POLICY_ADAPTER";
const actorDirectoryToken = "ACTOR_DIRECTORY";
const verifierToken = "TOKEN_VERIFIER";

function inventoryStateFromEnvironment(): InventoryState {
  const raw = process.env.INVENTORY_STATE_JSON ?? '{"items":{},"reservations":{}}';
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("INVENTORY_STATE_JSON must be an object");
  }
  return parsed as InventoryState;
}

@Module({
  controllers: [InventoryController, HealthController],
  providers: [
    {
      provide: policyToken,
      useFactory: () => {
        const endpoint = process.env.OPA_POLICY_URL;
        if (!endpoint) throw new Error("OPA_POLICY_URL is required");
        return new PolicyEnforcementAdapter(
          new OpaPolicyClient({ endpoint: new URL(endpoint), timeoutMs: 500 }),
        );
      },
    },
    { provide: actorDirectoryToken, useFactory: actorDirectoryFromEnvironment },
    {
      provide: verifierToken,
      useFactory: () => {
        const issuer = process.env.OIDC_ISSUER;
        const audience = process.env.OIDC_AUDIENCE;
        const jwksUri = process.env.OIDC_JWKS_URI;
        if (!issuer || !audience || !jwksUri) throw new Error("OIDC configuration is required");
        return createAccessTokenVerifier({ issuer, audience, jwksUri: new URL(jwksUri) });
      },
    },
    {
      provide: InventoryService,
      useFactory: (policy: PolicyEnforcementAdapter) => {
        const connectionString = process.env.DATABASE_URL;
        const store = connectionString
          ? new PostgresInventoryStore(createInventoryDatabase(connectionString))
          : new InMemoryInventoryStore(inventoryStateFromEnvironment());
        return new InventoryService(store, policy);
      },
      inject: [policyToken],
    },
    {
      provide: AccessTokenGuard,
      useFactory: (
        verifyToken: ReturnType<typeof createAccessTokenVerifier>,
        actorDirectory: ReturnType<typeof actorDirectoryFromEnvironment>,
      ) => new AccessTokenGuard(verifyToken, actorDirectory),
      inject: [verifierToken, actorDirectoryToken],
    },
  ],
})
export class AppModule {}
