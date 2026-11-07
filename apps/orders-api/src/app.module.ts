import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { createAccessTokenVerifier } from "@guardmesh/auth";
import type { OrderRepository } from "@guardmesh/orders-domain";
import { GuardMeshAccessTokenGuard, OpaPolicyClient, PolicyEnforcementAdapter } from "@guardmesh/nest";
import { OrdersService, PostgresOrderRepository, createOrdersDatabase } from "@guardmesh/orders-service";

import { actorDirectoryFromEnvironment } from "./actor-directory.js";
import { AccessTokenGuard, ORDERS_ACTOR_DIRECTORY, ORDERS_TOKEN_VERIFIER } from "./auth.guard.js";
import { HealthController, MetricsController, OrdersController } from "./orders.controller.js";

const repositoryToken = "ORDERS_REPOSITORY";
const policyToken = "POLICY_ADAPTER";

@Module({
  controllers: [OrdersController, HealthController, MetricsController],
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
    { provide: ORDERS_ACTOR_DIRECTORY, useFactory: actorDirectoryFromEnvironment },
    {
      provide: ORDERS_TOKEN_VERIFIER,
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
          randomUUID,
        ),
      inject: [repositoryToken, policyToken],
    },
    {
      provide: AccessTokenGuard,
      useFactory: GuardMeshAccessTokenGuard.create,
      inject: [ORDERS_TOKEN_VERIFIER, ORDERS_ACTOR_DIRECTORY],
    },
  ],
})
export class AppModule {}
