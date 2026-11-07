import { Module } from "@nestjs/common";

import { createAccessTokenVerifier } from "@guardmesh/auth";
import type { InventoryState } from "@guardmesh/inventory-domain";
import { OpaPolicyClient, PolicyEnforcementAdapter } from "@guardmesh/nest";
import { InventoryService, InMemoryInventoryStore, PostgresInventoryStore, createInventoryDatabase } from "@guardmesh/inventory-service";

import { actorDirectoryFromEnvironment } from "./actor-directory.js";
import { AccessTokenGuard, InternalCatalogScopeGuard, INVENTORY_ACTOR_DIRECTORY, INVENTORY_TOKEN_VERIFIER } from "./auth.guard.js";
import { HealthController, InternalInventoryController, InventoryController, MetricsController } from "./inventory.controller.js";

const policyToken = "POLICY_ADAPTER";

function inventoryStateFromEnvironment(): InventoryState {
  const raw = process.env.INVENTORY_STATE_JSON ?? '{"items":{},"reservations":{}}';
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("INVENTORY_STATE_JSON must be an object");
  }
  return parsed as InventoryState;
}

@Module({
  controllers: [InventoryController, InternalInventoryController, HealthController, MetricsController],
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
    { provide: INVENTORY_ACTOR_DIRECTORY, useFactory: actorDirectoryFromEnvironment },
    {
      provide: INVENTORY_TOKEN_VERIFIER,
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
    AccessTokenGuard,
    InternalCatalogScopeGuard,
  ],
})
export class AppModule {}
