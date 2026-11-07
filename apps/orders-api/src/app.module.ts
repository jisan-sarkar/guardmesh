import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { createAccessTokenVerifier } from "@guardmesh/auth";
import type { OrderRepository } from "@guardmesh/orders-domain";
import { OpaPolicyClient, PolicyEnforcementAdapter } from "@guardmesh/policy";
import { OrdersService, PostgresOrderRepository, createOrdersDatabase } from "@guardmesh/orders-service";

import { actorDirectoryFromEnvironment } from "./actor-directory.js";
import { AccessTokenGuard } from "./auth.guard.js";
import { HealthController, OrdersController } from "./orders.controller.js";

const repositoryToken = "ORDERS_REPOSITORY";
const policyToken = "POLICY_ADAPTER";
const actorDirectoryToken = "ACTOR_DIRECTORY";
const verifierToken = "TOKEN_VERIFIER";

@Module({
  controllers: [OrdersController, HealthController],
  providers: [
    {
      provide: repositoryToken,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error("DATABASE_URL is required");
        return new PostgresOrderRepository(createOrdersDatabase(connectionString));
      },
    },
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
      provide: OrdersService,
      useFactory: (repository: OrderRepository, policy: PolicyEnforcementAdapter) =>
        new OrdersService(
          repository,
          policy,
          randomUUID,
          () => new Date().toISOString(),
        ),
      inject: [repositoryToken, policyToken],
    },
    {
      provide: AccessTokenGuard,
      useFactory: (verifyToken: ReturnType<typeof createAccessTokenVerifier>, actorDirectory: ReturnType<typeof actorDirectoryFromEnvironment>) =>
        new AccessTokenGuard(verifyToken, actorDirectory),
      inject: [verifierToken, actorDirectoryToken],
    },
  ],
})
export class AppModule {}
