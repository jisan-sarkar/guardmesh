import { Module } from "@nestjs/common";

import { createAccessTokenVerifier } from "@guardmesh/auth";
import { InMemorySecurityEventStore, SecurityAlertEvaluator } from "@guardmesh/security-core";
import { PostgresSecurityEventStore, SecurityService, createSecurityDatabase } from "@guardmesh/security-service";

import { actorDirectoryFromEnvironment } from "./actor-directory.js";
import { SecurityAuthGuard, SecurityOperatorGuard, SecurityProducerGuard } from "./auth.guard.js";
import { HealthController, SecurityController } from "./security.controller.js";

const verifierToken = "TOKEN_VERIFIER";
const directoryToken = "ACTOR_DIRECTORY";

@Module({
  controllers: [SecurityController, HealthController],
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
          { denialThreshold: 5, policyFailureThreshold: 3, windowMs: 60_000 },
        );
        return new SecurityService(store, evaluator);
      },
    },
    { provide: directoryToken, useFactory: actorDirectoryFromEnvironment },
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
      provide: SecurityAuthGuard,
      useFactory: (
        verifyToken: ReturnType<typeof createAccessTokenVerifier>,
        directory: ReturnType<typeof actorDirectoryFromEnvironment>,
      ) => new SecurityAuthGuard(verifyToken, directory),
      inject: [verifierToken, directoryToken],
    },
    SecurityProducerGuard,
    SecurityOperatorGuard,
  ],
})
export class AppModule {}
