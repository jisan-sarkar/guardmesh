import { Module } from "@nestjs/common";

import { createAccessTokenVerifier } from "@guardmesh/auth";
import { InMemorySecurityEventStore, SecurityAlertEvaluator } from "@guardmesh/security-core";
import { PostgresSecurityEventStore, SecurityService, createSecurityDatabase } from "@guardmesh/security-service";

import { actorDirectoryFromEnvironment } from "./actor-directory.js";
import { SECURITY_ACTOR_DIRECTORY, SECURITY_TOKEN_VERIFIER, SecurityAuthGuard, SecurityOperatorGuard, SecurityProducerGuard } from "./auth.guard.js";
import { HealthController, MetricsController, SecurityController } from "./security.controller.js";


@Module({
  controllers: [SecurityController, HealthController, MetricsController],
  providers: [
    {
      provide: SecurityService,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        const store = connectionString
          ? new PostgresSecurityEventStore(createSecurityDatabase(connectionString))
          : new InMemorySecurityEventStore();
        const evaluator = new SecurityAlertEvaluator(
          store,
          () => crypto.randomUUID(),
          () => new Date().toISOString(),
          { denialThreshold: 10, policyFailureThreshold: 3, windowMs: 300_000 },
        );
        return new SecurityService(store, evaluator);
      },
    },
    { provide: SECURITY_ACTOR_DIRECTORY, useFactory: actorDirectoryFromEnvironment },
    {
      provide: SECURITY_TOKEN_VERIFIER,
      useFactory: () => {
        const issuer = process.env.OIDC_ISSUER;
        const audience = process.env.OIDC_AUDIENCE;
        const jwksUri = process.env.OIDC_JWKS_URI;
        if (!issuer || !audience || !jwksUri) throw new Error("OIDC configuration is required");
        return createAccessTokenVerifier({ issuer, audience, jwksUri: new URL(jwksUri) });
      },
    },
    SecurityAuthGuard,
    SecurityProducerGuard,
    SecurityOperatorGuard,
  ],
})
export class AppModule {}
